import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  bindInput,
  cancelButton,
  isEditingTarget,
  nativeKeyTarget,
  onInputReset,
  pickSeed,
  pulseButton,
  readIntent,
  resetInput,
  setButton,
  stepSeed,
  suppressRepeatedActivation,
} from "../src/engine/input";

type Listener = EventListenerOrEventListenerObject;
class Surface {
  listeners = new Map<string, Set<Listener>>();
  captures = new Set<number>();
  editing = false;
  native = false;
  scroll = false;
  hidden = false;
  clientHeight = 320;
  activeElement: Surface | null = null;
  pointerLockElement: Surface | null = null;
  addEventListener(type: string, listener: Listener) {
    let list = this.listeners.get(type);
    if (!list) {
      list = new Set();
      this.listeners.set(type, list);
    }
    list.add(listener);
  }
  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }
  fire(type: string, fields: Record<string, unknown> = {}) {
    const event = {
      ...fields,
      type,
      target: fields.target ?? this,
      defaultPrevented: fields.defaultPrevented === true,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === "function") listener.call(this, event as unknown as Event);
      else listener.handleEvent(event as unknown as Event);
    }
    return event;
  }
  closest(selector: string) {
    if (selector.startsWith("input,")) return this.editing ? this : null;
    return this.native || (this.scroll && selector.includes("data-keyboard-scroll")) ? this : null;
  }
  matches(selector: string) {
    return selector === "[data-keyboard-scroll]" && this.scroll;
  }
  getBoundingClientRect() {
    return { left: 20, top: 0, width: 600, height: 320 };
  }
  setPointerCapture(id: number) {
    this.captures.add(id);
  }
  hasPointerCapture(id: number) {
    return this.captures.has(id);
  }
  releasePointerCapture(id: number) {
    if (this.captures.delete(id)) this.fire("lostpointercapture", { pointerId: id });
  }
  focus() {
    doc.activeElement = this;
  }
  exitPointerLock() {
    this.pointerLockElement = null;
    this.fire("pointerlockchange");
  }
}

let win: Surface;
let doc: Surface;
let canvas: Surface;
let active: boolean;
let pads: (Gamepad | null)[];
let input: ReturnType<typeof bindInput>;
const originals = new Map<string, PropertyDescriptor | undefined>();
const eventTarget = (target: Surface) => target as unknown as EventTarget;

beforeEach(() => {
  win = new Surface();
  doc = new Surface();
  canvas = new Surface();
  active = true;
  pads = [];
  doc.activeElement = canvas;
  for (const [name, value] of Object.entries({
    window: win,
    document: doc,
    navigator: { getGamepads: () => pads },
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  input = bindInput(canvas as unknown as HTMLElement, () => active);
});
afterEach(() => {
  input.dispose();
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  originals.clear();
});

function key(type: "keydown" | "keyup", code: string, fields: Record<string, unknown> = {}) {
  return win.fire(type, { code, key: code === "Space" ? " " : code, target: canvas, ...fields });
}
function pointer(
  type: string,
  id: number,
  x: number,
  y = 100,
  fields: Record<string, unknown> = {},
) {
  return canvas.fire(type, {
    pointerId: id,
    pointerType: "touch",
    button: 0,
    clientX: x,
    clientY: y,
    ...fields,
  });
}
function pad(buttons: number[] = [], axes = [0, 0, 0, 0], id = "test pad") {
  pads = [
    {
      index: 0,
      id,
      connected: true,
      axes,
      buttons: Array.from({ length: 8 }, (_, i) => ({
        pressed: buttons.includes(i),
        value: buttons.includes(i) ? 1 : 0,
      })),
    } as unknown as Gamepad,
  ];
}

describe("native keyboard and transition ownership", () => {
  test("title, film and ending gates reject all play actions and clear stale holds", () => {
    key("keydown", "KeyW");
    setButton("jump", true, "touch");
    active = false;
    key("keydown", "KeyE");
    pointer("pointerdown", 1, 100);
    canvas.fire("wheel", { deltaY: 100 });
    pickSeed(3);
    stepSeed(1);
    expect(readIntent()).toMatchObject({
      moveY: 0,
      jump: false,
      interact: false,
      seedSlot: -1,
      seedStep: 0,
      zoom: 0,
    });
    expect(canvas.captures.size).toBe(0);
    active = true;
    expect(readIntent().jump).toBe(false);
    expect(readIntent().moveY).toBe(0);
  });

  test("buttons keep native Space; scroll surfaces keep Space and arrows", () => {
    const button = new Surface();
    button.native = true;
    expect(key("keydown", "Space", { target: button }).defaultPrevented).toBe(false);
    expect(readIntent().jump).toBe(false);
    button.scroll = true;
    expect(key("keydown", "ArrowRight", { target: button }).defaultPrevented).toBe(false);
    expect(readIntent().moveX).toBe(0);
    expect(nativeKeyTarget(eventTarget(button))).toBe(true);
    expect(
      suppressRepeatedActivation({
        key: " ",
        code: "Space",
        repeat: true,
        target: button,
      } as unknown as KeyboardEvent),
    ).toBe(false);
    button.scroll = false;
    expect(
      suppressRepeatedActivation({
        key: "Enter",
        code: "Enter",
        repeat: true,
        target: button,
      } as unknown as KeyboardEvent),
    ).toBe(true);
  });

  test("editing, modifiers and already-handled keys never mutate the game", () => {
    const editor = new Surface();
    editor.editing = true;
    expect(isEditingTarget(eventTarget(editor))).toBe(true);
    for (const fields of [
      { target: editor },
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
      { defaultPrevented: true },
    ]) {
      key("keydown", "Space", fields);
      key("keydown", "KeyE", fields);
      key("keydown", "Digit4", fields);
    }
    expect(readIntent()).toMatchObject({ jump: false, interact: false, seedSlot: -1 });
    pad();
    readIntent();
    pad([0], [1, 0, 0, 0]);
    doc.activeElement = editor;
    expect(readIntent()).toMatchObject({ moveX: 0, jump: false });
  });

  test("releasing one physical movement key preserves another owner", () => {
    key("keydown", "KeyW");
    key("keydown", "ArrowUp");
    key("keyup", "KeyW");
    expect(readIntent().moveY).toBe(1);
    key("keyup", "ArrowUp");
    expect(readIntent().moveY).toBe(0);
  });

  test("quick Jump and Act presses survive a zero-step render exactly once", () => {
    key("keydown", "Space");
    key("keyup", "Space");
    key("keydown", "KeyE");
    key("keyup", "KeyE");
    expect(readIntent(false)).toMatchObject({ jump: true, interact: true });
    expect(readIntent(false)).toMatchObject({ jump: true, interact: true });
    expect(readIntent()).toMatchObject({ jump: true, interact: true });
    expect(readIntent()).toMatchObject({ jump: false, interact: false });
  });

  test("canceling one quick touch tap preserves the keyboard and another touch edge", () => {
    setButton("jump", true, "finger1");
    setButton("jump", false, "finger1");
    setButton("jump", true, "finger2");
    setButton("jump", false, "finger2");
    key("keydown", "Space");
    key("keyup", "Space");
    cancelButton("jump", "finger1");
    expect(readIntent().jump).toBe(true);
    expect(readIntent().jump).toBe(false);
    setButton("interact", true, "cancel");
    cancelButton("interact", "cancel");
    expect(readIntent().interact).toBe(false);
  });

  test("held actions do not create repeated seed steps or extra post-release edges", () => {
    key("keydown", "KeyQ");
    expect(readIntent().seedStep).toBe(-1);
    key("keydown", "KeyQ", { repeat: true });
    expect(readIntent().seedStep).toBe(0);
    setButton("interact", true, "held");
    readIntent();
    setButton("interact", true, "held");
    setButton("interact", false, "held");
    expect(readIntent().interact).toBe(false);
  });

  test("reset discards queued taps and ignores a still-held key's repeat until a fresh press", () => {
    key("keydown", "Space");
    key("keydown", "Digit4");
    pulseButton("interact");
    let resets = 0;
    const unsubscribe = onInputReset(() => resets++);
    resetInput();
    expect(resets).toBe(1);
    unsubscribe();
    key("keydown", "Space", { repeat: true });
    expect(readIntent()).toMatchObject({ jump: false, interact: false, seedSlot: -1 });
    key("keyup", "Space");
    key("keydown", "Space");
    expect(readIntent().jump).toBe(true);
  });

  test("seed slots validate values and survive peeking until consumed", () => {
    for (const value of [-1, 9, 1.5, Number.NaN]) pickSeed(value);
    expect(readIntent().seedSlot).toBe(-1);
    pickSeed(8);
    expect(readIntent(false).seedSlot).toBe(8);
    expect(readIntent().seedSlot).toBe(8);
    expect(readIntent().seedSlot).toBe(-1);
    stepSeed(10);
    expect(readIntent().seedStep).toBe(0);
  });
});

describe("owned canvas contacts and cancellation", () => {
  test("a second left contact cannot steal walking or become a look drag", () => {
    pointer("pointerdown", 1, 100);
    pointer("pointermove", 1, 160);
    pointer("pointerdown", 2, 150);
    pointer("pointermove", 2, 240);
    pointer("pointerup", 2, 240);
    expect(canvas.captures).toEqual(new Set([1]));
    expect(readIntent()).toMatchObject({ moveX: 1, lookX: 0 });
    pointer("pointercancel", 1, 160);
    expect(readIntent().moveX).toBe(0);
    expect(canvas.captures.size).toBe(0);
  });

  test("left walking and right looking coexist; foreign cancellation affects neither", () => {
    pointer("pointerdown", 1, 100);
    pointer("pointerdown", 2, 450);
    pointer("pointermove", 1, 100, 40);
    pointer("pointermove", 2, 460, 105);
    pointer("pointercancel", 3, 300);
    expect(readIntent()).toMatchObject({ moveY: 1, lookX: 14, lookY: 7 });
    pointer("pointerup", 2, 460);
    expect(readIntent().moveY).toBe(1);
    pointer("pointerup", 1, 100);
    expect(readIntent().moveY).toBe(0);
  });

  test("cancel/lost capture discard queued look while normal release keeps its last delta", () => {
    for (const ending of ["pointercancel", "lostpointercapture", "pointerup"]) {
      pointer("pointerdown", 4, 450);
      pointer("pointermove", 4, 460);
      pointer(ending, 4, 460);
      expect(readIntent().lookX).toBe(ending === "pointerup" ? 14 : 0);
      expect(canvas.captures.size).toBe(0);
    }
  });

  test("mouse ownership rejects nonprimary/extra contacts and clears only its own release", () => {
    pointer("pointerdown", 1, 450, 100, { pointerType: "mouse", isPrimary: false });
    expect(canvas.captures.size).toBe(0);
    pointer("pointerdown", 2, 450, 100, { pointerType: "mouse" });
    pointer("pointerdown", 3, 100);
    pointer("pointermove", 2, 470, 110, { pointerType: "mouse" });
    pointer("pointerup", 3, 100);
    expect(canvas.captures).toEqual(new Set([2]));
    expect(readIntent()).toMatchObject({ lookX: 20, lookY: 10 });
    pointer("pointerup", 2, 470, 110, { pointerType: "mouse" });
    expect(canvas.captures.size).toBe(0);
  });

  test("blur, hidden tab, resize and dispose clear held walking, pending taps and captures", () => {
    for (const reason of ["blur", "hidden", "resize", "dispose"]) {
      pointer("pointerdown", 1, 100);
      pointer("pointermove", 1, 160);
      setButton("jump", true, "button");
      if (reason === "hidden") {
        doc.hidden = true;
        doc.fire("visibilitychange");
      } else if (reason === "dispose") input.dispose();
      else win.fire(reason);
      expect(canvas.captures.size).toBe(0);
      expect(readIntent()).toMatchObject({ moveX: 0, jump: false });
      doc.hidden = false;
      win.fire("focus");
    }
    expect([...win.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
    expect([...canvas.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
  });

  test("reset exits pointer lock and an old binding cannot clear a replacement", () => {
    doc.pointerLockElement = canvas;
    input.reset();
    expect(doc.pointerLockElement).toBeNull();
    const old = input;
    const next = new Surface();
    input = bindInput(next as unknown as HTMLElement, () => active);
    doc.activeElement = next;
    win.fire("keydown", { code: "KeyW", target: next });
    old.dispose();
    expect(readIntent().moveY).toBe(1);
    pointer("pointerdown", 1, 100);
    expect(canvas.captures.size).toBe(0);
  });

  test("wheel zoom respects browser modifiers, inactivity, and delta units", () => {
    expect(canvas.fire("wheel", { deltaY: 2, deltaMode: 1 }).defaultPrevented).toBe(true);
    expect(readIntent().zoom).toBe(32);
    canvas.fire("wheel", { deltaY: 1, deltaMode: 2 });
    expect(readIntent().zoom).toBe(320);
    expect(canvas.fire("wheel", { deltaY: 100, ctrlKey: true }).defaultPrevented).toBe(false);
    expect(readIntent().zoom).toBe(0);
    active = false;
    expect(canvas.fire("wheel", { deltaY: 100 }).defaultPrevented).toBe(false);
  });
});

describe("gamepad transition edges and time-based look", () => {
  test("already-held Jump, Act and bumpers are blocked on connection and reset until release", () => {
    pad([0, 2, 5]);
    expect(readIntent()).toMatchObject({ jump: false, interact: false, seedStep: 0 });
    expect(readIntent()).toMatchObject({ jump: false, interact: false, seedStep: 0 });
    pad();
    readIntent();
    pad([0, 2, 5]);
    expect(readIntent()).toMatchObject({ jump: true, interact: true, seedStep: 1 });
    expect(readIntent().seedStep).toBe(0);
    input.reset();
    expect(readIntent()).toMatchObject({ jump: false, interact: false, seedStep: 0 });
  });

  test("disconnect/reconnect and changing pad do not invent button edges", () => {
    pad();
    readIntent();
    pads = [];
    readIntent();
    pad([0, 4]);
    expect(readIntent()).toMatchObject({ jump: false, seedStep: 0 });
    pad([2, 5], [0, 0, 0, 0], "replacement");
    expect(readIntent()).toMatchObject({ interact: false, seedStep: 0 });
  });

  test("look covers the same angle at 60 and 120 Hz and ignores invalid axes", () => {
    const totalLook = (hz: number) => {
      input.reset();
      pad([], [0, 0, 0.5, -0.5]);
      let x = 0;
      let y = 0;
      for (let i = 0; i < hz; i++) {
        const intent = readIntent(true, 1 / hz);
        x += intent.lookX;
        y += intent.lookY;
      }
      return [x, y];
    };
    expect(totalLook(60)).toEqual(totalLook(120));
    pad([], [Number.NaN, Number.POSITIVE_INFINITY, Number.NaN, Number.NEGATIVE_INFINITY]);
    expect(readIntent()).toMatchObject({ moveX: 0, moveY: 0, lookX: 0, lookY: 0 });
  });
});
