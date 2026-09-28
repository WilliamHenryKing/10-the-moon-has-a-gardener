// The gardener's skeleton in its bind pose, shared by the body builder (suit-body.ts) and the
// runtime rig (gardener.ts). Root space, metres: +Y up, facing -Z, left side -X. The suited
// figure stands 1.86 m to the top of the helmet. Only ever append to BONES (indices are baked).

export type BoneName =
  | "hips"
  | "spine"
  | "chest"
  | "neck"
  | "head"
  | "armL"
  | "foreArmL"
  | "handL"
  | "armR"
  | "foreArmR"
  | "handR"
  | "thighL"
  | "shinL"
  | "footL"
  | "thighR"
  | "shinR"
  | "footR";

export interface BoneDef {
  name: BoneName;
  parent: BoneName | null;
  at: [number, number, number];
}

export const BONES: BoneDef[] = [
  { name: "hips", parent: null, at: [0, 0.97, 0] },
  { name: "spine", parent: "hips", at: [0, 1.04, 0] },
  { name: "chest", parent: "spine", at: [0, 1.24, 0] },
  { name: "neck", parent: "chest", at: [0, 1.52, -0.01] },
  { name: "head", parent: "neck", at: [0, 1.58, -0.01] },
  { name: "armL", parent: "chest", at: [-0.25, 1.44, 0] },
  { name: "foreArmL", parent: "armL", at: [-0.29, 1.18, 0.02] },
  { name: "handL", parent: "foreArmL", at: [-0.31, 0.95, -0.01] },
  { name: "armR", parent: "chest", at: [0.25, 1.44, 0] },
  { name: "foreArmR", parent: "armR", at: [0.29, 1.18, 0.02] },
  { name: "handR", parent: "foreArmR", at: [0.31, 0.95, -0.01] },
  { name: "thighL", parent: "hips", at: [-0.1, 0.93, 0] },
  { name: "shinL", parent: "thighL", at: [-0.11, 0.52, -0.018] },
  { name: "footL", parent: "shinL", at: [-0.11, 0.12, 0.01] },
  { name: "thighR", parent: "hips", at: [0.1, 0.93, 0] },
  { name: "shinR", parent: "thighR", at: [0.11, 0.52, -0.018] },
  { name: "footR", parent: "shinR", at: [0.11, 0.12, 0.01] },
];

export const boneIndex = (name: BoneName) => BONES.findIndex((b) => b.name === name);
export const bindOf = (name: BoneName) => (BONES[boneIndex(name)] as BoneDef).at;

const span = (a: BoneName, b: BoneName) => {
  const p = bindOf(a);
  const q = bindOf(b);
  return Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
};
export const THIGH = span("thighL", "shinL");
export const SHIN = span("shinL", "footL");
export const UPPER_ARM = span("armL", "foreArmL");
export const FORE_ARM = span("foreArmL", "handL");
/** Ankle height above the sole with the boot flat. */
export const ANKLE = bindOf("footL")[1];
