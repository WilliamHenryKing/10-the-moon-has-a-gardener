import { AMBIENCE, type Cue, MUSIC, SFX } from "./cues";
import { synthBed, synthCue } from "./synth";

const MUTE_KEY = "moon-gardener:muted";
const BASE = `${import.meta.env.BASE_URL}audio/`;
const LEVELS = { music: 0.32, ambience: 0.38, sfx: 0.8 };

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Game audio on Web Audio. Nothing is fetched or played until the first user gesture
 * (browsers require it anyway); then SFX, music and ambience load in the background.
 * Music and ambience loop on their own buses; jingles duck the music. The context is
 * suspended while the tab is hidden, and mute persists between visits.
 */
export class AudioEngine {
  muted = readMuted();
  private disposed = false;
  private loads = new AbortController();
  private stops = new Set<() => void>();
  private timers = new Set<number>();
  private buses: AudioNode[] = [];
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer | null>(); // null while loading
  private failed = new Set<string>();
  private listeners = new Set<(muted: boolean) => void>();
  private rotation = new Map<Cue, number>();

  constructor() {
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  /** Call from any user gesture; the first one creates the context and starts loading. */
  unlock = (): void => {
    if (this.disposed) return;
    if (this.ctx) {
      if (!this.muted && !document.hidden) void this.ctx.resume().catch(() => {});
      return;
    }
    const Ctx = window.AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(ctx.destination);
    this.music = ctx.createGain();
    this.music.gain.value = LEVELS.music;
    this.music.connect(this.master);
    const ambience = ctx.createGain();
    ambience.gain.value = LEVELS.ambience;
    ambience.connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = LEVELS.sfx;
    this.sfx.connect(this.master);
    this.buses = [this.master, this.music, ambience, this.sfx];
    if (this.muted) void ctx.suspend().catch(() => {});

    void this.startLoop(AMBIENCE, ambience, true);
    void this.startLoop(MUSIC, this.music, false);
    for (const files of Object.values(SFX)) for (const f of files) void this.load(f);
  };

  private async load(file: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(file)) return this.buffers.get(file) ?? null;
    this.buffers.set(file, null);
    const ctx = this.ctx;
    if (!ctx) return null;
    try {
      const res = await fetch(BASE + file, { signal: this.loads.signal });
      if (!res.ok) throw new Error("Audio unavailable");
      const buf = await ctx.decodeAudioData(await res.arrayBuffer());
      if (this.disposed || this.ctx !== ctx) return null;
      this.buffers.set(file, buf);
      return buf;
    } catch {
      if (this.disposed || this.ctx !== ctx) return null;
      this.failed.add(file); // synth fallback covers it
      return null;
    }
  }

  private async startLoop(file: string, bus: GainNode, fallback: boolean): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    const buf = await this.load(file);
    if (this.disposed || this.ctx !== ctx) return;
    if (!buf) {
      if (fallback) this.stops.add(synthBed(ctx, bus));
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const fade = ctx.createGain();
    fade.gain.setValueAtTime(0, ctx.currentTime);
    fade.gain.linearRampToValueAtTime(1, ctx.currentTime + 4);
    src.connect(fade).connect(bus);
    this.ownVoice(src, fade);
    src.start();
  }

  play(cue: Cue, opts: { rate?: number; gain?: number; delay?: number } = {}): void {
    const ctx = this.ctx;
    if (this.disposed || !ctx || !this.sfx || this.muted) return;
    const files = SFX[cue];
    const n = this.rotation.get(cue) ?? 0;
    this.rotation.set(cue, n + 1);
    const file = files[n % files.length] ?? files[0];
    const buf = file ? this.buffers.get(file) : null;
    if (!buf && !(file && this.failed.has(file))) return; // still loading: stay quiet
    const out = ctx.createGain();
    out.gain.value = opts.gain ?? 1;
    out.connect(this.sfx);
    const rate = (opts.rate ?? 1) * (0.96 + Math.random() * 0.08);
    const when = ctx.currentTime + (opts.delay ?? 0);
    if (!buf) {
      const play = () => {
        if (!this.disposed && this.ctx === ctx) {
          const stop = synthCue(ctx, out, cue, rate, () => this.stops.delete(stop));
          this.stops.add(stop);
        }
      };
      if (opts.delay) this.later(play, opts.delay * 1000);
      else play();
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.connect(out);
    this.ownVoice(src, out);
    src.start(when);
    if (cue === "success" || cue === "ending") this.duck(buf.duration + 0.4);
  }

  /** Dip the music under a jingle, then bring it back. */
  private duck(seconds: number): void {
    const ctx = this.ctx;
    const g = this.music?.gain;
    if (!ctx || !g) return;
    const t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(LEVELS.music * 0.25, t + 0.15);
    g.setValueAtTime(LEVELS.music * 0.25, t + seconds);
    g.linearRampToValueAtTime(LEVELS.music, t + seconds + 1.5);
  }

  setMuted(muted: boolean): void {
    if (this.disposed) return;
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      /* not persisted this visit */
    }
    const ctx = this.ctx;
    if (ctx && this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05);
      if (muted)
        this.later(() => {
          if (this.muted) void ctx.suspend().catch(() => {});
        }, 250);
      else if (!document.hidden) void ctx.resume().catch(() => {});
    }
    for (const l of this.listeners) l(muted);
  }

  toggleMute = (): void => this.setMuted(!this.muted);

  subscribe(fn: (muted: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private ownVoice(src: AudioBufferSourceNode, out: GainNode) {
    const stop = () => {
      src.onended = null;
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      src.disconnect();
      out.disconnect();
      this.stops.delete(stop);
    };
    src.onended = stop;
    this.stops.add(stop);
  }

  private later(fn: () => void, ms: number) {
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      if (!this.disposed) fn();
    }, ms);
    this.timers.add(timer);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.loads.abort();
    document.removeEventListener("visibilitychange", this.onVisibility);
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
    for (const stop of this.stops) stop();
    this.stops.clear();
    for (const bus of this.buses) bus.disconnect();
    this.buses.length = 0;
    const ctx = this.ctx;
    this.ctx = null;
    this.master = this.music = this.sfx = null;
    this.buffers.clear();
    this.failed.clear();
    this.listeners.clear();
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
  }

  private onVisibility = (): void => {
    const ctx = this.ctx;
    if (!ctx) return;
    if (document.hidden) void ctx.suspend().catch(() => {});
    else if (!this.muted) void ctx.resume().catch(() => {});
  };
}
