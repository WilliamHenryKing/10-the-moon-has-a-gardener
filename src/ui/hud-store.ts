import { useSyncExternalStore } from "react";
import type { Medal } from "../game/garden";
import type { Held } from "../game/session";
import type { SpeciesId } from "../game/species";

// What the suit's displays show, published by the game loop a few times a second and read by
// React. One store, no framework: set() merges, subscribers re-render.

export interface RadioLine {
  id: number;
  who: "Mission Control" | "Suit" | "Perennial";
  text: string;
  /** Seconds it stays (then fades). */
  hold: number;
}

export interface HudState {
  /** The world has drawn a successful frame; controls remain inert until then. */
  ready: boolean;
  /** Live motion preference, published by main. */
  reduced: boolean;
  /** Dome oxygen, 0 … 1, and production per second (share of the dome per minute). */
  oxygen: number;
  perMinute: number;
  /** Seconds until the Perennial lands (negative once it has). */
  eta: number;
  /** The ship actually landed, including an early arrival after the dome fills. */
  shipLanded: boolean;
  seeds: Record<SpeciesId, number>;
  /** Species the gardener has ever held (the rest show as unknown). */
  known: SpeciesId[];
  selected: Held;
  can: number;
  canMax: number;
  panels: number;
  sprinklers: number;
  prompt: { verb: string; detail: string; ok: boolean } | null;
  radio: RadioLine[];
  /** The current action-led instruction stays until the rules advance it. */
  guide: { text: string } | null;
  banner: { id: number; title: string; sub: string } | null;
  medal: Medal | null;
  /** Hide everything (intro, photo mode). */
  hidden: boolean;
  /** Where the arrival film is: the title card, the descent, or play. */
  intro: "title" | "descent" | "play";
  /** The controls card, shown as play begins. */
  controls: boolean;
  muted: boolean;
  /** The medal card at the end: how it went. */
  ending: { medal: Medal; minutes: number; plants: number; species: number } | null;
}

const initialState = (): HudState => ({
  ready: false,
  reduced: false,
  oxygen: 0,
  perMinute: 0,
  eta: 0,
  shipLanded: false,
  seeds: {
    mooncress: 0,
    sunleaf: 0,
    nightbell: 0,
    glassfern: 0,
    craterbloom: 0,
    birch: 0,
    orchid: 0,
  },
  known: [],
  selected: "mooncress",
  can: 0,
  canMax: 6,
  panels: 0,
  sprinklers: 0,
  prompt: null,
  radio: [],
  guide: null,
  banner: null,
  medal: null,
  hidden: false,
  intro: "play",
  controls: false,
  muted: false,
  ending: null,
});
let state = initialState();
const listeners = new Set<() => void>();

export const hud = {
  get: () => state,
  set(patch: Partial<HudState>) {
    state = { ...state, ...patch };
    for (const l of listeners) l();
  },
  reset() {
    state = initialState();
    radioId = bannerId = 1;
    for (const listener of listeners) listener();
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

let radioId = 1;
/** Say something on the radio (newest last; the oldest drop off). */
export function say(who: RadioLine["who"], text: string, hold = 9) {
  const radio = [...state.radio, { id: radioId++, who, text, hold }].slice(-3);
  hud.set({ radio });
}

/** What the title card's buttons do (main wires them). */
export const introActions = {
  begin: () => {},
  skip: () => {},
  mute: () => {},
  /** Reopen/dismiss the controls and leave focus in the active game. */
  controls: (_open: boolean) => {},
  /** From the medal card: back to the garden, or start again. */
  resume: () => {},
  replay: () => {},
};

let bannerId = 1;
export function banner(title: string, sub: string) {
  hud.set({ banner: { id: bannerId++, title, sub } });
}

export function useHud<T>(pick: (s: HudState) => T): T {
  return useSyncExternalStore(hud.subscribe, () => pick(state));
}
