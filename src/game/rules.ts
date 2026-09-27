import type { Cell, HourState, Level, PlantSpot, Species, Verdict } from "./types";

/**
 * The garden sits near the lunar south pole, where the Sun never climbs high: across
 * one lunar day it circles the horizon once. We sample that day as 8 "hours", one per
 * compass point. Every caster (shade panel or rock) throws a shadow SHADOW_LENGTH tiles
 * long, pointing straight away from the Sun.
 */
export const HOURS = 8;
export const SHADOW_LENGTH = 2;

const DIRS: readonly [number, number][] = [
  [1, 0], // E
  [1, -1], // NE
  [0, -1], // N
  [-1, -1], // NW
  [-1, 0], // W
  [-1, 1], // SW
  [0, 1], // S
  [1, 1], // SE
];
const DIR_NAMES = [
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
  "south",
  "south-east",
];

export interface SpeciesInfo {
  name: string;
  min: number; // fewest lit hours it tolerates
  max: number; // most lit hours it tolerates
  need: string;
}

export const SPECIES: Record<Species, SpeciesInfo> = {
  sunleaf: { name: "Sunleaf", min: 6, max: 8, need: "6–8 hours of light" },
  mooncress: { name: "Mooncress", min: 3, max: 5, need: "3–5 hours of light" },
  nightbell: { name: "Nightbell", min: 0, max: 3, need: "0–3 hours of light" },
};

export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** Grid step pointing from the garden toward the Sun at this hour. */
export function sunStep(hour: number): [number, number] {
  return DIRS[mod(Math.round(hour), HOURS)] ?? [1, 0];
}

export function sunName(hour: number): string {
  return DIR_NAMES[mod(Math.round(hour), HOURS)] ?? "east";
}

export const key = (c: Cell): string => `${c.x},${c.z}`;
export const sameCell = (a: Cell, b: Cell): boolean => a.x === b.x && a.z === b.z;

export function inBounds(level: Level, c: Cell): boolean {
  return c.x >= 0 && c.z >= 0 && c.x < level.width && c.z < level.depth;
}

/** Cells that cast shadows: rocks plus placed panels. */
export function casterSet(level: Level, panels: readonly Cell[]): Set<string> {
  const s = new Set<string>();
  for (const r of level.rocks) s.add(key(r));
  for (const p of panels) s.add(key(p));
  return s;
}

/** A cell is in shade when a caster stands between it and the Sun, within reach. */
export function isShaded(casters: Set<string>, c: Cell, hour: number): boolean {
  const [dx, dz] = sunStep(hour);
  for (let k = 1; k <= SHADOW_LENGTH; k++) {
    if (casters.has(`${c.x + dx * k},${c.z + dz * k}`)) return true;
  }
  return false;
}

/** Which hours of the lunar day reach this cell. */
export function lightMask(level: Level, panels: readonly Cell[], c: Cell): boolean[] {
  const casters = casterSet(level, panels);
  return Array.from({ length: HOURS }, (_, h) => !isShaded(casters, c, h));
}

export const countLit = (mask: readonly boolean[]): number => mask.filter(Boolean).length;

export function verdictFor(species: Species, lit: number): Verdict {
  const s = SPECIES[species];
  if (lit > s.max) return "scorched";
  if (lit < s.min) return "starved";
  return "bloom";
}

/**
 * Hour-by-hour growth for one plant across the lunar day. A plant grows steadily until
 * the day can no longer suit it: once it has had more light than it tolerates it
 * scorches, and once the remaining hours cannot give it enough it starves.
 */
export function growthTrace(species: Species, mask: readonly boolean[]): HourState[] {
  const s = SPECIES[species];
  const out: HourState[] = [];
  let lit = 0;
  let growth = 0;
  let health: HourState["health"] = "growing";
  for (let h = 0; h < HOURS; h++) {
    const isLit = mask[h] ?? false;
    if (isLit) lit++;
    const remaining = HOURS - 1 - h;
    if (health === "growing") {
      if (lit > s.max) health = "scorched";
      else if (lit + remaining < s.min) health = "starved";
    }
    if (health === "growing") growth = (h + 1) / HOURS;
    out.push({ lit: isLit, growth, health });
  }
  return out;
}

export interface PlantReport {
  plant: PlantSpot;
  mask: boolean[];
  lit: number;
  verdict: Verdict;
}

export function reportGarden(level: Level, panels: readonly Cell[]): PlantReport[] {
  return level.plants.map((plant) => {
    const mask = lightMask(level, panels, plant);
    const lit = countLit(mask);
    return { plant, mask, lit, verdict: verdictFor(plant.species, lit) };
  });
}

export function isSolved(level: Level, panels: readonly Cell[]): boolean {
  return reportGarden(level, panels).every((r) => r.verdict === "bloom");
}

export type TileKind = "soil" | "plant" | "rock" | "panel";

export function tileKind(level: Level, panels: readonly Cell[], c: Cell): TileKind {
  if (level.plants.some((p) => sameCell(p, c))) return "plant";
  if (level.rocks.some((r) => sameCell(r, c))) return "rock";
  if (panels.some((p) => sameCell(p, c))) return "panel";
  return "soil";
}

/** Place a panel on bare soil, or lift one back onto the rover. Returns null if not allowed. */
export function togglePanel(level: Level, panels: readonly Cell[], c: Cell): Cell[] | null {
  if (!inBounds(level, c)) return null;
  const kind = tileKind(level, panels, c);
  if (kind === "panel") return panels.filter((p) => !sameCell(p, c));
  if (kind !== "soil" || panels.length >= level.panels) return null;
  return [...panels, { x: c.x, z: c.z }];
}

/** Human-readable tile label, e.g. "C2" (column letter, row number). */
export function tileLabel(c: Cell): string {
  return `${String.fromCharCode(65 + c.x)}${c.z + 1}`;
}
