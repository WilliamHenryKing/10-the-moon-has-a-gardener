import type { Recipes } from "./kit/build";
import {
  bend,
  blend,
  box,
  capsule,
  carve,
  chain,
  cone,
  cylinder,
  displace,
  ellipsoid,
  extrude,
  fbm,
  lathe,
  type Mat,
  mat,
  mirrorX,
  mottle,
  move,
  type Node,
  paint,
  polygon2,
  radial,
  rng,
  rotate,
  scale,
  sphere,
  subtract,
  torus,
  union,
  type Vec3,
} from "./kit/sdf";

const pick = <T>(r: () => number, list: T[]) => list[Math.floor(r() * list.length)] as T;
const range = (r: () => number, a: number, b: number) => a + (b - a) * r();
void [bend, blend, box, capsule, carve, chain, cone, cylinder, displace, ellipsoid, extrude, fbm, lathe, mirrorX, mottle, move, paint, polygon2, radial, rotate, scale, sphere, subtract, torus, union];
type Build = (seed: number, index: number) => Node;
void (0 as unknown as Mat | Vec3 | Build);

// THE MOON HAS A GARDENER — a jewel-like lunar garden: ten plant species in five growth
// stages each (for readable growth), moon rocks and shade panels.
const GEMS = [0x6ad9c9, 0xd96ab8, 0xf2c14e, 0x8a7af2, 0x6ab8f2, 0xf2856a, 0x9af26a, 0xf2f26a, 0xc9a6ff, 0x6af2a0];
const STEM = mat(0x7a8a9a, 0.4, 0.3);
const plant: Build = (seed, index) => {
  const species = Math.floor(index / 5);
  const stage = (index % 5) + 1;
  const r = rng(species * 911 + 17);
  const gem = mat(GEMS[species % GEMS.length] as number, 0.15, 0.1);
  const grow = stage / 5;
  const h = 0.08 + 0.35 * grow * range(r, 0.8, 1.2);
  const parts: Node[] = [move(cylinder(0.05, 0.02, 0.008, mat(0x9a9a9a, 0.9)), [0, 0.01, 0])];
  const stem = chain([[0, 0, 0], [0.01, h * 0.5, 0.005], [0, h, 0]], 0.008 + 0.006 * grow, 0.004, STEM, 0.004);
  parts.push(stem);
  const kind = species % 5;
  if (kind === 0) {
    // crystal bloom: faceted petals opening with stage
    const open = 0.2 + grow * 0.9;
    parts.push(move(radial(rotate(move(box(0.012 * grow + 0.004, 0.05 * grow + 0.01, 0.004, 0.001, gem), [0, 0.03 * grow, 0]), [0, 0, -open]), 5 + species), [0, h, 0]));
  } else if (kind === 1) {
    // glow bulb swelling with stage
    parts.push(move(ellipsoid(0.02 + 0.04 * grow, 0.03 + 0.05 * grow, 0.02 + 0.04 * grow, gem), [0, h + 0.03 * grow, 0]));
  } else if (kind === 2) {
    // spiral fern unrolling
    const pts: Vec3[] = [];
    const turns = 2.2 - grow * 1.6;
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const a = t * turns * Math.PI * 2;
      const rr = 0.06 * grow * (1 - t * 0.8);
      pts.push([Math.cos(a) * rr, h + Math.sin(a) * rr + t * 0.05, 0]);
    }
    parts.push(chain(pts, 0.006, 0.002, gem));
  } else if (kind === 3) {
    // puffball cluster multiplying
    for (let i = 0; i < stage + 1; i++) {
      const a = (i / (stage + 1)) * Math.PI * 2;
      parts.push(move(sphere(0.015 + 0.01 * grow, gem), [Math.cos(a) * 0.03 * grow, h + Math.sin(i * 2.1) * 0.02, Math.sin(a) * 0.03 * grow]));
    }
  } else {
    // star lily: star petals + stamen
    parts.push(move(radial(rotate(capsule([0, 0, 0], [0.06 * grow + 0.01, 0.02, 0], 0.006, 0.002, gem), [0, 0, 0.2]), 6), [0, h, 0]));
    parts.push(move(sphere(0.008, mat(0xffffff, 0.2)), [0, h + 0.01, 0]));
  }
  if (stage >= 3) for (let i = 0; i < stage - 1; i++) parts.push(rotate(move(ellipsoid(0.03 * grow, 0.004, 0.012, mat(0x5a9a8a, 0.4)), [0.025 * grow, h * (0.2 + i * 0.15), 0]), [0, i * 2.1, 0.3]));
  return union(...parts);
};
const moonRock: Build = (seed) => {
  const r = rng(seed);
  const s = range(r, 0.05, 0.4);
  const regolith = mat(pick(r, [0x9a9a96, 0x8a8a88, 0xb0aea8, 0x7a7a78]), 0.9);
  let rock = displace(ellipsoid(s, s * range(r, 0.4, 0.8), s * range(r, 0.6, 1), regolith), s * 0.08, 3 / s, 5, seed);
  const pits = Math.floor(r() * 6);
  for (let i = 0; i < pits; i++) rock = carve(s * 0.05, rock, move(sphere(s * range(r, 0.08, 0.2)), [range(r, -s, s), s * 0.5, range(r, -s, s)]));
  return rock;
};
const shadePanel: Build = (seed) => {
  const r = rng(seed);
  const frame = mat(0xd9d9d9, 0.3, 0.8);
  const film = mat(pick(r, [0x2a3a5a, 0x5a2a4a, 0x2a4a4a]), 0.2);
  const w = range(r, 0.3, 0.6);
  return union(move(box(w, w * 0.7, 0.01, 0.004, film), [0, 0.5, 0]), capsule([0, 0, 0], [0, 0.5, 0], 0.01, 0.01, frame), move(cylinder(0.08, 0.02, 0.006, frame), [0, 0.01, 0]), move(rotate(torus(w * 0.02, 0.006, frame), [Math.PI / 2, 0, 0]), [0, 0.5, 0.01]));
};

export const project = { id: "10-the-moon-has-a-gardener", name: "THE MOON HAS A GARDENER", background: 0x161a26 };
export const families: Recipes["families"] = [
  { id: "lunar-plant", count: 100, voxel: 0.0012, keep: 0.3, hero: true, build: plant },
  { id: "moon-rock", count: 60, voxel: 0.004, keep: 0.25, dirt: 0.5, build: moonRock },
  { id: "shade-panel", count: 8, voxel: 0.003, keep: 0.3, build: shadePanel },
];
export const textures: Recipes["textures"] = [
  { id: "regolith", ramp: [0x5a5a58, 0x8a8a88, 0xb0aea8], layers: [{ kind: "fbm", scale: 24, octaves: 7 }, { kind: "cells", count: 30, weight: 0.5 }], roughness: [0.85, 1], normal: 2.5 },
  { id: "crystal-facet", ramp: [0x3a8a8a, 0x6ad9c9, 0xc9fff2], layers: [{ kind: "cells", count: 12 }, { kind: "cells", count: 12, crack: true, weight: 0.5 }], roughness: [0.05, 0.25], normal: 1.5 },
  { id: "garden-soil", ramp: [0x2a2a30, 0x4a4a52, 0x6a6a72], layers: [{ kind: "fbm", scale: 32, octaves: 5 }], roughness: [0.8, 0.95], normal: 1.4 },
];
