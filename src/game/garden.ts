import { PLACES } from "../world/terrain-gen";
import { earthlight, type HeightQuery, iceWet, type Panel, sunShare } from "./light";
import { SPECIES, type SpeciesId } from "./species";

// The garden's state and rules. Every plant is one you placed; how it grows depends only on how
// well its spot suits its species and whether it has water. Blooms breathe oxygen into the new
// dome; each milestone unlocks what the next part of the basin needs. The colony ship Perennial
// is on its way: fill the dome before it lands. Pure logic; the scene reads the state and the
// events.

/** Oxygen units that fill the dome. */
export const DOME = 2600;
/** Seconds until the Perennial lands (gold if the dome is full by then). */
export const ARRIVAL = 18 * 60;
/** Silver if full within this long after landing; bronze after that. */
export const SILVER_GRACE = 6 * 60;
export const CAN_SIZE = 6;
/** Seconds a watering lasts. */
export const WATER_TIME = 150;
export const SPRINKLER_RADIUS = 5;
/** Plants cannot go this close to the base. */
export const BASE_CLEAR = 11;

export type Unlock = "rover" | "caches" | "supply" | "jets" | "full";
export const MILESTONES: { at: number; unlock: Unlock; title: string }[] = [
  { at: 0.25, unlock: "rover", title: "Rover fuel cell charged" },
  { at: 0.4, unlock: "caches", title: "Survey caches located" },
  { at: 0.6, unlock: "supply", title: "Supply drop at the base" },
  { at: 0.8, unlock: "jets", title: "Suit jets unlocked" },
  { at: 1, unlock: "full", title: "The dome is full" },
];

export interface Plant {
  id: number;
  species: SpeciesId;
  x: number;
  z: number;
  /** 0 … 1; 1 is bloom. */
  growth: number;
  /** 0 … 1; plants grow only with water. */
  water: number;
  sun: number;
  earth: number;
  wet: number;
  /** How well the spot suits the species, 0 … 1. */
  fit: number;
  /** Seconds until it can be harvested (after it blooms). */
  harvestIn: number;
  bloomed: boolean;
}

export interface Pickup {
  id: string;
  x: number;
  z: number;
  label: string;
  seeds: Partial<Record<SpeciesId, number>>;
  panels?: number;
  sprinklers?: number;
  /** Which unlock reveals it (none: from the start). */
  needs?: Unlock;
  taken: boolean;
}

export type GardenEvent =
  | { type: "planted"; plant: Plant }
  | { type: "watered"; plant: Plant }
  | { type: "thirsty"; plant: Plant }
  | { type: "bloomed"; plant: Plant; first: boolean }
  | { type: "harvested"; plant: Plant; seeds: number }
  | { type: "dug"; plant: Plant }
  | { type: "refilled" }
  | { type: "panel"; panel: Panel }
  | { type: "sprinkler"; x: number; z: number }
  | { type: "pickup"; pickup: Pickup }
  | { type: "milestone"; unlock: Unlock; title: string }
  | { type: "arrived" };

export interface Garden {
  time: number;
  plants: Plant[];
  seeds: Record<SpeciesId, number>;
  can: number;
  panels: Panel[];
  panelsCarried: number;
  sprinklers: { x: number; z: number }[];
  sprinklersCarried: number;
  oxygen: number;
  unlocked: Set<Unlock>;
  /** Species that have bloomed at least once (the journal). */
  journal: Set<SpeciesId>;
  pickups: Pickup[];
  /** Time the dome filled, or -1. */
  filledAt: number;
  events: GardenEvent[];
  nextId: number;
}

const emptySeeds = (): Record<SpeciesId, number> => ({
  mooncress: 0,
  sunleaf: 0,
  nightbell: 0,
  glassfern: 0,
  craterbloom: 0,
  birch: 0,
  orchid: 0,
});

export function createGarden(): Garden {
  const seeds = emptySeeds();
  seeds.mooncress = 6;
  seeds.sunleaf = 3;
  return {
    time: 0,
    plants: [],
    seeds,
    can: CAN_SIZE,
    panels: [],
    panelsCarried: 0,
    sprinklers: [],
    sprinklersCarried: 0,
    oxygen: 0,
    unlocked: new Set(),
    journal: new Set(),
    pickups: [
      {
        id: "probe",
        x: PLACES.probe.x,
        z: PLACES.probe.z,
        label: "Crashed survey probe",
        seeds: { nightbell: 3 },
        panels: 2,
        taken: false,
      },
      {
        id: "earthside",
        x: PLACES.earthside.x + 6,
        z: PLACES.earthside.z - 34,
        label: "Survey marker",
        seeds: { glassfern: 2 },
        needs: "caches",
        taken: false,
      },
      {
        id: "icedrill",
        x: PLACES.bowl.x + 14,
        z: PLACES.bowl.z - 4,
        label: "Ice drill",
        seeds: { craterbloom: 2 },
        needs: "caches",
        taken: false,
      },
      {
        id: "supply",
        x: -7,
        z: 5,
        label: "Supply drop",
        seeds: { birch: 2 },
        sprinklers: 3,
        needs: "supply",
        taken: false,
      },
    ],
    filledAt: -1,
    events: [],
    nextId: 1,
  };
}

export const oxygenShare = (g: Garden) => Math.min(1, g.oxygen / DOME);

export interface Spot {
  sun: number;
  earth: number;
  wet: number;
}

/** Everything the scanner reads about a spot. */
export function survey(g: Garden, ground: HeightQuery, x: number, z: number): Spot {
  const sprinkler = g.sprinklers.some((s) => Math.hypot(s.x - x, s.z - z) < SPRINKLER_RADIUS)
    ? 1
    : 0;
  return {
    sun: sunShare(ground, x, z, g.panels),
    earth: earthlight(ground, x, z),
    wet: Math.max(iceWet(x, z), sprinkler),
  };
}

/** How well a spot suits a species, 0 … 1, with the main reason if it does not. */
export function fit(species: SpeciesId, spot: Spot): { fit: number; reason: string } {
  const s = SPECIES[species];
  const [lo, hi] = s.sun;
  const off = spot.sun < lo ? lo - spot.sun : spot.sun > hi ? spot.sun - hi : 0;
  let f = Math.max(0, 1 - off / 0.18);
  let reason = off > 0 ? (spot.sun < lo ? "too shady" : "too sunny") : "";
  if (s.earth) {
    if (spot.earth < 0.5 && !reason) reason = "Earth not in view";
    f *= spot.earth;
  }
  if (s.wet) {
    if (spot.wet < 0.5 && !reason) reason = "ground too dry";
    f *= spot.wet;
  }
  return { fit: f, reason };
}

export type PlantRefusal = "no seeds" | "too close" | "too steep" | "base" | "outside";

export function canPlant(
  g: Garden,
  ground: HeightQuery,
  species: SpeciesId,
  x: number,
  z: number,
): PlantRefusal | null {
  if (g.seeds[species] <= 0) return "no seeds";
  if (Math.hypot(x, z) > 200) return "outside";
  if (Math.hypot(x - PLACES.pad.x, z - PLACES.pad.z) < BASE_CLEAR) return "base";
  const n = ground.normalAt(x, z, { x: 0, y: 1, z: 0 });
  if (n.y < 0.9) return "too steep";
  const space = SPECIES[species].space;
  for (const p of g.plants)
    if (Math.hypot(p.x - x, p.z - z) < Math.max(space, SPECIES[p.species].space) * 0.8)
      return "too close";
  return null;
}

export function plant(
  g: Garden,
  ground: HeightQuery,
  species: SpeciesId,
  x: number,
  z: number,
): Plant | null {
  if (canPlant(g, ground, species, x, z)) return null;
  const spot = survey(g, ground, x, z);
  const p: Plant = {
    id: g.nextId++,
    species,
    x,
    z,
    growth: 0,
    water: 0,
    ...spot,
    fit: fit(species, spot).fit,
    harvestIn: 0,
    bloomed: false,
  };
  g.seeds[species]--;
  g.plants.push(p);
  g.events.push({ type: "planted", plant: p });
  return p;
}

export function water(g: Garden, p: Plant): boolean {
  if (g.can <= 0 || p.water > 0.6) return false;
  g.can--;
  p.water = 1;
  g.events.push({ type: "watered", plant: p });
  return true;
}

export function refill(g: Garden) {
  if (g.can === CAN_SIZE) return false;
  g.can = CAN_SIZE;
  g.events.push({ type: "refilled" });
  return true;
}

export function harvest(g: Garden, p: Plant): boolean {
  const s = SPECIES[p.species];
  if (p.growth < 1 || p.harvestIn > 0 || s.seeds === 0) return false;
  g.seeds[p.species] += s.seeds;
  p.harvestIn = s.regrow;
  g.events.push({ type: "harvested", plant: p, seeds: s.seeds });
  return true;
}

/** Dig up a young plant and get its seed back (a mistake is never permanent). */
export function dig(g: Garden, p: Plant): boolean {
  if (p.growth >= 0.35) return false;
  g.plants = g.plants.filter((q) => q !== p);
  g.seeds[p.species]++;
  g.events.push({ type: "dug", plant: p });
  return true;
}

/** Re-read the light for plants near something that changed (a panel or a sprinkler). */
function resurvey(g: Garden, ground: HeightQuery, x: number, z: number, radius: number) {
  for (const p of g.plants) {
    if (Math.hypot(p.x - x, p.z - z) > radius) continue;
    Object.assign(p, survey(g, ground, p.x, p.z));
    p.fit = fit(p.species, p).fit;
  }
}

export function placePanel(g: Garden, ground: HeightQuery, panel: Panel): boolean {
  if (g.panelsCarried <= 0) return false;
  g.panelsCarried--;
  g.panels.push(panel);
  resurvey(g, ground, panel.x, panel.z, 14);
  g.events.push({ type: "panel", panel });
  return true;
}

export function placeSprinkler(g: Garden, ground: HeightQuery, x: number, z: number): boolean {
  if (g.sprinklersCarried <= 0) return false;
  g.sprinklersCarried--;
  g.sprinklers.push({ x, z });
  resurvey(g, ground, x, z, SPRINKLER_RADIUS + 0.5);
  g.events.push({ type: "sprinkler", x, z });
  return true;
}

export function takePickup(g: Garden, id: string): boolean {
  const k = g.pickups.find((p) => p.id === id);
  if (!k || k.taken || (k.needs && !g.unlocked.has(k.needs))) return false;
  k.taken = true;
  for (const [s, n] of Object.entries(k.seeds) as [SpeciesId, number][]) g.seeds[s] += n;
  g.panelsCarried += k.panels ?? 0;
  g.sprinklersCarried += k.sprinklers ?? 0;
  g.events.push({ type: "pickup", pickup: k });
  return true;
}

export function step(g: Garden, dt: number) {
  const before = g.time;
  g.time += dt;
  let rate = 0;
  for (const p of g.plants) {
    const sprinkled = g.sprinklers.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < SPRINKLER_RADIUS);
    if (sprinkled) p.water = 1;
    const wasWet = p.water > 0;
    p.water = Math.max(0, p.water - dt / WATER_TIME);
    if (wasWet && p.water === 0) g.events.push({ type: "thirsty", plant: p });
    if (p.growth < 1 && p.water > 0) {
      p.growth = Math.min(1, p.growth + (dt * p.fit) / SPECIES[p.species].grow);
      if (p.growth >= 1 && !p.bloomed) {
        p.bloomed = true;
        const first = !g.journal.has(p.species);
        g.journal.add(p.species);
        g.events.push({ type: "bloomed", plant: p, first });
      }
    }
    p.harvestIn = Math.max(0, p.harvestIn - dt);
    const s = SPECIES[p.species];
    // Blooms breathe fully; mature plants a little; thirsty ones not at all.
    const breath = p.growth >= 1 ? 1 : p.growth >= 0.6 ? 0.3 : 0;
    rate += s.oxygen * breath * (p.water > 0 ? 1 : 0.2);
  }
  g.oxygen = Math.min(DOME, g.oxygen + rate * dt);
  const share = oxygenShare(g);
  for (const m of MILESTONES)
    if (share >= m.at && !g.unlocked.has(m.unlock)) {
      g.unlocked.add(m.unlock);
      g.events.push({ type: "milestone", unlock: m.unlock, title: m.title });
      if (m.unlock === "full") g.filledAt = g.time;
    }
  if (before < ARRIVAL && g.time >= ARRIVAL) g.events.push({ type: "arrived" });
}

/** Oxygen per second right now. */
export function production(g: Garden) {
  let rate = 0;
  for (const p of g.plants) {
    const breath = p.growth >= 1 ? 1 : p.growth >= 0.6 ? 0.3 : 0;
    rate += SPECIES[p.species].oxygen * breath * (p.water > 0 ? 1 : 0.2);
  }
  return rate;
}

export type Medal = "gold" | "silver" | "bronze";
export function medal(g: Garden): Medal | null {
  if (g.filledAt < 0) return null;
  if (g.filledAt <= ARRIVAL) return "gold";
  return g.filledAt <= ARRIVAL + SILVER_GRACE ? "silver" : "bronze";
}

export function drainEvents(g: Garden) {
  const e = g.events;
  g.events = [];
  return e;
}
