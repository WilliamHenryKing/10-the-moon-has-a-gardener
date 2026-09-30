"""The real lunar south pole around the gardener's basin (NASA LOLA topography, public domain).

The basin (src/world/terrain-gen.ts) is set on the Connecting ridge between Shackleton and
de Gerlache, and everything beyond it is the real Moon, from NASA's Lunar Orbiter Laser Altimeter:
- a near grid, 12 m over ±6 km, from the 5 m/pix landing-site DEMs (Barker et al. 2021) where
  they reach, and the 80 m/pix polar mosaic elsewhere;
- a middle grid, 80 m over ±40 km: Shackleton's 4 km-deep bowl and de Gerlache;
- a far grid, 400 m over ±150 km (box-filtered): the highlands out to Malapert massif, on the
  horizon under Earth.
Both are bent down by the Moon's curvature (on a 1737 km sphere the ground drops about 5 km over
130 km), rotated so that the lunar nearside (where Earth hangs) lies in the game's Earth azimuth,
and blended into the basin's rim.

On the GPU (CUDA via NVIDIA Warp) it then marches horizon maps: for 16 azimuths, how high the
skyline stands from each texel. At runtime the moving Sun is visible from a texel when it
clears that skyline, which gives true mountain shadows for any hour almost for free.

Sources (assets-src/lola/, git-ignored; https://pgda.gsfc.nasa.gov):
  LOLA_5mpp/Site01/Site01_final_adj_5mpp_surf.tif   Connecting ridge, 5 m/pix
  LOLA_5mpp/Site04/Site04_final_adj_5mpp_surf.tif   Shackleton rim, 5 m/pix
  LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF                 80-90 S mosaic, 80 m/pix

Run: tools/bake/.venv/Scripts/python.exe tools/bake/lola.py
Writes public/lunar/ and a preview in bake/work/lunar/.
"""

from __future__ import annotations

import gzip
import json
import math
import time
from pathlib import Path

import numpy as np
import tifffile
import warp as wp
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SRC = ROOT / "assets-src" / "lola"
OUT = ROOT / "public" / "lunar"
WORK = ROOT / "bake" / "work" / "lunar"
wp.config.kernel_cache_dir = str(HERE / ".cache")
wp.config.log_level = wp.LOG_WARNING

MOON_R = 1737400.0
EARTH_AZIMUTH = 8.0  # degrees east of north (src/world/sky-model.ts)
PLAIN_HEIGHT = 12.0  # the plain around the basin: 10 m under its rim crest (terrain-gen.ts rimHeight 22)
BASIN_CLEAR = 300.0  # inside this radius the game's own basin stands
BASIN_BLEND = 700.0  # real terrain takes over fully by here
# Relief is exaggerated 1.6× about the plain, as NASA's own visualisations of the pole often are:
# at true scale the ridge's hills barely clear the basin's rim.
RELIEF = 1.6
AZIMUTHS = 16
NEAR = (6000.0, 12.0)
MID = (40000.0, 80.0)
FAR = (150000.0, 400.0)
NEAR_HALF = wp.constant(NEAR[0])
NEAR_STEP = wp.constant(NEAR[1])
MID_HALF = wp.constant(MID[0])
MID_STEP = wp.constant(MID[1])
FAR_HALF = wp.constant(FAR[0])
FAR_STEP = wp.constant(FAR[1])


def read_geotiff(path: Path):
    with tifffile.TiffFile(path) as t:
        p = t.pages[0]
        tags = {k.name: k.value for k in p.tags.values()}
        a = p.asarray().astype(np.float32)
    tie = tags["ModelTiepointTag"]
    scale = tags["ModelPixelScaleTag"]
    # Pixel-registered: (tie[3], tie[4]) is the corner of the first pixel (GMT convention in
    # the README speaks of centres; the half-pixel is immaterial at these scales).
    return {"z": a, "x0": float(tie[3]), "y1": float(tie[4]), "s": float(scale[0])}


def sample(grid, X: np.ndarray, Y: np.ndarray) -> np.ndarray:
    """Bilinear heights at stereographic X, Y (NaN outside)."""
    z = grid["z"]
    h, w = z.shape
    u = (X - grid["x0"]) / grid["s"] - 0.5
    v = (grid["y1"] - Y) / grid["s"] - 0.5
    ok = (u >= 0) & (v >= 0) & (u < w - 1) & (v < h - 1)
    i = np.clip(np.floor(u).astype(np.int64), 0, w - 2)
    j = np.clip(np.floor(v).astype(np.int64), 0, h - 2)
    fu = (u - i).astype(np.float32)
    fv = (v - j).astype(np.float32)
    a = z[j, i] * (1 - fu) + z[j, i + 1] * fu
    b = z[j + 1, i] * (1 - fu) + z[j + 1, i + 1] * fu
    out = a * (1 - fv) + b * fv
    out[~ok] = np.nan
    return out


def choose_basin(site) -> tuple[float, float]:
    """A gentle, high spot on the ridge: the highest point whose surroundings (400 m) are gentle,
    well inside the tile."""
    z = site["z"]
    s = site["s"]
    k = int(50 / s)
    zc = z[::k, ::k]  # 50 m
    gy, gx = np.gradient(zc, 50.0)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    r = int(400 / 50)
    h, w = zc.shape
    best = None
    for j in range(r + 20, h - r - 20):
        for i in range(r + 20, w - r - 20):
            win = slope[j - r : j + r + 1, i - r : i + r + 1]
            if np.nanmax(win) > 9 or np.nanmean(win) > 4:
                continue
            score = zc[j, i]
            if best is None or score > best[0]:
                best = (score, i, j)
    if best is None:
        raise RuntimeError("no gentle spot found")
    _, i, j = best
    X = site["x0"] + (i * k + k / 2) * s
    Y = site["y1"] - (j * k + k / 2) * s
    return X, Y


def to_stereo(cx: float, cy: float, gx: np.ndarray, gz: np.ndarray):
    """Game (x, z) metres about the basin → stereographic X, Y (rotated so the nearside, +Y,
    lies at the game's Earth azimuth)."""
    a = math.radians(EARTH_AZIMUTH)
    # game = [[cos, sin], [sin, -cos]] · (dX, dY)  ⇒  inverse is the same matrix.
    dX = gx * math.cos(a) + gz * math.sin(a)
    dY = gx * math.sin(a) - gz * math.cos(a)
    return cx + dX, cy + dY


@wp.func
def bil(a: wp.array2d(dtype=float), u: float, v: float) -> float:
    n = a.shape[0]
    uu = wp.clamp(u, 0.0, float(n) - 1.001)
    vv = wp.clamp(v, 0.0, float(n) - 1.001)
    i = int(uu)
    j = int(vv)
    fu = uu - float(i)
    fv = vv - float(j)
    return wp.lerp(wp.lerp(a[j, i], a[j, i + 1], fu), wp.lerp(a[j + 1, i], a[j + 1, i + 1], fu), fv)


@wp.func
def height_at(
    near: wp.array2d(dtype=float),
    mid: wp.array2d(dtype=float),
    far: wp.array2d(dtype=float),
    x: float,
    z: float,
) -> float:
    if wp.abs(x) < NEAR_HALF - NEAR_STEP and wp.abs(z) < NEAR_HALF - NEAR_STEP:
        return bil(near, (x + NEAR_HALF) / NEAR_STEP - 0.5, (z + NEAR_HALF) / NEAR_STEP - 0.5)
    if wp.abs(x) < MID_HALF - MID_STEP and wp.abs(z) < MID_HALF - MID_STEP:
        return bil(mid, (x + MID_HALF) / MID_STEP - 0.5, (z + MID_HALF) / MID_STEP - 0.5)
    return bil(far, (x + FAR_HALF) / FAR_STEP - 0.5, (z + FAR_HALF) / FAR_STEP - 0.5)


def pack_u16(h: np.ndarray, path: Path) -> dict:
    """Heights as uint16 ((h + offset) × scale), each row delta-coded, gzip."""
    lo_ = float(np.floor(h.min() - 2))
    span = float(h.max() - lo_ + 2)
    scale = 65000.0 / span
    q = np.clip(np.round((h - lo_) * scale), 0, 65535).astype(np.int32)
    d = q.copy()
    d[:, 1:] = q[:, 1:] - q[:, :-1]
    path.write_bytes(gzip.compress((d & 0xFFFF).astype(np.uint16).tobytes(), 9))
    return {"n": int(h.shape[0]), "offset": -lo_, "scale": scale, "bytes": path.stat().st_size}


def main():
    t0 = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)
    ridge = read_geotiff(SRC / "Site01_final_adj_5mpp_surf.tif")
    rim = read_geotiff(SRC / "Site04_final_adj_5mpp_surf.tif")
    mosaic = read_geotiff(SRC / "LDEM_80S_80MPP_ADJ.TIF")
    # The mosaic may store heights in kilometres.
    if np.nanmax(np.abs(mosaic["z"])) < 50:
        mosaic["z"] *= 1000.0
    print(f"read ({time.time() - t0:.0f} s); ridge {ridge['z'].shape}, rim {rim['z'].shape}, mosaic {mosaic['z'].shape}", flush=True)

    cx, cy = choose_basin(ridge)
    rho = math.hypot(cx, cy)
    lat = -90 + math.degrees(2 * math.atan(rho / (2 * MOON_R)))
    lon = math.degrees(math.atan2(cx, cy)) % 360
    print(f"basin at X {cx:.0f} Y {cy:.0f} (lat {lat:.3f}, lon {lon:.2f})", flush=True)

    def grid(half: float, step: float):
        n = int(round(2 * half / step))
        c = -half + (np.arange(n) + 0.5) * step
        gx, gz = np.meshgrid(c, c)
        return n, gx.astype(np.float64), gz.astype(np.float64)

    def pooled(src, k: int):
        """The mosaic box-filtered k×k (so distant craters do not alias)."""
        z = src["z"]
        h = (z.shape[0] // k) * k
        m = np.nanmean(z[:h, :h].reshape(h // k, k, h // k, k), axis=(1, 3))
        return {"z": m.astype(np.float32), "x0": src["x0"], "y1": src["y1"], "s": src["s"] * k}

    def build(half: float, step: float, sites: bool, src):
        n, gx, gz = grid(half, step)
        X, Y = to_stereo(cx, cy, gx, gz)
        h = sample(src, X, Y)
        if sites:
            for site in (ridge, rim):
                sv = sample(site, X, Y)
                ok = np.isfinite(sv)
                u = (X - site["x0"]) / site["s"]
                v = (site["y1"] - Y) / site["s"]
                n_s = site["z"].shape[0]
                edge = np.minimum.reduce([u, v, n_s - u, n_s - v]) * site["s"]
                w = np.clip(edge / 300.0, 0, 1) * ok
                h = np.where(ok, np.nan_to_num(h) * (1 - w) + np.nan_to_num(sv) * w, h)
        return n, gx, gz, h

    n_near, nx, nz, near = build(*NEAR, True, mosaic)
    n_mid, mx, mz, mid = build(*MID, False, mosaic)
    n_far, fx, fz, far = build(*FAR, False, pooled(mosaic, 5))
    fill = float(np.nanmean(mid))
    near = np.where(np.isfinite(near), near, fill)
    mid = np.where(np.isfinite(mid), mid, fill)
    far = np.where(np.isfinite(far), far, np.nanmin(far))

    # Heights relative to the basin: the ring 300–700 m out sits on the plain below its rim.
    rn = np.hypot(nx, nz)
    ring = (rn > BASIN_CLEAR) & (rn < BASIN_BLEND)
    offset = float(np.median(near[ring])) - PLAIN_HEIGHT

    def settle(h, gx, gz):
        h = h - offset
        r = np.hypot(gx, gz)
        t = np.clip((r - BASIN_CLEAR) / (BASIN_BLEND - BASIN_CLEAR), 0, 1)
        t = t * t * (3 - 2 * t)
        h = PLAIN_HEIGHT + (h - PLAIN_HEIGHT) * RELIEF * t
        # The Moon curves away.
        return (h - r**2 / (2 * MOON_R)).astype(np.float32)

    near = settle(near, nx, nz)
    mid = settle(mid, mx, mz)
    far = settle(far, fx, fz)
    print(f"grids built ({time.time() - t0:.0f} s): near {n_near}², mid {n_mid}², far {n_far}², offset {offset:.0f} m", flush=True)

    # Horizon maps on the GPU, 16 azimuths, each grid at a quarter or so of its height detail.
    wp.init()
    dev = "cuda:0"
    Near = wp.array(near, dtype=float, device=dev)
    Mid = wp.array(mid, dtype=float, device=dev)
    Far = wp.array(far, dtype=float, device=dev)
    maps = {}
    for name, half, step in (("near", NEAR[0], 48.0), ("mid", MID[0], 320.0), ("far", FAR[0], 2000.0)):
        n = int(round(2 * half / step))
        acc = np.zeros((n, n, AZIMUTHS), dtype=np.float32)
        rows = max(1, (1 << 17) // (n * AZIMUTHS))
        for r0 in range(0, n, rows):
            m = min(rows, n - r0)
            sub = wp.zeros((m, n, AZIMUTHS), dtype=float, device=dev)
            wp.launch(horizon_rows, dim=(m, n, AZIMUTHS), inputs=[Near, Mid, Far, half, step, AZIMUTHS, r0, sub], device=dev)
            wp.synchronize_device(dev)
            acc[r0 : r0 + m] = sub.numpy()
        maps[name] = (acc, half, step)
        print(f"horizon {name}: {n}² × {AZIMUTHS} ({time.time() - t0:.0f} s)", flush=True)

    # Export.
    info = {
        "version": 1,
        "source": "NASA LOLA (PGDA): Site01 Connecting ridge, Site04 Shackleton rim 5 m/pix; LDEM_80S_80MPP_ADJ",
        "basin": {"X": cx, "Y": cy, "lat": lat, "lon": lon, "offset": offset},
        "earthAzimuth": EARTH_AZIMUTH,
        "relief": RELIEF,
        "moonRadius": MOON_R,
        "grids": {
            "near": {"half": NEAR[0], "step": NEAR[1], "height": pack_u16(near, OUT / "near-h.bin.gz")},
            "mid": {"half": MID[0], "step": MID[1], "height": pack_u16(mid, OUT / "mid-h.bin.gz")},
            "far": {"half": FAR[0], "step": FAR[1], "height": pack_u16(far, OUT / "far-h.bin.gz")},
        },
        "horizon": {"azimuths": AZIMUTHS, "maxRadians": 0.5},
    }
    for name, (acc, half, step) in maps.items():
        # Angles −0.25 … +0.5 rad in 8 bits, four azimuths to an RGBA layer, the layers one after
        # another (raw and gzipped: a browser's image decoder would premultiply the alpha channel).
        # Each row is delta-coded along x, as a PNG filter would.
        q = np.clip((acc + 0.25) / 0.75 * 255 + 0.5, 0, 255).astype(np.int16)
        q[:, 1:] = (q[:, 1:] - q[:, :-1]) & 0xFF
        q = q.astype(np.uint8)
        layers = np.stack([q[:, :, p * 4 : p * 4 + 4] for p in range(AZIMUTHS // 4)])
        fn = f"{name}-horizon.bin.gz"
        (OUT / fn).write_bytes(gzip.compress(np.ascontiguousarray(layers).tobytes(), 9))
        for old in OUT.glob(f"{name}-horizon-*.png"):
            old.unlink()
        info["horizon"][name] = {"half": half, "step": step, "n": int(acc.shape[0]), "file": fn, "layers": AZIMUTHS // 4, "min": -0.25, "max": 0.5}
    # The skyline seen from the basin itself (the game uses it to shade the whole basin).
    sky_near = maps["near"][0]
    c = sky_near.shape[0] // 2
    info["horizon"]["basin"] = [round(float(v), 4) for v in sky_near[c, c]]
    (OUT / "lunar.json").write_text(json.dumps(info, indent=1), newline="\n")

    # Previews: hillshade of the far grid and the skyline around the basin.
    def shade(h, step):
        gz_, gx_ = np.gradient(h.astype(np.float64), step)
        sun = np.array([math.sin(math.radians(60)), math.sin(math.radians(20)), -math.cos(math.radians(60))])
        nl = np.sqrt(gx_**2 + gz_**2 + 1)
        lit = np.clip((-gx_ * sun[0] + sun[1] - gz_ * sun[2]) / nl, 0, 1)
        return (np.sqrt(0.08 + 0.92 * lit) * 255).astype(np.uint8)
    Image.fromarray(shade(far, FAR[1])).resize((1000, 1000)).save(WORK / "far-hillshade.jpg", quality=85)
    Image.fromarray(shade(mid, MID[1])).resize((1000, 1000)).save(WORK / "mid-hillshade.jpg", quality=85)
    Image.fromarray(shade(near, NEAR[1])).resize((1000, 1000)).save(WORK / "near-hillshade.jpg", quality=85)
    sky = np.degrees(np.array(info["horizon"]["basin"]))
    print("skyline from the basin (deg, from north clockwise):", " ".join(f"{v:.1f}" for v in sky))
    total = sum(p.stat().st_size for p in OUT.iterdir())
    print(f"done in {time.time() - t0:.0f} s; public/lunar {total / 1e6:.2f} MB", flush=True)


@wp.kernel
def horizon_rows(
    near: wp.array2d(dtype=float),
    mid: wp.array2d(dtype=float),
    far: wp.array2d(dtype=float),
    grid_half: float,
    grid_step: float,
    azimuths: int,
    row0: int,
    out: wp.array3d(dtype=float),
):
    jj, i, k = wp.tid()
    j = jj + row0
    x = -grid_half + (float(i) + 0.5) * grid_step
    z = -grid_half + (float(j) + 0.5) * grid_step
    h0 = height_at(near, mid, far, x, z) + 1.8
    az = float(k) / float(azimuths) * 6.2831853
    dx = wp.sin(az)
    dz = -wp.cos(az)
    best = float(-1.5707963)
    t = float(wp.min(grid_step * 0.5, 6.0))
    while t < 190000.0:
        px = x + dx * t
        pz = z + dz * t
        if wp.abs(px) > FAR_HALF or wp.abs(pz) > FAR_HALF:
            break
        hh = height_at(near, mid, far, px, pz)
        best = wp.max(best, wp.atan2(hh - h0, t))
        t += wp.max(4.0, t * 0.012)
    out[jj, i, k] = best


if __name__ == "__main__":
    main()
