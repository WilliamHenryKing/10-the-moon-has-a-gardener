import { PLACES } from "../world/terrain-gen";
import {
  CAN_SIZE,
  canPlant,
  fit,
  type Garden,
  harvest,
  type Plant,
  type PlantRefusal,
  plant,
  refill,
  survey,
  takePickup,
  water,
} from "./garden";
import type { HeightQuery } from "./light";
import { SPECIES, type SpeciesId } from "./species";

// What pressing Interact does where the gardener stands and faces: the one sensible thing, in
// order of what is most likely meant. Pure logic over the garden rules; the scene shows the
// action as a prompt before you press and plays it when you do.

/** Where the can is refilled: the base's tank, and the ice drill down in the bowl. */
export const WATER_POINTS = [
  { id: "tank", x: 6, z: -4.5, r: 3.2, label: "Water tank" },
  { id: "ice", x: PLACES.bowl.x + 14, z: PLACES.bowl.z - 4, r: 3.6, label: "Ice at the drill" },
] as const;

/** How far ahead of the gardener a seed goes in. */
export const PLANT_AHEAD = 1.25;
const REACH_PICKUP = 2.6;
const REACH_PLANT = 1.8;

export type Action =
  | { kind: "pickup"; id: string; label: string }
  | { kind: "refill"; label: string }
  | { kind: "harvest"; plant: Plant }
  | { kind: "water"; plant: Plant }
  | { kind: "dry"; plant: Plant }
  | { kind: "plant"; species: SpeciesId; x: number; z: number; fit: number; reason: string }
  | { kind: "cannot"; species: SpeciesId; x: number; z: number; refusal: PlantRefusal };

/** The gardener faces −Z at yaw 0. */
export const ahead = (yaw: number) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });

/** The plant in reach that the gardener is facing, if any. */
function facing(g: Garden, px: number, pz: number, yaw: number): Plant | null {
  const f = ahead(yaw);
  let best: Plant | null = null;
  let bestScore = Infinity;
  for (const p of g.plants) {
    const dx = p.x - px;
    const dz = p.z - pz;
    const d = Math.hypot(dx, dz);
    if (d > REACH_PLANT) continue;
    // In front, roughly: behind you does not count.
    const along = (dx * f.x + dz * f.z) / (d || 1);
    if (along < 0.2 && d > 0.6) continue;
    const score = d - along * 0.6;
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

export function nextAction(
  g: Garden,
  ground: HeightQuery,
  px: number,
  pz: number,
  yaw: number,
  species: SpeciesId,
): Action {
  for (const k of g.pickups) {
    if (k.taken || (k.needs && !g.unlocked.has(k.needs))) continue;
    if (Math.hypot(k.x - px, k.z - pz) < REACH_PICKUP)
      return { kind: "pickup", id: k.id, label: k.label };
  }
  const p = facing(g, px, pz, yaw);
  if (p) {
    if (p.bloomed && p.harvestIn <= 0 && SPECIES[p.species].seeds > 0)
      return { kind: "harvest", plant: p };
    if (p.water <= 0.6) return g.can > 0 ? { kind: "water", plant: p } : { kind: "dry", plant: p };
  }
  for (const w of WATER_POINTS)
    if (g.can < CAN_SIZE && Math.hypot(w.x - px, w.z - pz) < w.r)
      return { kind: "refill", label: w.label };
  const f = ahead(yaw);
  const x = px + f.x * PLANT_AHEAD;
  const z = pz + f.z * PLANT_AHEAD;
  const refusal = canPlant(g, ground, species, x, z);
  if (refusal) return { kind: "cannot", species, x, z, refusal };
  const spot = survey(g, ground, x, z);
  const f2 = fit(species, spot);
  return { kind: "plant", species, x, z, fit: f2.fit, reason: f2.reason };
}

/** Carry out an action; true when something happened. */
export function perform(g: Garden, ground: HeightQuery, a: Action): boolean {
  switch (a.kind) {
    case "pickup":
      return takePickup(g, a.id);
    case "refill":
      return refill(g);
    case "harvest":
      return harvest(g, a.plant);
    case "water":
      return water(g, a.plant);
    case "plant":
      return plant(g, ground, a.species, a.x, a.z) !== null;
    default:
      return false;
  }
}

/** The next species in the pouch that has seeds (wrapping), for cycling. */
export function nextSeed(
  g: Garden,
  from: SpeciesId,
  order: readonly SpeciesId[],
  dir = 1,
): SpeciesId {
  const i = order.indexOf(from);
  for (let k = 1; k <= order.length; k++) {
    const s = order[(i + dir * k + order.length * 8) % order.length] as SpeciesId;
    if (g.seeds[s] > 0) return s;
  }
  return from;
}

/** A short line for the prompt under the action. */
export function describe(a: Action): { verb: string; detail: string; ok: boolean } {
  switch (a.kind) {
    case "pickup":
      return { verb: "Open", detail: a.label, ok: true };
    case "refill":
      return { verb: "Refill the can", detail: a.label, ok: true };
    case "harvest":
      return { verb: "Harvest seeds", detail: SPECIES[a.plant.species].name, ok: true };
    case "water":
      return { verb: "Water", detail: SPECIES[a.plant.species].name, ok: true };
    case "dry":
      return { verb: "The can is empty", detail: "refill at the tank or the ice", ok: false };
    case "plant":
      return {
        verb: `Plant ${SPECIES[a.species].name}`,
        detail:
          a.fit >= 0.75
            ? `a good spot: ${a.reason}`
            : a.fit >= 0.4
              ? `it will grow slowly: ${a.reason}`
              : `a poor spot: ${a.reason}`,
        ok: true,
      };
    case "cannot": {
      const why: Record<PlantRefusal, string> = {
        "no seeds": `no ${SPECIES[a.species].name} seeds left`,
        "too close": "too close to another plant",
        "too steep": "the ground is too steep",
        base: "too close to the base",
        outside: "outside the basin",
      };
      return { verb: `Can't plant here`, detail: why[a.refusal], ok: false };
    }
  }
}
