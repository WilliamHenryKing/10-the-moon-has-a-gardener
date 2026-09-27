import { expect, test } from "bun:test";
import { LEVELS } from "../src/game/levels";
import { solutions } from "../src/game/solver";
import { type Action, type GameState, initialState, reduce } from "../src/game/state";

const play = (s: GameState, ...actions: Action[]) => actions.reduce(reduce, s);

test("the loop runs title → plan → growing → result → back to plan", () => {
  let s = play(initialState(), { type: "start" });
  expect(s.phase).toBe("plan");
  s = play(s, { type: "grow" });
  expect(s.phase).toBe("growing");
  expect(s.bloomed).toBe(false);
  // Input is ignored while the day plays.
  expect(play(s, { type: "toggle", cell: { x: 0, z: 0 } }).panels).toEqual([]);
  s = play(s, { type: "dayEnded" });
  expect(s.phase).toBe("result");
  expect(play(s, { type: "next" }).levelIndex).toBe(0); // cannot skip a failed garden
  s = play(s, { type: "retry" });
  expect(s.phase).toBe("plan");
});

test("solving every garden reaches the ending, and replay restarts", () => {
  let s = play(initialState(), { type: "start" });
  for (const level of LEVELS) {
    const [solution] = solutions(level, level.panels, 1);
    for (const cell of solution ?? []) s = reduce(s, { type: "toggle", cell });
    s = play(s, { type: "grow" }, { type: "dayEnded" });
    expect(s.bloomed).toBe(true);
    s = reduce(s, { type: "next" });
  }
  expect(s.phase).toBe("ending");
  expect(s.daysGrown).toBe(LEVELS.length);
  s = reduce(s, { type: "replay" });
  expect(s.phase).toBe("plan");
  expect(s.levelIndex).toBe(0);
  expect(s.daysGrown).toBe(0);
}, 30_000);

test("the Sun preview and cursor stay within bounds", () => {
  let s = play(initialState(), { type: "start" }, { type: "setHour", hour: 12 });
  expect(s.hour).toBe(7);
  s = play(s, { type: "moveCursor", dx: -9, dz: 9 });
  expect(s.cursor).toEqual({ x: 0, z: 3 });
});
