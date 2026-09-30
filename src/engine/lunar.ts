import * as THREE from "three";

// The real south pole around the basin, from NASA's Lunar Orbiter Laser Altimeter (public domain;
// baked by tools/bake/lola.py): three nested height grids, 12 m to ±6 km, 80 m to ±40 km and 400 m
// to ±150 km, already dropped for the Moon's curvature, and for each grid the skyline in sixteen
// directions. The skylines give every point its mountain shadow for wherever the Sun stands.

export type Level = "near" | "mid" | "far";
export const LEVELS: readonly Level[] = ["near", "mid", "far"];

interface GridInfo {
  half: number;
  step: number;
  height: { n: number; offset: number; scale: number };
}

interface HorizonInfo {
  half: number;
  step: number;
  n: number;
  file: string;
  layers: number;
  min: number;
  max: number;
}

export interface LunarInfo {
  source: string;
  basin: { lat: number; lon: number };
  moonRadius: number;
  grids: Record<Level, GridInfo>;
  horizon: { azimuths: number; basin: number[] } & Record<Level, HorizonInfo>;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A square grid of heights, cell centres at −half + (i + ½)·step. */
export class HeightGrid {
  constructor(
    readonly half: number,
    readonly step: number,
    readonly n: number,
    readonly h: Float32Array,
  ) {}

  sample(x: number, z: number) {
    const n = this.n;
    const u = Math.max(0, Math.min(n - 1.001, (x + this.half) / this.step - 0.5));
    const v = Math.max(0, Math.min(n - 1.001, (z + this.half) / this.step - 0.5));
    const i = Math.floor(u);
    const j = Math.floor(v);
    const fu = u - i;
    const fv = v - j;
    const h = this.h;
    const k = j * n + i;
    const a = h[k] as number;
    const b = h[k + 1] as number;
    const c = h[k + n] as number;
    const d = h[k + n + 1] as number;
    return (a + (b - a) * fu) * (1 - fv) + (c + (d - c) * fu) * fv;
  }

  /** 1 well inside, falling to 0 across the outer tenth (where the next grid takes over). */
  weight(x: number, z: number) {
    const m = Math.max(Math.abs(x), Math.abs(z));
    return 1 - smooth(this.half * 0.86, this.half * 0.96, m);
  }
}

export interface Lunar {
  info: LunarInfo;
  grids: Record<Level, HeightGrid>;
  /** Skyline angles: four RGBA layers of four directions each (north, then clockwise). */
  horizon: Record<Level, THREE.DataArrayTexture>;
  /** Ground normals (x, z in RG) from each grid. */
  normals: Record<Level, THREE.DataTexture>;
  /** Height of the real ground, finest grid first. */
  heightAt(x: number, z: number): number;
}

const BASE = `${import.meta.env.BASE_URL}lunar/`;

/** Fetch a gzip file and inflate it (unless the server already did). */
async function inflate(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const buf = await res.arrayBuffer();
  const head = new Uint8Array(buf, 0, 2);
  if (head[0] !== 0x1f || head[1] !== 0x8b) return buf;
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

async function heights(level: Level, g: GridInfo): Promise<HeightGrid> {
  const { n, offset, scale } = g.height;
  const deltas = new Uint16Array(await inflate(`${BASE}${level}-h.bin.gz`));
  const data = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    let q = 0;
    for (let i = 0; i < n; i++) {
      q = (q + (deltas[j * n + i] as number)) & 0xffff;
      data[j * n + i] = q / scale - offset;
    }
  }
  return new HeightGrid(g.half, g.step, n, data);
}

async function horizon(h: HorizonInfo): Promise<THREE.DataArrayTexture> {
  const n = h.n;
  const raw = new Uint8Array(await inflate(`${BASE}${h.file}`));
  // Rows are delta-coded along x, per channel.
  const data = new Uint8Array(raw.length);
  for (let p = 0; p < h.layers; p++)
    for (let j = 0; j < n; j++) {
      const row = (p * n + j) * n * 4;
      for (let c = 0; c < 4; c++) {
        let q = 0;
        for (let i = 0; i < n; i++) {
          q = (q + (raw[row + i * 4 + c] as number)) & 0xff;
          data[row + i * 4 + c] = q;
        }
      }
    }
  const tex = new THREE.DataArrayTexture(data, n, n, h.layers);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function normalMap(g: HeightGrid): THREE.DataTexture {
  const { n, h, step } = g;
  const data = new Uint8Array(n * n * 2);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const l = h[j * n + Math.max(0, i - 1)] as number;
      const r = h[j * n + Math.min(n - 1, i + 1)] as number;
      const u = h[Math.max(0, j - 1) * n + i] as number;
      const d = h[Math.min(n - 1, j + 1) * n + i] as number;
      const gx = (r - l) / (2 * step);
      const gz = (d - u) / (2 * step);
      const len = Math.hypot(gx, 1, gz);
      data[(j * n + i) * 2] = Math.round((-gx / len) * 127.5 + 127.5);
      data[(j * n + i) * 2 + 1] = Math.round((-gz / len) * 127.5 + 127.5);
    }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export async function loadLunar(): Promise<Lunar> {
  const res = await fetch(`${BASE}lunar.json`);
  if (!res.ok) throw new Error(`lunar.json: ${res.status}`);
  const info = (await res.json()) as LunarInfo;
  const [near, mid, far, hn, hm, hf] = await Promise.all([
    heights("near", info.grids.near),
    heights("mid", info.grids.mid),
    heights("far", info.grids.far),
    horizon(info.horizon.near),
    horizon(info.horizon.mid),
    horizon(info.horizon.far),
  ]);
  const grids = { near, mid, far };
  return {
    info,
    grids,
    horizon: { near: hn, mid: hm, far: hf },
    normals: { near: normalMap(near), mid: normalMap(mid), far: normalMap(far) },
    heightAt(x, z) {
      const wm = mid.weight(x, z);
      let h = wm < 1 ? far.sample(x, z) : 0;
      if (wm > 0) h += (mid.sample(x, z) - h) * wm;
      const wn = near.weight(x, z);
      if (wn > 0) h += (near.sample(x, z) - h) * wn;
      return h;
    },
  };
}

/** Where the basin's own ground hands over to the real land: blended across this band. */
export function basinBand(half: number) {
  return { from: half - 6, to: half + 56 };
}

/**
 * The ground everywhere: the basin's own inside its edge, the real land beyond, and between them
 * the basin's outer flank carried on down until the plain takes over.
 */
export function groundHeight(
  basin: { half: number; heightAt(x: number, z: number): number },
  lunar: Pick<Lunar, "heightAt">,
) {
  const half = basin.half;
  const band = basinBand(half);
  return (x: number, z: number) => {
    const r = Math.hypot(x, z);
    if (r <= band.from) return basin.heightAt(x, z);
    const real = lunar.heightAt(x, z);
    const w = smooth(band.from, band.to, r);
    if (w >= 1) return real;
    const e = Math.min(r, half - 2);
    const flank = basin.heightAt((x * e) / r, (z * e) / r) - Math.max(0, r - e) * 0.12;
    return flank + (real - flank) * w;
  };
}

/**
 * The steepest skyline (as a tangent) seen from a point toward a horizontal direction, over the
 * ground beyond `from` metres of the basin's centre and out to `reach`: the hills around, which
 * the basin's own shadow pass does not see past its edge.
 */
export function farHorizon(
  height: (x: number, z: number) => number,
  x: number,
  y: number,
  z: number,
  dx: number,
  dz: number,
  from: number,
  reach = 6000,
) {
  let best = -Infinity;
  let dist = 0;
  let step = 1;
  while (dist < reach) {
    dist += step;
    step *= 1.06;
    const px = x + dx * dist;
    const pz = z + dz * dist;
    if (px * px + pz * pz < from * from) continue;
    const t = (height(px, pz) - y) / dist;
    if (t > best) best = t;
  }
  return best;
}
