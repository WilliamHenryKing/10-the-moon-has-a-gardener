import type { Cue } from "./cues";

/**
 * Web Audio fallbacks, used only when a file fails to load or decode (for example a
 * browser without Ogg Vorbis). Each is a short enveloped tone in the garden's key.
 */
const TONES: Record<Cue, { f: number; to?: number; d: number; type: OscillatorType; g: number }> = {
  place: { f: 180, to: 120, d: 0.18, type: "triangle", g: 0.5 },
  lift: { f: 520, to: 780, d: 0.12, type: "sine", g: 0.35 },
  denied: { f: 140, d: 0.14, type: "square", g: 0.12 },
  cursor: { f: 900, d: 0.02, type: "sine", g: 0.08 },
  step: { f: 90, to: 60, d: 0.08, type: "triangle", g: 0.25 },
  ui: { f: 660, d: 0.1, type: "sine", g: 0.25 },
  grow: { f: 330, to: 660, d: 0.5, type: "sine", g: 0.3 },
  hour: { f: 1320, d: 0.25, type: "sine", g: 0.15 },
  bloom: { f: 990, to: 1480, d: 0.6, type: "sine", g: 0.25 },
  wilt: { f: 300, to: 150, d: 0.5, type: "sawtooth", g: 0.08 },
  success: { f: 523, to: 1046, d: 1.1, type: "triangle", g: 0.3 },
  ending: { f: 392, to: 784, d: 1.6, type: "triangle", g: 0.3 },
};

export function synthCue(
  ctx: AudioContext,
  out: AudioNode,
  cue: Cue,
  rate = 1,
  onEnd?: () => void,
): () => void {
  const t = TONES[cue];
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = t.type;
  osc.frequency.setValueAtTime(t.f * rate, now);
  if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to * rate, now + t.d);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(t.g, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + t.d);
  osc.connect(gain).connect(out);
  osc.start(now);
  osc.stop(now + t.d + 0.05);
  const stop = () => {
    try {
      osc.stop();
    } catch {
      /* already ended */
    }
    osc.disconnect();
    gain.disconnect();
    out.disconnect();
    onEnd?.();
  };
  osc.onended = stop;
  return stop;
}

/** A slow generative drone: two detuned voices through a breathing low-pass filter. */
export function synthBed(ctx: AudioContext, out: AudioNode): () => void {
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 420;
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.05;
  lfoGain.gain.value = 180;
  lfo.connect(lfoGain).connect(filter.frequency);
  const level = ctx.createGain();
  level.gain.value = 0.18;
  filter.connect(level).connect(out);
  const voices = [55, 82.4, 110.3].map((f) => {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    o.connect(filter);
    o.start();
    return o;
  });
  lfo.start();
  return () => {
    for (const o of [...voices, lfo]) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
      o.disconnect();
    }
    filter.disconnect();
    lfoGain.disconnect();
    level.disconnect();
  };
}
