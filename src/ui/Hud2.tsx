import { useEffect, useState } from "react";
import { pickSeed, setButton } from "../engine/input";
import { SPECIES, SPECIES_ORDER, type SpeciesId } from "../game/species";
import { type RadioLine, useHud } from "./hud-store";

// The suit's displays: dome oxygen and the mission clock across the top of the visor, Mission
// Control on the radio at the left, the seed pouch and kit along the bottom, and what E will do
// just under the middle of the view. Everything reads from the HUD store.

export const SPECIES_COLOUR: Record<SpeciesId, string> = {
  mooncress: "#6fdcc8",
  sunleaf: "#f0b23a",
  nightbell: "#9c8bff",
  glassfern: "#a8e4ff",
  craterbloom: "#ff7aa8",
  birch: "#e8e2cf",
  orchid: "#ffd46a",
};

const clock = (s: number) => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

function Oxygen() {
  const oxygen = useHud((s) => s.oxygen);
  const perMinute = useHud((s) => s.perMinute);
  const eta = useHud((s) => s.eta);
  const pct = Math.round(oxygen * 100);
  return (
    <div className="glass pointer-events-none mx-auto flex w-[min(520px,92vw)] flex-col gap-1.5 rounded-2xl px-4 py-2.5">
      <div className="flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">
        <span>Dome oxygen</span>
        <span className="tabular-nums text-ink">
          {eta > 0 ? (
            <>
              Perennial lands in <b className="text-sun">{clock(eta)}</b>
            </>
          ) : (
            <b className="text-sun">The Perennial has landed</b>
          )}
        </span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg, #3fbf9a, #7ef0cf)",
            boxShadow: "0 0 12px #6fdcc888",
          }}
        />
        {[25, 40, 60, 80].map((m) => (
          <div key={m} className="absolute inset-y-0 w-px bg-white/35" style={{ left: `${m}%` }} />
        ))}
      </div>
      <div className="flex justify-between text-xs tabular-nums">
        <span className="font-semibold">{pct}% full</span>
        <span className="text-dim">
          {perMinute > 0 ? `+${perMinute.toFixed(1)}% a minute` : "nothing breathing yet"}
        </span>
      </div>
    </div>
  );
}

function Line({ line }: { line: RadioLine }) {
  const [shown, setShown] = useState(0);
  const [fading, setFading] = useState(false);
  useEffect(() => {
    // Type the line out, then let it fade.
    let n = 0;
    const tick = setInterval(() => {
      n = Math.min(line.text.length, n + 2);
      setShown(n);
      if (n >= line.text.length) clearInterval(tick);
    }, 22);
    const fade = setTimeout(() => setFading(true), line.hold * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(fade);
    };
  }, [line]);
  return (
    <div
      className="glass max-w-[min(430px,80vw)] rounded-xl px-3 py-2 text-sm leading-snug transition-opacity duration-1000"
      style={{ opacity: fading ? 0 : 1 }}
    >
      <span className="mr-2 text-[10px] font-bold uppercase tracking-[0.16em] text-sun">
        {line.who}
      </span>
      {line.text.slice(0, shown)}
    </div>
  );
}

function Radio() {
  const radio = useHud((s) => s.radio);
  return (
    <div className="pointer-events-none flex flex-col items-start gap-1.5" aria-live="polite">
      {radio.map((l) => (
        <Line key={l.id} line={l} />
      ))}
    </div>
  );
}

function Glyph({ id, size = 18 }: { id: SpeciesId; size?: number }) {
  const c = SPECIES_COLOUR[id];
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="8.5" fill={`${c}33`} stroke={c} strokeWidth="1.4" />
      <path
        d="M10 15.5 C10 11 10 9 10 7.5 M10 10 C7.5 9 6.5 7 6.5 5.5 C8.5 5.5 10 7 10 9 M10 9.5 C12.5 8.5 13.5 6.5 13.5 5 C11.5 5 10 6.5 10 8.5"
        fill="none"
        stroke={c}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Shade panel and sprinkler, drawn in the glyphs' manner. */
function ToolGlyph({ tool }: { tool: "panel" | "sprinkler" }) {
  const c = tool === "panel" ? "#d9c9a0" : "#7cc4ff";
  return (
    <svg width={22} height={22} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="8.5" fill={`${c}22`} stroke={c} strokeWidth="1.4" />
      {tool === "panel" ? (
        <path
          d="M5.5 6 H14.5 V12 H5.5 Z M7 12 V15 M13 12 V15"
          fill="none"
          stroke={c}
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M10 15 V9 M10 9 C7 7 5.5 7.5 5 9 M10 9 C13 7 14.5 7.5 15 9 M7 5.5 L7.4 6.4 M10 4.5 V5.5 M13 5.5 L12.6 6.4"
          fill="none"
          stroke={c}
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

const TOOL_SLOTS = [
  { tool: "panel", name: "Panels", key: 8 },
  { tool: "sprinkler", name: "Sprinklers", key: 9 },
] as const;

function Pouch() {
  const seeds = useHud((s) => s.seeds);
  const known = useHud((s) => s.known);
  const selected = useHud((s) => s.selected);
  const panels = useHud((s) => s.panels);
  const sprinklers = useHud((s) => s.sprinklers);
  return (
    <fieldset className="glass pointer-events-auto m-0 flex gap-1 rounded-2xl border-0 p-1.5">
      <legend className="sr-only">Seed pouch</legend>
      {SPECIES_ORDER.map((id, i) => {
        const has = known.includes(id);
        const on = id === selected;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            aria-label={
              has
                ? `${SPECIES[id].name}: ${seeds[id]} seeds (key ${i + 1})`
                : `Unknown seed (key ${i + 1})`
            }
            onClick={() => pickSeed(i)}
            className={`relative flex w-[38px] flex-col items-center sm:w-[54px] gap-0.5 rounded-xl px-1 pb-1 pt-1.5 transition ${on ? "bg-white/14 ring-1 ring-sun" : "hover:bg-white/8"} ${has && seeds[id] > 0 ? "" : "opacity-45"}`}
          >
            <span className="absolute left-1 top-0.5 text-[9px] font-bold text-dim">{i + 1}</span>
            {has ? (
              <Glyph id={id} size={22} />
            ) : (
              <span className="grid h-[22px] w-[22px] place-items-center text-sm text-dim">?</span>
            )}
            <span className="hidden max-w-full truncate text-[10px] leading-tight sm:block">
              {has ? SPECIES[id].name : "—"}
            </span>
            <span className="text-[11px] font-bold tabular-nums">{has ? seeds[id] : ""}</span>
          </button>
        );
      })}
      {TOOL_SLOTS.map(({ tool, name, key }) => {
        const n = tool === "panel" ? panels : sprinklers;
        if (n <= 0 && selected !== tool) return null;
        const on = selected === tool;
        return (
          <button
            key={tool}
            type="button"
            aria-pressed={on}
            aria-label={`${name}: ${n} (key ${key})`}
            onClick={() => pickSeed(key - 1)}
            className={`relative flex w-[38px] flex-col items-center sm:w-[54px] gap-0.5 rounded-xl px-1 pb-1 pt-1.5 transition ${on ? "bg-white/14 ring-1 ring-sun" : "hover:bg-white/8"}`}
          >
            <span className="absolute left-1 top-0.5 text-[9px] font-bold text-dim">{key}</span>
            <ToolGlyph tool={tool} />
            <span className="hidden max-w-full truncate text-[10px] leading-tight sm:block">
              {name}
            </span>
            <span className="text-[11px] font-bold tabular-nums">{n}</span>
          </button>
        );
      })}
    </fieldset>
  );
}

const PIPS = Array.from({ length: 12 }, (_, i) => `pip-${i}`);

function Kit() {
  const can = useHud((s) => s.can);
  const canMax = useHud((s) => s.canMax);
  return (
    <div className="glass pointer-events-none flex flex-col gap-1.5 rounded-2xl px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="w-12 text-[10px] font-semibold uppercase tracking-[0.12em] text-dim">
          Water
        </span>
        <div className="flex gap-1" role="img" aria-label={`Watering can: ${can} of ${canMax}`}>
          {PIPS.slice(0, canMax).map((pip, i) => (
            <span
              key={pip}
              className="h-3 w-2 rounded-sm"
              style={{
                background: i < can ? "#6fb8ff" : "#ffffff22",
                boxShadow: i < can ? "0 0 6px #6fb8ff88" : "none",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Prompt() {
  const prompt = useHud((s) => s.prompt);
  if (!prompt) return null;
  return (
    <div className="pointer-events-none flex items-center gap-2.5 rounded-xl bg-black/45 px-3 py-1.5 text-sm backdrop-blur-sm">
      <kbd
        className={`grid h-6 w-6 place-items-center rounded-md border text-xs font-bold ${prompt.ok ? "border-ink/70 text-ink" : "border-scorch/60 text-scorch"}`}
      >
        E
      </kbd>
      <span className={prompt.ok ? "font-semibold" : "font-semibold text-scorch"}>
        {prompt.verb}
      </span>
      <span className="text-dim">{prompt.detail}</span>
    </div>
  );
}

function Banner() {
  const banner = useHud((s) => s.banner);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!banner) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 5200);
    return () => clearTimeout(t);
  }, [banner]);
  if (!banner) return null;
  return (
    <div
      className="pointer-events-none text-center transition-all duration-700"
      style={{ opacity: visible ? 1 : 0, transform: `translateY(${visible ? 0 : -8}px)` }}
    >
      <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-sun">Milestone</div>
      <div className="mt-1 text-2xl font-semibold drop-shadow-[0_2px_8px_#000]">{banner.title}</div>
      <div className="mt-0.5 text-sm text-dim drop-shadow-[0_1px_4px_#000]">{banner.sub}</div>
    </div>
  );
}

/** On touch screens: the two buttons a thumb needs (the left half of the screen is the stick). */
function TouchButtons() {
  const prompt = useHud((s) => s.prompt);
  const press = (name: "interact" | "jump") => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      setButton(name, true);
    },
    onPointerUp: () => setButton(name, false),
    onPointerCancel: () => setButton(name, false),
    onPointerLeave: () => setButton(name, false),
  });
  return (
    <div className="pointer-events-auto fixed right-4 bottom-44 z-20 flex flex-col items-center gap-3 [@media(pointer:fine)]:hidden">
      <button
        type="button"
        aria-label={prompt ? prompt.verb : "Act"}
        className="grid h-16 w-16 touch-none select-none place-items-center rounded-full border border-sun/60 bg-black/45 text-sm font-bold text-sun backdrop-blur-sm active:bg-sun/25"
        {...press("interact")}
      >
        Act
      </button>
      <button
        type="button"
        aria-label="Jump"
        className="grid h-12 w-12 touch-none select-none place-items-center rounded-full border border-ink/40 bg-black/45 text-xs font-semibold backdrop-blur-sm active:bg-white/15"
        {...press("jump")}
      >
        Jump
      </button>
    </div>
  );
}

export function Hud2() {
  const hidden = useHud((s) => s.hidden);
  return (
    <div
      className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-3 transition-opacity duration-500 sm:p-4"
      style={{
        opacity: hidden ? 0 : 1,
        paddingTop: "max(12px, env(safe-area-inset-top))",
        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
      }}
    >
      <div className="flex flex-col gap-3">
        <Oxygen />
        <Radio />
      </div>
      <div className="flex flex-col items-center gap-3">
        <Banner />
      </div>
      <div className="flex flex-col items-center gap-2.5">
        <Prompt />
        <div className="flex w-full items-end justify-center gap-3">
          <Pouch />
          <div className="hidden sm:block">
            <Kit />
          </div>
        </div>
      </div>
      {!hidden && <TouchButtons />}
    </div>
  );
}
