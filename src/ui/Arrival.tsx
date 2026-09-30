import { hud, introActions, useHud } from "./hud-store";

// The arrival's words: the title card over the opening shot, a skip button during the descent,
// and the controls card as play begins (Mission Control teaches the rest on the radio).

function TitleCard() {
  const muted = useHud((s) => s.muted);
  return (
    <div className="title-in pointer-events-auto fixed inset-0 z-20 flex items-end sm:items-center">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgb(4 5 10 / 0.82) 0%, rgb(4 5 10 / 0.55) 38%, rgb(4 5 10 / 0) 68%)",
        }}
      />
      <div className="relative flex max-w-[34rem] flex-col gap-5 px-6 pb-10 sm:pb-0 sm:pl-14">
        <div className="text-[11px] font-bold uppercase tracking-[0.34em] text-sun">
          A garden at the lunar south pole
        </div>
        <h1 className="m-0 text-4xl font-semibold leading-[1.05] tracking-tight text-balance sm:text-6xl">
          The Moon Has a Gardener
        </h1>
        <p className="m-0 max-w-[30rem] text-base leading-relaxed text-ink/85 sm:text-lg">
          The colony ship <i>Perennial</i> lands in eighteen minutes with twelve people aboard, and
          the new dome holds no air. Grow a garden that breathes it full.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-primary px-6 text-base"
            onClick={() => introActions.begin()}
          >
            Begin the descent
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => introActions.mute()}>
            {muted ? "Sound off" : "Sound on"}
          </button>
          <span className="text-xs text-dim">or press Enter</span>
        </div>
        <p className="m-0 max-w-[28rem] text-xs leading-relaxed text-dim">
          The land around the basin is the real south pole: the ridge between Shackleton and de
          Gerlache craters, from NASA&apos;s Lunar Orbiter Laser Altimeter.
        </p>
      </div>
    </div>
  );
}

function SkipButton() {
  return (
    <div className="pointer-events-auto fixed right-4 bottom-4 z-20 flex items-center gap-3">
      <span className="text-xs text-dim">Esc</span>
      <button type="button" className="btn btn-ghost" onClick={() => introActions.skip()}>
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
  ["1 – 7", "choose a seed (or Q / R)"],
  ["M", "sound on or off"],
];

function ControlsCard() {
  return (
    <div className="pointer-events-auto fixed top-1/2 right-3 z-20 w-[min(300px,86vw)] -translate-y-1/2 sm:right-5">
      <div className="glass flex flex-col gap-3 rounded-2xl p-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-sun">
          Suit controls
        </div>
        <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-sm">
          {KEYS.map(([k, what]) => (
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
          onClick={() => hud.set({ controls: false })}
        >
          Got it
        </button>
      </div>
    </div>
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
