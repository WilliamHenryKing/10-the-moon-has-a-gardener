import { type PlantReport, SPECIES, sunName, tileKind, tileLabel } from "../game/rules";
import type { Cell, Level } from "../game/types";

export const SPECIES_COLOR = {
  sunleaf: "var(--color-leaf)",
  mooncress: "var(--color-cress)",
  nightbell: "var(--color-bell)",
} as const;

export const VERDICT_TEXT = {
  bloom: "will bloom",
  scorched: "too bright",
  starved: "too dark",
} as const;

export function hourLabel(hour: number): string {
  return `Hour ${Math.round(hour) + 1} of 8 · Sun in the ${sunName(hour)}`;
}

/** Spoken description of a tile for the keyboard cursor. */
export function describeTile(
  level: Level,
  panels: readonly Cell[],
  reports: PlantReport[],
  c: Cell,
): string {
  const label = tileLabel(c);
  const kind = tileKind(level, panels, c);
  if (kind === "plant") {
    const r = reports.find((p) => p.plant.x === c.x && p.plant.z === c.z);
    if (!r) return label;
    const s = SPECIES[r.plant.species];
    return `${label}: ${s.name}, ${r.lit} of 8 hours lit, needs ${s.need}, ${VERDICT_TEXT[r.verdict]}.`;
  }
  if (kind === "rock") return `${label}: rock, casts shade.`;
  if (kind === "panel") return `${label}: shade panel. Press Enter to lift it.`;
  return `${label}: bare soil. Press Enter to stand a panel.`;
}

export function failureLine(r: PlantReport): string {
  const s = SPECIES[r.plant.species];
  const what = r.verdict === "scorched" ? "scorched" : "starved";
  return `${s.name} at ${tileLabel(r.plant)} ${what}: ${r.lit} hours of light, needs ${s.need.replace(" of light", "")}.`;
}
