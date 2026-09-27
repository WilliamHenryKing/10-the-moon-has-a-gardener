import { LEVELS } from "./levels";
import { type PlantReport, reportGarden, togglePanel } from "./rules";
import type { Cell, Level } from "./types";

/**
 * title   → the arrival card
 * plan    → place panels and scrub the Sun freely
 * growing → one lunar day plays out; input is locked
 * result  → the day's verdict; bloom moves on, failure returns to plan
 * ending  → every garden has bloomed; replay from the start
 */
export type Phase = "title" | "plan" | "growing" | "result" | "ending";

export interface GameState {
  phase: Phase;
  levelIndex: number;
  panels: Cell[];
  hour: number; // 0..7, the Sun position being previewed
  cursor: Cell;
  reports: PlantReport[] | null; // set once a day has been grown
  bloomed: boolean;
  daysGrown: number; // across the whole run, shown in the ending
}

export type Action =
  | { type: "start" }
  | { type: "toggle"; cell: Cell }
  | { type: "clear" }
  | { type: "setHour"; hour: number }
  | { type: "moveCursor"; dx: number; dz: number }
  | { type: "setCursor"; cell: Cell }
  | { type: "grow" }
  | { type: "dayEnded" }
  | { type: "retry" }
  | { type: "next" }
  | { type: "replay" };

export const levelOf = (s: GameState): Level => LEVELS[s.levelIndex] ?? (LEVELS[0] as Level);

function centre(level: Level): Cell {
  return { x: Math.floor((level.width - 1) / 2), z: Math.floor((level.depth - 1) / 2) };
}

function openLevel(s: GameState, index: number): GameState {
  const level = LEVELS[index] ?? (LEVELS[0] as Level);
  return {
    ...s,
    phase: "plan",
    levelIndex: index,
    panels: [],
    hour: 0,
    cursor: centre(level),
    reports: null,
    bloomed: false,
  };
}

export function initialState(): GameState {
  const level = LEVELS[0] as Level;
  return {
    phase: "title",
    levelIndex: 0,
    panels: [],
    hour: 0,
    cursor: centre(level),
    reports: null,
    bloomed: false,
    daysGrown: 0,
  };
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function reduce(s: GameState, a: Action): GameState {
  const level = levelOf(s);
  switch (a.type) {
    case "start":
      return s.phase === "title" ? openLevel(s, 0) : s;
    case "toggle": {
      if (s.phase !== "plan") return s;
      const panels = togglePanel(level, s.panels, a.cell);
      return panels ? { ...s, panels, cursor: a.cell } : { ...s, cursor: a.cell };
    }
    case "clear":
      return s.phase === "plan" ? { ...s, panels: [] } : s;
    case "setHour":
      return s.phase === "plan" ? { ...s, hour: clamp(Math.round(a.hour), 0, 7) } : s;
    case "moveCursor":
      return {
        ...s,
        cursor: {
          x: clamp(s.cursor.x + a.dx, 0, level.width - 1),
          z: clamp(s.cursor.z + a.dz, 0, level.depth - 1),
        },
      };
    case "setCursor":
      return { ...s, cursor: a.cell };
    case "grow": {
      if (s.phase !== "plan") return s;
      const reports = reportGarden(level, s.panels);
      return {
        ...s,
        phase: "growing",
        reports,
        bloomed: reports.every((r) => r.verdict === "bloom"),
      };
    }
    case "dayEnded":
      return s.phase === "growing" ? { ...s, phase: "result", daysGrown: s.daysGrown + 1 } : s;
    case "retry":
      return s.phase === "result" ? { ...s, phase: "plan", reports: null, bloomed: false } : s;
    case "next": {
      if (s.phase !== "result" || !s.bloomed) return s;
      if (s.levelIndex + 1 >= LEVELS.length) return { ...s, phase: "ending" };
      return openLevel(s, s.levelIndex + 1);
    }
    case "replay":
      return s.phase === "ending" ? { ...openLevel(s, 0), daysGrown: 0 } : s;
  }
}
