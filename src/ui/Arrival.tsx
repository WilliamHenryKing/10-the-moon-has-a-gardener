import { introActions, useHud } from "./hud-store";
import { SoundButton } from "./SoundButton";
import { usePanelFocus } from "./usePanelFocus";

// The arrival's words: the title card over the opening shot, a skip button during the descent,
// and the controls card as play begins (Mission Control teaches the rest on the radio).

function TitleCard() {
  const ready = useHud((s) => s.ready);
  const focus = usePanelFocus<HTMLButtonElement>(ready);
  return (
    <section
      className="arrival-title title-in pointer-events-auto fixed inset-0 z-20 flex items-end sm:items-center"
      aria-labelledby="arrival-title"
    >
      <div
        className="arrival-scrim pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgb(4 5 10 / 0.82) 0%, rgb(4 5 10 / 0.55) 38%, rgb(4 5 10 / 0) 68%)",
        }}
      />
      <div className="arrival-copy relative flex max-w-[34rem] flex-col gap-5 px-6 pb-10 sm:pb-0 sm:pl-14">
        <div className="text-[11px] font-bold uppercase tracking-[0.34em] text-sun">
          A garden at the lunar south pole
        </div>
        <h1
          id="arrival-title"
          className="m-0 text-4xl font-semibold leading-[1.05] tracking-tight text-balance sm:text-6xl"
        >
          The Moon Has a Gardener
        </h1>
        <p className="m-0 max-w-[30rem] text-base leading-relaxed text-ink/85 sm:text-lg">
          The colony ship <i>Perennial</i> lands in eighteen minutes with twelve people aboard, and
          the new dome holds no air. Grow a garden that breathes it full.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            ref={focus}
            disabled={!ready}
            className="btn btn-primary px-6 text-base"
            onClick={() => introActions.begin()}
          >
            Begin the descent
          </button>
          <SoundButton />
          <span className="text-xs text-dim">or press Enter</span>
        </div>
        <p className="arrival-source m-0 max-w-[28rem] text-xs leading-relaxed text-dim">
          The land around the basin is the real south pole: the ridge between Shackleton and de
          Gerlache craters, from NASA&apos;s Lunar Orbiter Laser Altimeter.
        </p>
      </div>
    </section>
  );
}

function SkipButton() {
  const focus = usePanelFocus<HTMLButtonElement>();
  return (
    <div className="pointer-events-auto fixed right-4 bottom-4 z-20 flex items-center gap-3">
      <span className="text-xs text-dim">Esc</span>
      <button
        ref={focus}
        type="button"
        className="btn btn-ghost"
        onClick={() => introActions.skip()}
      >
        Skip
      </button>
    </div>
  );
}

const KEYS: [string, string][] = [
  ["W A S D", "walk (Shift to lope)"],
  ["Drag", "look around · wheel to zoom"],
  ["Space", "jump, long and floaty"],
  ["E", "plant · water · gather · open"],
  ["1 – 9", "seed or tool (or Q / R)"],
  ["M", "sound on or off"],
];

const TOUCH: [string, string][] = [
  ["Left side", "drag to walk"],
  ["Right side", "drag to look around"],
  ["Act", "plant · water · gather · open"],
  ["Jump", "long and floaty"],
  ["Pouch", "tap a seed to hold it"],
];

function ControlsCard() {
  const focus = usePanelFocus<HTMLHeadingElement>();
  const touch = window.matchMedia("(pointer: coarse)").matches;
  const rows = touch ? TOUCH : KEYS;
  return (
    <section
      className="controls-card pointer-events-auto fixed z-20"
      aria-labelledby="controls-title"
    >
      <div className="glass flex flex-col gap-3 rounded-2xl p-4">
        <h2
          id="controls-title"
          ref={focus}
          tabIndex={-1}
          data-keyboard-scroll
          className="m-0 text-[11px] font-bold uppercase tracking-[0.2em] text-sun"
        >
          Suit controls
        </h2>
        <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-sm">
          {rows.map(([k, what]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="rounded-md border border-ink/40 px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap">
                  {k}
                </kbd>
              </dt>
              <dd className="m-0 text-ink/85">{what}</dd>
            </div>
          ))}
        </dl>
        <p className="m-0 text-xs leading-relaxed text-dim">
          The ring on the ground shows where a seed will go: green where it will thrive.
        </p>
        <button
          type="button"
          className="btn btn-ghost self-start"
          onClick={() => introActions.controls(false)}
        >
          Got it
        </button>
      </div>
    </section>
  );
}

export function Arrival() {
  const intro = useHud((s) => s.intro);
  const controls = useHud((s) => s.controls);
  return (
    <>
      {intro === "title" && <TitleCard />}
      {intro === "descent" && <SkipButton />}
      {intro === "play" && controls && <ControlsCard />}
    </>
  );
}
