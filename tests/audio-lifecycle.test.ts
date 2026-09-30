import { afterEach, expect, test } from "bun:test";
import { AudioEngine } from "../src/audio/engine";

class Node {
  gain = {
    value: 0,
    setTargetAtTime: (_v: number) => {},
    setValueAtTime: () => {},
    linearRampToValueAtTime: () => {},
    cancelScheduledValues: () => {},
  };
  playbackRate = { value: 1 };
  disconnected = 0;
  connect(destination: Node) {
    return destination;
  }
  disconnect() {
    this.disconnected++;
  }
}
class Source extends Node {
  onended: (() => void) | null = null;
  stops = 0;
  start() {}
  stop() {
    this.stops++;
  }
}
class Context {
  static all: Context[] = [];
  static decode = () => Promise.resolve({ duration: 30 });
  destination = new Node();
  currentTime = 10;
  sources: Source[] = [];
  gains: Node[] = [];
  closed = 0;
  state = "running";
  constructor() {
    Context.all.push(this);
  }
  createGain() {
    const n = new Node();
    this.gains.push(n);
    return n;
  }
  createBufferSource() {
    const n = new Source();
    this.sources.push(n);
    return n;
  }
  decodeAudioData() {
    return Context.decode();
  }
  async resume() {}
  async suspend() {}
  async close() {
    this.closed++;
    this.state = "closed";
  }
}
const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
const oldFetch = globalThis.fetch;
const sounds: AudioEngine[] = [];
const visibility = new Set<() => void>();
const timers = new Map<number, () => void>();
const signals: AbortSignal[] = [];
let timerId = 0;
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function sound() {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      AudioContext: Context,
      localStorage: { getItem: () => null, setItem: () => {} },
      setTimeout: (fn: () => void) => {
        const id = ++timerId;
        timers.set(id, fn);
        return id;
      },
      clearTimeout: (id: number) => timers.delete(id),
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      hidden: false,
      addEventListener: (_: string, fn: () => void) => visibility.add(fn),
      removeEventListener: (_: string, fn: () => void) => visibility.delete(fn),
    },
  });
  globalThis.fetch = ((_url: string, init: RequestInit) => {
    if (init.signal) signals.push(init.signal);
    return Promise.resolve(new Response(new Uint8Array([1])));
  }) as unknown as typeof fetch;
  const s = new AudioEngine();
  sounds.push(s);
  return s;
}
afterEach(() => {
  for (const s of sounds.splice(0)) s.dispose();
  for (const [key, old] of [
    ["window", oldWindow],
    ["document", oldDocument],
  ] as const) {
    if (old) Object.defineProperty(globalThis, key, old);
    else Reflect.deleteProperty(globalThis, key);
  }
  globalThis.fetch = oldFetch;
  Context.all.length = 0;
  Context.decode = () => Promise.resolve({ duration: 30 });
  visibility.clear();
  timers.clear();
  signals.length = 0;
});
test("late audio decodes cannot revive disposed engines or their loops", async () => {
  let finish: (buffer: { duration: number }) => void = () => {};
  Context.decode = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const s = sound();
  s.unlock();
  await tick();
  const ctx = Context.all[0];
  s.dispose();
  s.dispose();
  expect(ctx?.closed).toBe(1);
  expect(visibility.size).toBe(0);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  finish({ duration: 30 });
  await tick();
  s.unlock();
  expect(Context.all).toHaveLength(1);
  expect(ctx?.sources).toHaveLength(0);
});

test("ended voices disconnect and teardown closes all buses, timers and loops", async () => {
  const s = sound();
  s.unlock();
  await tick();
  await tick();
  const ctx = Context.all[0];
  if (!ctx) throw new Error("Missing context");
  expect(ctx.sources).toHaveLength(2);
  s.play("place");
  const effect = ctx.sources.at(-1);
  effect?.onended?.();
  expect(effect?.disconnected).toBe(1);
  expect(effect?.onended).toBeNull();
  s.setMuted(true);
  expect(timers.size).toBe(1);
  s.dispose();
  s.dispose();
  expect(ctx.closed).toBe(1);
  expect(timers.size).toBe(0);
  expect(visibility.size).toBe(0);
  for (const node of [...ctx.sources, ...ctx.gains]) expect(node.disconnected).toBe(1);
});
