import { expect, test } from "bun:test";
import { LEVELS } from "../src/game/levels";
import { isSolved } from "../src/game/rules";
import { solutions } from "../src/game/solver";

for (const level of LEVELS) {
  test(`${level.name} can bloom within ${level.panels} panels`, () => {
    const [first] = solutions(level, level.panels, 1);
    expect(first).toBeDefined();
    expect(isSolved(level, first ?? [])).toBe(true);
    expect((first ?? []).length).toBeLessThanOrEqual(level.panels);
  }, 20_000);
}

test("the finale is tight: it cannot bloom with one panel fewer", () => {
  const finale = LEVELS[LEVELS.length - 1];
  if (!finale) throw new Error("no levels");
  expect(solutions(finale, finale.panels - 1, 1)).toHaveLength(0);
}, 20_000);
