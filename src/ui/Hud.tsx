import { LEVELS } from "../game/levels";
import { type PlantReport, SPECIES, tileLabel } from "../game/rules";
import type { Level } from "../game/types";
import { hourLabel, SPECIES_COLOR, VERDICT_TEXT } from "./text";

const VERDICT_COLOR = {
  bloom: "var(--color-bloom)",
  scorched: "var(--color-scorch)",
  starved: "var(--color-starve)",
} as const;

export function TopBar(props: {
  level: Level;
  index: number;
  panelsLeft: number;
  canClear: boolean;
  onClear: () => void;
  mute: React.ReactNode;
}) {
  const { level, index, panelsLeft } = props;
  return (
    <header className="pointer-events-none flex items-start justify-between gap-3 p-3 sm:p-5">
      <div className="glass pointer-events-auto max-w-md rounded-2xl px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-dim">
          Garden {index + 1}/{LEVELS.length}
        </p>
        <h1 className="text-lg font-semibold leading-tight sm:text-xl">{level.name}</h1>
        <p className="mt-1 hidden text-sm leading-snug text-dim sm:block">{level.note}</p>
      </div>
      <div className="glass pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-2">
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-dim">Panels</p>
          <p className="text-lg font-semibold tabular-nums" aria-live="polite">
            {panelsLeft}
            <span className="text-sm text-dim">
              {" "}
              / {level.panels}
              <span className="hidden sm:inline"> on rover</span>
            </span>
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost text-sm"
          onClick={props.onClear}
          disabled={!props.canClear}
          aria-label="Lift every panel back onto the rover"
        >
          Clear
        </button>
        {props.mute}
      </div>
    </header>
  );
}

/** One chip per plant: its light so far and whether the coming day suits it. */
export function PlantList({ reports }: { reports: PlantReport[] }) {
  return (
    <ul className="flex gap-2 overflow-x-auto px-3 pb-1 sm:flex-col sm:overflow-visible sm:px-0">
      {reports.map((r) => {
        const s = SPECIES[r.plant.species];
        return (
          <li
            key={tileLabel(r.plant)}
            className="glass flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm"
          >
            <span
              aria-hidden
              className="size-3 rounded-full"
              style={{ background: SPECIES_COLOR[r.plant.species] }}
            />
            <span className="font-semibold">{s.name}</span>
            <span className="text-dim">{tileLabel(r.plant)}</span>
            <span className="tabular-nums">
              {r.lit}/8{" "}
              <span className="text-dim">
                (needs {s.min === s.max ? s.min : `${s.min}–${s.max}`})
              </span>
            </span>
            <span className="font-semibold" style={{ color: VERDICT_COLOR[r.verdict] }}>
              {VERDICT_TEXT[r.verdict]}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function SunControl(props: {
  hour: number;
  disabled: boolean;
  growing: boolean;
  dayHour: number;
  onHour: (h: number) => void;
  onGrow: () => void;
}) {
  const { hour, disabled } = props;
  return (
    <div className="glass pointer-events-auto flex w-full flex-col gap-2 rounded-2xl p-3 sm:w-auto sm:min-w-[440px]">
      <div className="flex items-center justify-between gap-2 text-sm">
        <label htmlFor="sun" className="font-semibold">
          Turn the Sun
        </label>
        <span className="tabular-nums text-dim" aria-live="polite">
          {props.growing
            ? `Growing… hour ${Math.min(8, Math.floor(props.dayHour) + 1)} of 8`
            : hourLabel(hour)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-ghost px-3"
          aria-label="Previous sun position"
          disabled={disabled}
          onClick={() => props.onHour((hour + 7) % 8)}
        >
          ◀
        </button>
        <input
          id="sun"
          className="sun-range min-w-0 flex-1"
          type="range"
          min={0}
          max={7}
          step={1}
          value={hour}
          disabled={disabled}
          aria-valuetext={hourLabel(hour)}
          onChange={(e) => props.onHour(Number(e.currentTarget.value))}
        />
        <button
          type="button"
          className="btn btn-ghost px-3"
          aria-label="Next sun position"
          disabled={disabled}
          onClick={() => props.onHour((hour + 1) % 8)}
        >
          ▶
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={disabled}
          onClick={props.onGrow}
        >
          Grow a day
        </button>
      </div>
    </div>
  );
}

/** Persistent sound toggle (also the M key). */
export function MuteButton({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="btn btn-ghost glass px-3 text-sm"
      aria-pressed={muted}
      aria-label={muted ? "Sound off. Turn sound on (M)" : "Sound on. Mute (M)"}
      title="Sound (M)"
      onClick={onToggle}
    >
      <span aria-hidden>{muted ? "🔇" : "🔊"}</span>
    </button>
  );
}
