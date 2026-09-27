import { useEffect, useRef } from "react";
import { LEVELS } from "../game/levels";
import type { PlantReport } from "../game/rules";
import { failureLine } from "./text";

function Card(props: { children: React.ReactNode; label: string; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={props.label}
      className={`glass pointer-events-auto mx-3 rounded-3xl p-6 text-center shadow-2xl sm:p-8 ${props.wide ? "max-w-lg" : "max-w-md"}`}
    >
      {props.children}
    </div>
  );
}

export function TitleCard({ onStart }: { onStart: () => void }) {
  return (
    <Card label="Title" wide>
      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-dim">
        A lunar light-and-shade garden
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        The Moon Has a Gardener
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-dim sm:text-base">
        At the lunar south pole the Sun never climbs: it circles the horizon once each lunar day,
        throwing long shadows every way. Stand shade panels to give each plant its share of light,
        then grow a day and watch.
      </p>
      <button type="button" className="btn btn-primary mt-6 px-8" onClick={onStart}>
        Step outside
      </button>
    </Card>
  );
}

export function ResultCard(props: {
  bloomed: boolean;
  reports: PlantReport[];
  last: boolean;
  onNext: () => void;
  onRetry: () => void;
}) {
  if (props.bloomed) {
    return (
      <Card label="The garden blooms">
        <h2 className="text-2xl font-semibold">The garden blooms</h2>
        <p className="mt-2 text-sm text-dim">Every plant had the day it needed.</p>
        <button type="button" className="btn btn-primary mt-5 px-8" onClick={props.onNext}>
          {props.last ? "Look up" : "Next garden"}
        </button>
      </Card>
    );
  }
  const failed = props.reports.filter((r) => r.verdict !== "bloom");
  return (
    <Card label="Not this time">
      <h2 className="text-2xl font-semibold">Not this time</h2>
      <ul className="mt-3 space-y-1 text-left text-sm text-dim">
        {failed.map((r) => (
          <li key={`${r.plant.x},${r.plant.z}`}>{failureLine(r)}</li>
        ))}
      </ul>
      <button type="button" className="btn btn-primary mt-5 px-8" onClick={props.onRetry}>
        Move the panels
      </button>
    </Card>
  );
}

export function EndingCard({ days, onReplay }: { days: number; onReplay: () => void }) {
  return (
    <Card label="Ending" wide>
      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-dim">
        {LEVELS.length} gardens · {days} lunar days
      </p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight">The Moon has a gardener.</h2>
      <p className="mt-4 text-sm leading-relaxed text-dim sm:text-base">
        Sunleaf, mooncress and nightbell bloom along the crater rim. Nearly four hundred thousand
        kilometres away, Earth turns through its own day, and doesn't yet know.
      </p>
      <button type="button" className="btn btn-primary mt-6 px-8" onClick={onReplay}>
        Tend the garden again
      </button>
    </Card>
  );
}

/** First-time hint, taught in place over the garden. */
export function Hint({ step, onDismiss }: { step: 0 | 1; onDismiss: () => void }) {
  const text =
    step === 0
      ? "Tap a soil tile to stand a shade panel; tap it again to lift it. Keyboard: arrows and Enter."
      : "The 8 dots round each plant are the 8 hours of the lunar day, gold where light reaches it. Turn the Sun to see each shadow, then grow a day.";
  return (
    <div
      role="note"
      className="glass pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl px-4 py-3 text-sm"
    >
      <span aria-hidden className="mt-1 size-2 shrink-0 rounded-full bg-sun" />
      <p className="leading-snug">{text}</p>
      <button
        type="button"
        className="shrink-0 rounded-full px-2 text-dim hover:text-ink"
        aria-label="Dismiss hint"
        onClick={onDismiss}
      >
        ✕
      </button>
    </div>
  );
}
