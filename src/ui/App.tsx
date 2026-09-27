import gsap from "gsap";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { wiltsAtHour } from "../audio/cues";
import type { AudioEngine } from "../audio/engine";
import { LEVELS } from "../game/levels";
import { growthTrace, HOURS, reportGarden, togglePanel } from "../game/rules";
import { initialState, levelOf, reduce } from "../game/state";
import type { Cell } from "../game/types";
import type { GardenScene } from "../scene/stage";
import { EndingCard, Hint, ResultCard, TitleCard } from "./Cards";
import { MuteButton, PlantList, SunControl, TopBar } from "./Hud";
import { describeTile } from "./text";
import { useGameAudio, useMuted } from "./useGameAudio";

const HINT_KEY = "moon-gardener:hint-done";
const readHintDone = (): boolean => {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
};

export function App(props: { scene: GardenScene; audio: AudioEngine; reduced: boolean }) {
  const { scene, audio, reduced } = props;
  const [state, dispatch] = useReducer(reduce, undefined, initialState);
  const [dayT, setDayT] = useState(0);
  const [keyboard, setKeyboard] = useState(false);
  const [hint, setHint] = useState<0 | 1 | null>(readHintDone() ? null : 0);
  const [announce, setAnnounce] = useState("");
  const level = levelOf(state);
  const reports = useMemo(() => reportGarden(level, state.panels), [level, state.panels]);
  const planning = state.phase === "plan";
  const muted = useMuted(audio);
  useGameAudio(audio, scene, state);

  // A toggle the rules refuse (plant, rock, empty rover) gets a soft "no".
  const stateRef = useRef(state);
  stateRef.current = state;
  const toggle = useCallback(
    (cell: Cell) => {
      const s = stateRef.current;
      if (s.phase === "plan" && !togglePanel(levelOf(s), s.panels, cell)) {
        audio.play("denied", { gain: 0.5 });
      }
      dispatch({ type: "toggle", cell });
    },
    [audio],
  );

  const finishHint = useCallback(() => {
    setHint(null);
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      /* storage unavailable: the hint simply returns next visit */
    }
  }, []);

  // Scene sync: level, panels, sun hour, cursor, ending.
  useEffect(() => scene.setLevel(level), [scene, level]);
  const firstPanels = useRef(true);
  useEffect(() => {
    scene.setPanels(state.panels, !firstPanels.current);
    firstPanels.current = false;
  }, [scene, state.panels]);
  useEffect(() => {
    if (planning) scene.setHour(state.hour);
  }, [scene, state.hour, planning]);
  useEffect(() => {
    scene.setCursor(planning && keyboard ? state.cursor : null);
  }, [scene, state.cursor, planning, keyboard]);
  useEffect(() => scene.setEnding(state.phase === "ending"), [scene, state.phase]);
  useEffect(() => {
    if (state.phase === "plan") scene.setDay(null);
  }, [scene, state.phase]);

  // Tapping a tile in the 3D garden.
  useEffect(() => {
    scene.onTile = (cell: Cell) => {
      setKeyboard(false);
      toggle(cell);
    };
    return () => {
      scene.onTile = null;
    };
  }, [scene, toggle]);

  // Advance the hint once the first panel stands.
  useEffect(() => {
    if (hint === 0 && state.panels.length > 0) setHint(1);
  }, [hint, state.panels.length]);

  // One lunar day: the Sun circles, plants grow hour by hour, then bloom or wilt.
  useEffect(() => {
    if (state.phase !== "growing" || !state.reports) return;
    const traces = state.reports.map((r) => growthTrace(r.plant.species, r.mask));
    const clock = { t: 0, bloom: 0 };
    let heard = -1;
    let bloomed = false;
    const push = () => {
      const hour = Math.min(HOURS - 1, Math.floor(clock.t));
      if (hour > heard && clock.t < HOURS) {
        heard = hour;
        audio.play("hour", { gain: 0.35, rate: 0.9 + hour * 0.05 });
        for (const _ of wiltsAtHour(traces, hour)) audio.play("wilt", { gain: 0.45 });
      }
      if (clock.bloom > 0 && !bloomed) {
        bloomed = true;
        traces.forEach((t, i) => {
          if (t[HOURS - 1]?.health === "growing") {
            audio.play("bloom", { gain: 0.55, rate: 1 + i * 0.12, delay: i * 0.12 });
          }
        });
      }
      scene.setDay({ traces, t: clock.t, bloom: clock.bloom });
      scene.setHour(clock.t);
      setDayT(clock.t);
    };
    // The day always starts at hour 1 (east); rewind the preview there first.
    scene.setHour(0);
    const tl = gsap.timeline({ onComplete: () => dispatch({ type: "dayEnded" }) });
    tl.to(clock, { t: HOURS, duration: reduced ? 1.2 : 7, ease: "none", onUpdate: push });
    tl.to(clock, { bloom: 1, duration: reduced ? 0.2 : 1.2, ease: "power2.out", onUpdate: push });
    return () => {
      tl.kill();
    };
  }, [state.phase, state.reports, scene, reduced, audio]);

  // Keyboard: arrows move the cursor, Enter/Space toggles, [ ] turn the Sun, G grows.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inControl = t?.closest("input, button, a, [role=dialog]") !== null;
      if ((e.key === "m" || e.key === "M") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        audio.toggleMute();
        return;
      }
      if (state.phase !== "plan") return;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const move = moves[e.key];
      if (move && !inControl) {
        e.preventDefault();
        setKeyboard(true);
        dispatch({ type: "moveCursor", dx: move[0], dz: move[1] });
      } else if ((e.key === "Enter" || e.key === " ") && !inControl) {
        e.preventDefault();
        setKeyboard(true);
        toggle(state.cursor);
      } else if (e.key === "[" || e.key === "]") {
        dispatch({ type: "setHour", hour: (state.hour + (e.key === "]" ? 1 : 7)) % 8 });
      } else if ((e.key === "g" || e.key === "G") && !inControl) {
        dispatch({ type: "grow" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.phase, state.cursor, state.hour, toggle, audio]);

  // Announce the cursor tile and walk the gardener there.
  useEffect(() => {
    if (!keyboard || !planning) return;
    scene.visit(state.cursor);
    setAnnounce(describeTile(level, state.panels, reports, state.cursor));
  }, [keyboard, planning, state.cursor, level, state.panels, reports, scene]);

  const hudVisible =
    state.phase === "plan" || state.phase === "growing" || state.phase === "result";

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {hudVisible && (
        <TopBar
          level={level}
          index={state.levelIndex}
          panelsLeft={level.panels - state.panels.length}
          canClear={planning && state.panels.length > 0}
          onClear={() => dispatch({ type: "clear" })}
          mute={<MuteButton muted={muted} onToggle={audio.toggleMute} />}
        />
      )}
      {hudVisible && (
        <div className="pointer-events-auto sm:absolute sm:top-36 sm:left-5 sm:w-auto">
          <PlantList reports={reports} />
        </div>
      )}

      {!hudVisible && (
        <div className="pointer-events-auto absolute top-3 right-3 sm:top-5 sm:right-5">
          <MuteButton muted={muted} onToggle={audio.toggleMute} />
        </div>
      )}
      <div className="flex flex-1 items-center justify-center">
        {state.phase === "title" && <TitleCard onStart={() => dispatch({ type: "start" })} />}
        {state.phase === "ending" && (
          <EndingCard days={state.daysGrown} onReplay={() => dispatch({ type: "replay" })} />
        )}
      </div>

      {hudVisible && (
        <footer className="flex flex-col items-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-5">
          {planning && hint !== null && <Hint step={hint} onDismiss={finishHint} />}
          {state.phase === "result" && state.reports ? (
            <ResultCard
              bloomed={state.bloomed}
              reports={state.reports}
              last={state.levelIndex === LEVELS.length - 1}
              onNext={() => dispatch({ type: "next" })}
              onRetry={() => dispatch({ type: "retry" })}
            />
          ) : (
            <SunControl
              hour={state.hour}
              disabled={!planning}
              growing={state.phase === "growing"}
              dayHour={dayT}
              onHour={(h) => dispatch({ type: "setHour", hour: h })}
              onGrow={() => {
                if (hint === 1) finishHint();
                dispatch({ type: "grow" });
              }}
            />
          )}
        </footer>
      )}
    </div>
  );
}
