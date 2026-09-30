/** Every sound the game can make. Files live in public/audio/ (see README credits). */
export const SFX = {
  place: ["panel-place-1.ogg", "panel-place-2.ogg"],
  lift: ["panel-lift.ogg"],
  denied: ["denied.ogg"],
  cursor: ["cursor.ogg"],
  step: ["step-1.ogg", "step-2.ogg"],
  ui: ["ui.ogg"],
  grow: ["grow.ogg"],
  hour: ["hour.ogg"],
  bloom: ["bloom.ogg"],
  wilt: ["wilt.ogg"],
  success: ["garden-blooms.ogg"],
  ending: ["ending.ogg"],
} as const;

export type Cue = keyof typeof SFX;

export const MUSIC = "music-observing-the-star.ogg";
export const AMBIENCE = "ambience-deep-space-array.ogg";
