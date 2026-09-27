import { HOURS, isSolved, SHADOW_LENGTH, sunStep, tileKind } from "./rules";
import type { Cell, Level } from "./types";

/**
 * Exhaustive search over panel placements (gardens are tiny). Used by tests to prove
 * every garden can bloom within its panel budget.
 */
export function solutions(level: Level, maxPanels = level.panels, limit = Infinity): Cell[][] {
  const soil: Cell[] = [];
  for (let z = 0; z < level.depth; z++) {
    for (let x = 0; x < level.width; x++) {
      if (tileKind(level, [], { x, z }) === "soil" && canShadeAPlant(level, { x, z })) {
        soil.push({ x, z });
      }
    }
  }
  const found: Cell[][] = [];
  const chosen: Cell[] = [];
  const walk = (start: number): void => {
    if (found.length >= limit) return;
    if (isSolved(level, chosen)) found.push([...chosen]);
    if (chosen.length >= maxPanels) return;
    for (let i = start; i < soil.length; i++) {
      const c = soil[i];
      if (!c) continue;
      chosen.push(c);
      walk(i + 1);
      chosen.pop();
    }
  };
  walk(0);
  return found;
}

/** Only cells within shadow reach of some plant matter to the search. */
function canShadeAPlant(level: Level, c: Cell): boolean {
  return level.plants.some((p) => {
    for (let h = 0; h < HOURS; h++) {
      const [dx, dz] = sunStep(h);
      for (let k = 1; k <= SHADOW_LENGTH; k++) {
        if (p.x + dx * k === c.x && p.z + dz * k === c.z) return true;
      }
    }
    return false;
  });
}

export function fewestPanels(level: Level): number | null {
  for (let n = 0; n <= level.panels; n++) {
    if (solutions(level, n, 1).some((s) => s.length <= n)) return n;
  }
  return null;
}
