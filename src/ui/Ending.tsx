import { useEffect, useRef } from "react";
import { clock } from "./clock";
import { type HudState, introActions, useHud } from "./hud-store";
import { SoundButton } from "./SoundButton";

// The last card: the medal, what the garden did, and the way back to it (or round again).

const MEDALS = {
  gold: {
    title: "Gold",
    colour: "#ffd46a",
    line: "The dome was full before the Perennial touched down. They walked straight in.",
  },
  silver: {
    title: "Silver",
    colour: "#dfe6ee",
    line: "The Perennial waited on the pad a little while, and then the dome was full.",
  },
  bronze: {
    title: "Bronze",
    colour: "#e0a070",
    line: "A long wait on the pad, but every one of the twelve walked into air you grew.",
  },
} as const;

function Medallion({ colour }: { colour: string }) {
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
      <circle cx="42" cy="42" r="38" fill={`${colour}22`} stroke={colour} strokeWidth="2" />
      <circle cx="42" cy="42" r="29" fill="none" stroke={colour} strokeWidth="1" opacity="0.6" />
      <path
        d="M42 60 C42 50 42 44 42 38 M42 46 C36 44 33 39 33 34 C38 34 42 38 42 43 M42 44 C48 42 51 37 51 32 C46 32 42 36 42 41"
        fill="none"
        stroke={colour}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Ending() {
  const ending = useHud((s) => s.ending);
  return ending ? <EndingCard ending={ending} /> : null;
}

function EndingCard({ ending }: { ending: NonNullable<HudState["ending"]> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    node.showModal();
    node.scrollTop = 0;
    heading.current?.focus({ preventScroll: true });
    return () => {
      if (node.open) node.close();
    };
  }, []);
  const m = MEDALS[ending.medal];
  return (
    <dialog
      ref={dialog}
      className="moon-ending"
      aria-labelledby="ending-title"
      onCancel={(event) => {
        event.preventDefault();
        introActions.resume();
      }}
    >
      <div className="ending-panel glass flex w-full flex-col items-center gap-4 rounded-3xl px-7 py-8 text-center">
        <Medallion colour={m.colour} />
        <div
          className="text-[11px] font-bold uppercase tracking-[0.3em]"
          style={{ color: m.colour }}
        >
          {m.title}
        </div>
        <h2
          id="ending-title"
          ref={heading}
          tabIndex={-1}
          data-keyboard-scroll
          className="m-0 text-3xl font-semibold text-balance"
        >
          The first breath on the Moon
        </h2>
        <p className="m-0 text-sm leading-relaxed text-ink/85">{m.line}</p>
        <dl className="m-0 grid w-full grid-cols-3 gap-2 text-center">
          {[
            [clock(ending.minutes * 60), "to fill the dome"],
            [String(ending.plants), "plants in the ground"],
            [`${ending.species} of 7`, "species in bloom"],
          ].map(([v, k]) => (
            <div key={k} className="rounded-xl bg-white/6 px-2 py-2.5">
              <dt className="text-lg font-semibold tabular-nums">{v}</dt>
              <dd className="m-0 text-[11px] text-dim">{k}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap justify-center gap-3">
          <SoundButton />
          <button type="button" className="btn btn-primary" onClick={() => introActions.resume()}>
            Keep gardening
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => introActions.replay()}>
            Play again
          </button>
        </div>
      </div>
    </dialog>
  );
}
