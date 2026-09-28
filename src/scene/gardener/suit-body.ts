// The gardener's suit, generated at load rather than downloaded (built in a worker,
// suit-body.worker.ts). The soft suit is one continuous signed-distance sculpt: pelvis, waist,
// arms and legs, with accordion bellows at elbows, knees and waist. It is meshed, snapped to the
// surface and skinned to the rig in rig.ts by its own part fields. The hard parts are sculpted
// separately and ride rigidly on one bone each:
// - the hard upper torso and its bearings;
// - the helmet with its gold visor and lamps;
// - the life-support pack, which doubles as the seed pack, with clear seed canisters;
// - the chest display, the gloves and the boots.
// Pure and deterministic.

import {
  blend,
  capsule,
  carve,
  clip,
  ellipsoid,
  len,
  roundBox,
  type Sdf,
  sphere,
  surfaceNets,
  torus,
  union,
  type Vec3,
} from "../../engine/sdf";
import { type BoneName, bindOf, boneIndex } from "./rig";

export interface SuitMesh {
  positions: Float32Array;
  normals: Float32Array;
  joints: Uint8Array;
  weights: Uint8Array;
  /** Accent colour, bellows crease, seam, and how much lunar dust gathers here (0–255). */
  region: Uint8Array;
  indices: Uint32Array;
}

export type PartMaterial =
  | "shell"
  | "metal"
  | "visor"
  | "glove"
  | "boot"
  | "sole"
  | "pack"
  | "screen"
  | "glass"
  | "seedA"
  | "seedB"
  | "seedC"
  | "lamp";

export interface RigidPart {
  name: string;
  bone: BoneName;
  material: PartMaterial;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ss = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const norm = (v: Vec3): Vec3 => {
  const l = len(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Parameter of the closest point on segment ab, 0 … 1. */
const along = (p: Vec3, a: Vec3, b: Vec3) => {
  const bx = b[0] - a[0];
  const by = b[1] - a[1];
  const bz = b[2] - a[2];
  return clamp(
    ((p[0] - a[0]) * bx + (p[1] - a[1]) * by + (p[2] - a[2]) * bz) / (bx * bx + by * by + bz * bz),
    0,
    1,
  );
};

interface Rings {
  /** Where along the limb the bellows sit (0 at a, 1 at b), how wide, how many ridges. */
  at: number;
  width: number;
  count: number;
  depth: number;
}

/** A tapered limb with accordion bellows: ridges ring the fabric around a joint. */
function limb(a: Vec3, b: Vec3, r0: number, r1: number, rings: Rings[]): Sdf {
  const base = capsule(a, b, r0 + 0.012, r1 + 0.012);
  return {
    d: (x, y, z) => {
      const t = along([x, y, z], a, b);
      const px = a[0] + (b[0] - a[0]) * t;
      const py = a[1] + (b[1] - a[1]) * t;
      const pz = a[2] + (b[2] - a[2]) * t;
      let r = r0 + (r1 - r0) * t;
      for (const ring of rings) {
        const u = (t - ring.at) / ring.width;
        if (Math.abs(u) < 0.5) {
          const wave = 0.5 + 0.5 * Math.cos(u * Math.PI * 2 * ring.count);
          r += ring.depth * wave * Math.cos(u * Math.PI);
        }
      }
      return len(x - px, y - py, z - pz) - r;
    },
    box: base.box,
  };
}

/** How far into a ring's crease a point on the limb sits (for darkening), 0 … 1. */
function crease(a: Vec3, b: Vec3, rings: Rings[], p: Vec3) {
  const t = along(p, a, b);
  let c = 0;
  for (const ring of rings) {
    const u = (t - ring.at) / ring.width;
    if (Math.abs(u) < 0.5)
      c = Math.max(c, (0.5 - 0.5 * Math.cos(u * Math.PI * 2 * ring.count)) * Math.cos(u * Math.PI));
  }
  return c;
}

interface Part {
  sdf: Sdf;
  bones: (p: Vec3) => Partial<Record<BoneName, number>>;
  region?: (p: Vec3) => [number, number, number];
}

// ---- the soft suit -------------------------------------------------------------------------------
const parts: Part[] = [];
const add = (p: Part) => {
  parts.push(p);
  return p.sdf;
};
const side = (s: number, l: BoneName, r: BoneName) => (s < 0 ? l : r);

const pelvis = add({
  sdf: ellipsoid([0.185, 0.14, 0.15], [0, 0.99, 0.005]),
  bones: (p) => {
    const legs = 0.6 * (1 - ss(0.86, 1.0, p[1])) * ss(0.04, 0.12, Math.abs(p[0]));
    return { [p[0] < 0 ? "thighL" : "thighR"]: legs, hips: 1 - legs };
  },
});
const WAIST: Rings[] = [{ at: 0.45, width: 0.5, count: 3, depth: 0.007 }];
const waistA: Vec3 = [0, 1.02, 0];
const waistB: Vec3 = [0, 1.25, 0];
const waist = add({
  sdf: limb(waistA, waistB, 0.158, 0.162, WAIST),
  bones: (p) => {
    const c = ss(1.1, 1.24, p[1]);
    return { chest: c, spine: 1 - c };
  },
  region: (p) => [0, crease(waistA, waistB, WAIST, p), 0],
});
const chestSoft = add({
  sdf: ellipsoid([0.205, 0.17, 0.148], [0, 1.37, 0.004]),
  bones: () => ({ chest: 1 }),
});

const shoulder = (s: number): Vec3 => [s * 0.25, 1.44, 0];
const elbow = (s: number): Vec3 => [s * 0.29, 1.18, 0.02];
const wrist = (s: number): Vec3 => [s * 0.31, 0.975, -0.01];
const ELBOW_UP: Rings[] = [{ at: 0.9, width: 0.26, count: 3, depth: 0.007 }];
const ELBOW_DOWN: Rings[] = [{ at: 0.06, width: 0.14, count: 1.5, depth: 0.006 }];
const upperArm = (s: number) =>
  add({
    sdf: limb(shoulder(s), elbow(s), 0.07, 0.064, ELBOW_UP),
    bones: (p) => {
      const f = ss(0.86, 1, along(p, shoulder(s), elbow(s)));
      return { [side(s, "armL", "armR")]: 1 - f, [side(s, "foreArmL", "foreArmR")]: f };
    },
    region: (p) => {
      const t = along(p, shoulder(s), elbow(s));
      const band = ss(0.28, 0.31, t) * (1 - ss(0.44, 0.47, t));
      return [band, crease(shoulder(s), elbow(s), ELBOW_UP, p), 0];
    },
  });
const foreArm = (s: number) =>
  add({
    sdf: limb(elbow(s), wrist(s), 0.062, 0.052, ELBOW_DOWN),
    bones: (p) => {
      const f = ss(0.88, 1, along(p, elbow(s), wrist(s)));
      return { [side(s, "foreArmL", "foreArmR")]: 1 - f, [side(s, "handL", "handR")]: f };
    },
    region: (p) => [0, crease(elbow(s), wrist(s), ELBOW_DOWN, p), 0],
  });

const hip = (s: number): Vec3 => [s * 0.1, 0.95, 0];
const knee = (s: number): Vec3 => [s * 0.11, 0.52, -0.018];
const ankle = (s: number): Vec3 => [s * 0.11, 0.17, 0.01];
const KNEE_UP: Rings[] = [{ at: 0.9, width: 0.24, count: 3, depth: 0.009 }];
const KNEE_DOWN: Rings[] = [{ at: 0.07, width: 0.16, count: 1.5, depth: 0.008 }];
const thigh = (s: number) =>
  add({
    sdf: limb(hip(s), knee(s), 0.096, 0.082, KNEE_UP),
    bones: (p) => {
      const f = ss(0.86, 1, along(p, hip(s), knee(s)));
      return { [side(s, "thighL", "thighR")]: 1 - f, [side(s, "shinL", "shinR")]: f };
    },
    region: (p) => {
      const t = along(p, hip(s), knee(s));
      const band = ss(0.16, 0.19, t) * (1 - ss(0.3, 0.33, t));
      return [band, crease(hip(s), knee(s), KNEE_UP, p), 0];
    },
  });
const shin = (s: number) =>
  add({
    sdf: limb(knee(s), ankle(s), 0.08, 0.07, KNEE_DOWN),
    bones: (p) => {
      const f = ss(0.9, 1, along(p, knee(s), ankle(s)));
      return { [side(s, "shinL", "shinR")]: 1 - f, [side(s, "footL", "footR")]: f };
    },
    region: (p) => [0, crease(knee(s), ankle(s), KNEE_DOWN, p), 0],
  });

const trunk = blend(0.05, pelvis, waist, chestSoft);
const suit: Sdf = blend(
  0.03,
  trunk,
  upperArm(-1),
  upperArm(1),
  foreArm(-1),
  foreArm(1),
  thigh(-1),
  thigh(1),
  shin(-1),
  shin(1),
);

const gradient = (sdf: Sdf, x: number, y: number, z: number): Vec3 => {
  const e = 0.0005;
  return norm([
    sdf.d(x + e, y, z) - sdf.d(x - e, y, z),
    sdf.d(x, y + e, z) - sdf.d(x, y - e, z),
    sdf.d(x, y, z + e) - sdf.d(x, y, z - e),
  ]);
};

function snapped(sdf: Sdf, voxel: number) {
  const net = surfaceNets(sdf, voxel);
  const p = net.positions;
  const normals = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    let x = p[i] as number;
    let y = p[i + 1] as number;
    let z = p[i + 2] as number;
    const d = sdf.d(x, y, z);
    const g = gradient(sdf, x, y, z);
    x -= g[0] * d;
    y -= g[1] * d;
    z -= g[2] * d;
    p[i] = x;
    p[i + 1] = y;
    p[i + 2] = z;
    normals.set(gradient(sdf, x, y, z), i);
  }
  return { positions: p, normals, indices: net.indices };
}

export function buildSuit(voxel: number): SuitMesh {
  const { positions, normals, indices } = snapped(suit, voxel);
  const count = positions.length / 3;
  const joints = new Uint8Array(count * 4);
  const weights = new Uint8Array(count * 4);
  const region = new Uint8Array(count * 4);
  const own = new Float64Array(parts.length);
  const TAU = 0.02;
  for (let i = 0; i < count; i++) {
    const p: Vec3 = [
      positions[i * 3] as number,
      positions[i * 3 + 1] as number,
      positions[i * 3 + 2] as number,
    ];
    let total = 0;
    parts.forEach((part, k) => {
      const w = Math.exp(-Math.max(0, part.sdf.d(p[0], p[1], p[2])) / TAU);
      own[k] = w;
      total += w;
    });
    const bw = new Map<number, number>();
    const reg = [0, 0, 0];
    parts.forEach((part, k) => {
      const w = (own[k] as number) / total;
      if (w < 1e-4) return;
      for (const [name, v] of Object.entries(part.bones(p)) as [BoneName, number][]) {
        const j = boneIndex(name);
        bw.set(j, (bw.get(j) ?? 0) + w * v);
      }
      const r = part.region?.(p);
      if (r) for (let c = 0; c < 3; c++) reg[c] = (reg[c] as number) + w * (r[c] as number);
    });
    const top = [...bw.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((a, [, v]) => a + v, 0) || 1;
    let left = 255;
    top.forEach(([j, v], k) => {
      const q = Math.floor((v / sum) * 255);
      left -= q;
      joints[i * 4 + k] = j;
      weights[i * 4 + k] = q;
    });
    weights[i * 4] = (weights[i * 4] as number) + left;
    // Dust climbs the legs from the boots and settles on the knees.
    const dust = 1 - ss(0.2, 0.9, p[1]) + 0.4 * (1 - ss(0.02, 0.09, Math.abs(p[1] - 0.52)));
    region.set(
      [
        Math.round(clamp(reg[0] as number, 0, 1) * 255),
        Math.round(clamp(reg[1] as number, 0, 1) * 255),
        0,
        Math.round(clamp(dust, 0, 1) * 255),
      ],
      i * 4,
    );
  }
  return { positions, normals, joints, weights, region, indices };
}

// ---- hard parts ----------------------------------------------------------------------------------
interface HardDef {
  name: string;
  bone: BoneName;
  material: PartMaterial;
  sdf: Sdf;
  voxel: number;
}

function hardParts(): HardDef[] {
  const out: HardDef[] = [];
  const hut = clip(
    blend(
      0.04,
      ellipsoid([0.24, 0.205, 0.17], [0, 1.355, 0.006]),
      ellipsoid([0.205, 0.11, 0.155], [0, 1.47, 0.005]),
    ),
    [0, 0, -1],
    0.175,
  );
  out.push({ name: "hut", bone: "chest", material: "shell", sdf: hut, voxel: 0.007 });
  out.push({
    name: "bearings",
    bone: "chest",
    material: "metal",
    sdf: union(
      torus(0.075, 0.017, [-0.232, 1.44, 0.002], "x"),
      torus(0.075, 0.017, [0.232, 1.44, 0.002], "x"),
      torus(0.166, 0.019, [0, 1.17, 0.004], "y"),
      torus(0.128, 0.021, [0, 1.548, -0.01], "y"),
    ),
    voxel: 0.0045,
  });
  // Helmet: a white shell with the gold visor over its face, lamps on its temples.
  const helmetC: Vec3 = [0, 1.69, -0.012];
  const shell = carve(
    0.01,
    sphere(0.172, helmetC),
    ellipsoid([0.13, 0.095, 0.16], [0, 1.685, -0.15]),
  );
  out.push({ name: "helmet", bone: "head", material: "shell", sdf: shell, voxel: 0.005 });
  const visor = clip(clip(sphere(0.176, helmetC), [0, 0, 1], -0.035), [0, 1, 0], 1.79);
  out.push({
    name: "visor",
    bone: "head",
    material: "visor",
    sdf: clip(visor, [0, -1, 0], -1.59),
    voxel: 0.0045,
  });
  for (const s of [-1, 1]) {
    out.push({
      name: `lamp${s}`,
      bone: "head",
      material: "pack",
      sdf: roundBox([0.02, 0.019, 0.036], 0.008, [s * 0.158, 1.748, -0.052]),
      voxel: 0.0035,
    });
    out.push({
      name: `lens${s}`,
      bone: "head",
      material: "lamp",
      sdf: roundBox([0.014, 0.012, 0.006], 0.004, [s * 0.158, 1.748, -0.089]),
      voxel: 0.0025,
    });
  }
  // Life-support pack, doubling as the seed pack, with a hose round to the chest.
  const pack = blend(
    0.02,
    roundBox([0.215, 0.285, 0.1], 0.05, [0, 1.33, 0.245]),
    roundBox([0.19, 0.05, 0.085], 0.03, [0, 1.63, 0.225]),
  );
  out.push({ name: "pack", bone: "chest", material: "pack", sdf: pack, voxel: 0.008 });
  out.push({
    name: "hose",
    bone: "chest",
    material: "glove",
    sdf: union(
      capsule([0.2, 1.2, 0.2], [0.24, 1.16, 0.07], 0.018),
      capsule([0.24, 1.16, 0.07], [0.12, 1.21, -0.175], 0.018),
    ),
    voxel: 0.005,
  });
  const seeds: PartMaterial[] = ["seedA", "seedB", "seedC"];
  [-0.11, 0, 0.11].forEach((x, k) => {
    out.push({
      name: `canister${k}`,
      bone: "chest",
      material: "glass",
      sdf: capsule([x, 1.22, 0.352], [x, 1.46, 0.352], 0.036),
      voxel: 0.004,
    });
    out.push({
      name: `seeds${k}`,
      bone: "chest",
      material: seeds[k] as PartMaterial,
      sdf: capsule([x, 1.23, 0.352], [x, 1.37 - k * 0.04, 0.352], 0.027),
      voxel: 0.004,
    });
  });
  // Chest display and its screen.
  out.push({
    name: "dcm",
    bone: "chest",
    material: "pack",
    sdf: roundBox([0.1, 0.056, 0.036], 0.014, [0, 1.27, -0.198]),
    voxel: 0.004,
  });
  out.push({
    name: "screen",
    bone: "chest",
    material: "screen",
    sdf: roundBox([0.076, 0.038, 0.004], 0.003, [0, 1.282, -0.234]),
    voxel: 0.0025,
  });
  for (const s of [-1, 1]) {
    const hand = side(s, "handL", "handR");
    const glove = blend(
      0.012,
      ellipsoid([0.046, 0.058, 0.03], [s * 0.315, 0.905, -0.014]),
      roundBox([0.041, 0.036, 0.023], 0.016, [s * 0.319, 0.848, -0.022]),
      capsule([s * 0.292, 0.905, -0.036], [s * 0.286, 0.868, -0.058], 0.014),
    );
    out.push({ name: `glove${s}`, bone: hand, material: "glove", sdf: glove, voxel: 0.0045 });
    out.push({
      name: `cuff${s}`,
      bone: hand,
      material: "metal",
      sdf: torus(0.056, 0.012, [s * 0.311, 0.968, -0.01], "y"),
      voxel: 0.0035,
    });
    const foot = side(s, "footL", "footR");
    const boot = blend(
      0.035,
      roundBox([0.07, 0.068, 0.152], 0.042, [s * 0.11, 0.09, -0.05]),
      capsule([s * 0.11, 0.1, 0.012], [s * 0.11, 0.21, 0.012], 0.077),
    );
    out.push({ name: `boot${s}`, bone: foot, material: "boot", sdf: boot, voxel: 0.006 });
    out.push({
      name: `sole${s}`,
      bone: foot,
      material: "sole",
      sdf: roundBox([0.075, 0.02, 0.16], 0.012, [s * 0.11, 0.021, -0.05]),
      voxel: 0.005,
    });
  }
  return out;
}

/** Every hard part, meshed; `scale` coarsens the voxels for the low tier. */
export function buildParts(scale: number): RigidPart[] {
  return hardParts().map((h) => {
    const m = snapped(h.sdf, h.voxel * scale);
    return { name: h.name, bone: h.bone, material: h.material, ...m };
  });
}

export { bindOf };
