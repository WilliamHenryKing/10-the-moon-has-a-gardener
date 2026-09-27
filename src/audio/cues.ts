import type { HourState } from "../game/types";

/** Every sound the game can make. Files live in public/audio/ (see README credits). */
export const SFX = {
  place: ["panel-place-1.ogg", "panel-place-2.ogg"],
  lift: ["panel-lift.ogg"],
  denied: ["denied.ogg"],
  tick: ["sun-tick.ogg"],
  cursor: ["cursor.ogg"],
  step: ["step-1.ogg", "step-2.ogg"],
  ui: ["ui.ogg"],
  grow: ["grow.ogg"],
  hour: ["hour.ogg"],
  bloom: ["bloom.ogg"],
  wilt: ["wilt.ogg"],
  success: ["garden-blooms.ogg"],
  failure: ["garden-fails.ogg"],
  ending: ["ending.ogg"],
} as const;

export type Cue = keyof typeof SFX;

export const MUSIC = "music-observing-the-star.ogg";
export const AMBIENCE = "ambience-deep-space-array.ogg";

/** Plants whose health turns bad at exactly this hour of a day: each gets one wilt cue. */
export function wiltsAtHour(traces: readonly HourState[][], hour: number): number[] {
  const out: number[] = [];
  traces.forEach((trace, i) => {
    const now = trace[hour]?.health;
    const before = hour > 0 ? trace[hour - 1]?.health : "growing";
    if (now && now !== "growing" && before === "growing") out.push(i);
  });
  return out;
}
