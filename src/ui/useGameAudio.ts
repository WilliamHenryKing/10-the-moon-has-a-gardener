import { useEffect, useRef, useState } from "react";
import type { AudioEngine } from "../audio/engine";
import type { GameState } from "../game/state";
import type { GardenScene } from "../scene/stage";

/** Turn game-state transitions into sound cues. The day's own cues live in App. */
export function useGameAudio(audio: AudioEngine, scene: GardenScene, state: GameState): void {
  const prev = useRef(state);

  useEffect(() => {
    scene.onStep = () => audio.play("step", { gain: 0.35, rate: 0.8 });
    return () => {
      scene.onStep = null;
    };
  }, [audio, scene]);

  useEffect(() => {
    const p = prev.current;
    prev.current = state;
    if (p === state) return;

    if (p.phase !== state.phase) {
      if (state.phase === "growing") audio.play("grow", { gain: 0.7 });
      else if (state.phase === "result") audio.play(state.bloomed ? "success" : "failure");
      else if (state.phase === "ending") audio.play("ending");
      else audio.play("ui", { gain: 0.6 });
      return;
    }
    if (p.levelIndex !== state.levelIndex) return;
    if (state.panels.length > p.panels.length) audio.play("place", { gain: 0.8 });
    else if (state.panels.length < p.panels.length) audio.play("lift", { gain: 0.8 });
    else if (p.hour !== state.hour)
      audio.play("tick", { gain: 0.7, rate: 0.8 + state.hour * 0.06 });
    else if (p.cursor.x !== state.cursor.x || p.cursor.z !== state.cursor.z) {
      audio.play("cursor", { gain: 0.5 });
    }
  }, [audio, state]);
}

/** Mute state that follows the engine, for the toggle button. */
export function useMuted(audio: AudioEngine): boolean {
  const [muted, setMuted] = useState(audio.muted);
  useEffect(() => audio.subscribe(setMuted), [audio]);
  return muted;
}
