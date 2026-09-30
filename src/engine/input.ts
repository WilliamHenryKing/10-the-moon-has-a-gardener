// Keyboard, two owned touch contacts, mouse and gamepad folded into one intent.
// A quick Jump/Act tap is kept until a simulation step consumes it.
export interface Intent {
  moveX: number;
  moveY: number;
  run: boolean;
  jump: boolean;
  interact: boolean;
  seedSlot: number;
  seedStep: number;
  lookX: number;
  lookY: number;
  zoom: number;
}

const EDITING =
  "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='slider'], [role='spinbutton'], [role='combobox']";
const element = (target: EventTarget | null) =>
  target && "closest" in target ? (target as Element) : null;
export const isEditingTarget = (target: EventTarget | null) =>
  Boolean(element(target)?.closest(EDITING));
export const nativeKeyTarget = (target: EventTarget | null) =>
  isEditingTarget(target) ||
  Boolean(
    element(target)?.closest("button, a[href], summary, [role='button'], [data-keyboard-scroll]"),
  );
export const suppressRepeatedActivation = (event: KeyboardEvent) =>
  event.repeat &&
  (event.key === "Enter" || event.code === "Space") &&
  !isEditingTarget(event.target) &&
  !element(event.target)?.matches("[data-keyboard-scroll]") &&
  !event.altKey &&
  !event.ctrlKey &&
  !event.metaKey;

type Button = "jump" | "interact" | "run";
const keys = new Set<string>();
const held: Record<Button, Set<string>> = { jump: new Set(), interact: new Set(), run: new Set() };
const pending = { jump: new Set<string>(), interact: new Set<string>() };
const resetListeners = new Set<() => void>();
const stick = { x: 0, y: 0 };
let lookX = 0;
let lookY = 0;
let zoom = 0;
let seedSlot = -1;
let seedStep = 0;
let padId = "";
let padBaseline = true;
let padBlocked = [false, false];
let padBumpers = [false, false];
let binding: { reset: () => void; dispose: () => void; active: () => boolean } | null = null;

function clearState() {
  keys.clear();
  for (const set of Object.values(held)) set.clear();
  pending.jump.clear();
  pending.interact.clear();
  stick.x = stick.y = lookX = lookY = zoom = 0;
  seedSlot = -1;
  seedStep = 0;
  padBaseline = true;
  for (const listener of resetListeners) listener();
}

export function resetInput() {
  if (binding) binding.reset();
  else clearState();
}
export function onInputReset(listener: () => void) {
  resetListeners.add(listener);
  return () => {
    resetListeners.delete(listener);
  };
}

/** Different pointer/keyboard owners cannot release or cancel one another's hold. */
export function setButton(name: Button, down: boolean, owner = `ui:${name}`) {
  if (!down) {
    held[name].delete(owner);
    return;
  }
  if (!binding?.active()) return;
  if (!held[name].has(owner) && name !== "run") pending[name].add(owner);
  held[name].add(owner);
}
export function cancelButton(name: Button, owner = `ui:${name}`) {
  held[name].delete(owner);
  if (name !== "run") pending[name].delete(owner);
}
export function pulseButton(name: "jump" | "interact", owner = `click:${name}`) {
  if (binding?.active()) pending[name].add(owner);
}
export function pickSeed(slot: number) {
  if (binding?.active() && Number.isInteger(slot) && slot >= 0 && slot < 9) seedSlot = slot;
}
export function stepSeed(dir: number) {
  if (binding?.active() && (dir === -1 || dir === 1)) seedStep = dir;
}

export function bindInput(target: HTMLElement, active: () => boolean) {
  binding?.dispose();
  let disposed = false;
  let focused = true;
  let mouse: { id: number; x: number; y: number } | null = null;
  let left: { id: number; x: number; y: number } | null = null;
  let right: { id: number; x: number; y: number } | null = null;
  const canAct = () =>
    !disposed &&
    focused &&
    !document.hidden &&
    !isEditingTarget(document.activeElement) &&
    active();
  const release = (id: number) => {
    try {
      if (target.hasPointerCapture(id)) target.releasePointerCapture(id);
    } catch {
      /* Already lost on a hidden page. */
    }
  };
  const clearPointers = () => {
    const ids = [mouse?.id, left?.id, right?.id];
    mouse = left = right = null;
    stick.x = stick.y = 0;
    for (const id of ids) if (id !== undefined) release(id);
    if (document.pointerLockElement === target) document.exitPointerLock?.();
  };
  const reset = () => {
    clearPointers();
    clearState();
  };
  const keyDown = (event: KeyboardEvent) => {
    if (
      !canAct() ||
      event.defaultPrevented ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      isEditingTarget(event.target)
    )
      return;
    if ((event.code === "Space" || event.code === "Enter") && nativeKeyTarget(event.target)) return;
    if (element(event.target)?.matches("[data-keyboard-scroll]") && event.code.startsWith("Arrow"))
      return;
    const code = event.code;
    if (!/^(Key[WASDEQR]|Arrow(Up|Down|Left|Right)|Shift(Left|Right)|Space|Digit[1-9])$/.test(code))
      return;
    if (event.repeat && !keys.has(code)) return;
    if (!keys.has(code)) {
      if (code === "Space") pending.jump.add(`key:${code}`);
      if (code === "KeyE") pending.interact.add(`key:${code}`);
      const digit = /^Digit([1-9])$/.exec(code);
      if (digit) seedSlot = Number(digit[1]) - 1;
      if (code === "KeyQ") seedStep = -1;
      if (code === "KeyR") seedStep = 1;
    }
    keys.add(code);
    if (code === "Space" || code.startsWith("Arrow")) event.preventDefault();
  };
  const keyUp = (event: KeyboardEvent) => {
    keys.delete(event.code);
  };
  const blur = () => {
    focused = false;
    reset();
  };
  const focus = () => {
    focused = true;
    reset();
  };
  const hidden = () => {
    if (document.hidden) reset();
  };
  const editFocus = (event: FocusEvent) => {
    if (!isEditingTarget(event.target)) return;
    keys.clear();
    for (const set of Object.values(pending))
      for (const owner of set) if (owner.startsWith("key:")) set.delete(owner);
  };
  const down = (event: PointerEvent) => {
    if (disposed || !active() || document.hidden || event.defaultPrevented || event.button !== 0)
      return;
    focused = true;
    if (event.pointerType === "touch") {
      if (mouse) return;
      const rect = target.getBoundingClientRect();
      const isLeft = event.clientX < rect.left + rect.width * 0.45;
      if (isLeft) {
        if (left) return;
        left = { id: event.pointerId, x: event.clientX, y: event.clientY };
      } else {
        if (right) return;
        right = { id: event.pointerId, x: event.clientX, y: event.clientY };
      }
    } else {
      if (event.isPrimary === false || mouse || left || right) return;
      mouse = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      end(event);
      return;
    }
    target.focus({ preventScroll: true });
    event.preventDefault();
  };
  const move = (event: PointerEvent) => {
    if (!canAct()) {
      reset();
      return;
    }
    if (event.pointerId === left?.id) {
      const dx = event.clientX - left.x;
      const dy = event.clientY - left.y;
      const radius = Math.max(60, Math.hypot(dx, dy));
      stick.x = dx / radius;
      stick.y = -dy / radius;
    } else {
      const owner =
        event.pointerId === right?.id ? right : event.pointerId === mouse?.id ? mouse : null;
      if (document.pointerLockElement === target && event.pointerType !== "touch") {
        lookX += event.movementX;
        lookY += event.movementY;
      } else if (owner) {
        const gain = event.pointerType === "touch" ? 1.4 : 1;
        lookX += (event.clientX - owner.x) * gain;
        lookY += (event.clientY - owner.y) * gain;
        owner.x = event.clientX;
        owner.y = event.clientY;
      } else return;
    }
    event.preventDefault();
  };
  const end = (event: PointerEvent) => {
    let owned = false;
    if (event.pointerId === left?.id) {
      left = null;
      stick.x = stick.y = 0;
      owned = true;
    }
    if (event.pointerId === right?.id) {
      right = null;
      if (event.type !== "pointerup") lookX = lookY = 0;
      owned = true;
    }
    if (event.pointerId === mouse?.id) {
      mouse = null;
      if (event.type !== "pointerup") lookX = lookY = 0;
      owned = true;
    }
    if (owned) release(event.pointerId);
  };
  const wheel = (event: WheelEvent) => {
    if (!canAct() || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey)
      return;
    zoom +=
      event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? target.clientHeight : 1);
    event.preventDefault();
  };
  const lockChange = () => {
    if (document.pointerLockElement !== target) reset();
  };
  window.addEventListener("keydown", keyDown);
  window.addEventListener("keyup", keyUp);
  window.addEventListener("blur", blur);
  window.addEventListener("focus", focus);
  window.addEventListener("resize", reset);
  document.addEventListener("visibilitychange", hidden);
  document.addEventListener("focusin", editFocus);
  document.addEventListener("pointerlockchange", lockChange);
  target.addEventListener("pointerdown", down);
  target.addEventListener("pointermove", move);
  target.addEventListener("pointerup", end);
  target.addEventListener("pointercancel", end);
  target.addEventListener("lostpointercapture", end);
  target.addEventListener("wheel", wheel, { passive: false });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    reset();
    window.removeEventListener("keydown", keyDown);
    window.removeEventListener("keyup", keyUp);
    window.removeEventListener("blur", blur);
    window.removeEventListener("focus", focus);
    window.removeEventListener("resize", reset);
    document.removeEventListener("visibilitychange", hidden);
    document.removeEventListener("focusin", editFocus);
    document.removeEventListener("pointerlockchange", lockChange);
    target.removeEventListener("pointerdown", down);
    target.removeEventListener("pointermove", move);
    target.removeEventListener("pointerup", end);
    target.removeEventListener("pointercancel", end);
    target.removeEventListener("lostpointercapture", end);
    target.removeEventListener("wheel", wheel);
    if (binding?.dispose === dispose) binding = null;
  };
  binding = { reset, dispose, active: canAct };
  reset();
  return binding;
}

/** Peek action edges on a render without a simulation step; look deltas always belong to one draw. */
export function readIntent(consume = true, dt = 1 / 60): Intent {
  if (!binding?.active()) {
    resetInput();
    return emptyIntent();
  }
  const k = (code: string) => keys.has(code);
  let mx = (k("KeyD") || k("ArrowRight") ? 1 : 0) - (k("KeyA") || k("ArrowLeft") ? 1 : 0) + stick.x;
  let my = (k("KeyW") || k("ArrowUp") ? 1 : 0) - (k("KeyS") || k("ArrowDown") ? 1 : 0) + stick.y;
  let run =
    k("ShiftLeft") || k("ShiftRight") || held.run.size > 0 || Math.hypot(stick.x, stick.y) > 0.92;
  let jump = k("Space") || held.jump.size > 0 || pending.jump.size > 0;
  let interact = k("KeyE") || held.interact.size > 0 || pending.interact.size > 0;
  let pad: Gamepad | null | undefined;
  try {
    pad =
      typeof navigator === "undefined" ? null : navigator.getGamepads?.().find((p) => p?.connected);
  } catch {
    pad = null;
  }
  if (pad) {
    const id = `${pad.index}:${pad.id}`;
    const a = !!pad.buttons[0]?.pressed;
    const x = !!pad.buttons[2]?.pressed;
    const lb = !!pad.buttons[4]?.pressed;
    const rb = !!pad.buttons[5]?.pressed;
    if (padBaseline || id !== padId) {
      padBlocked = [a, x];
      padBumpers = [lb, rb];
      padBaseline = false;
      padId = id;
    }
    if (!a) padBlocked[0] = false;
    if (!x) padBlocked[1] = false;
    const dz = (v: number) =>
      Number.isFinite(v) && Math.abs(v) >= 0.15 ? Math.max(-1, Math.min(1, v)) : 0;
    mx += dz(pad.axes[0] ?? 0);
    my -= dz(pad.axes[1] ?? 0);
    const seconds = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
    lookX += dz(pad.axes[2] ?? 0) * 840 * seconds;
    lookY += dz(pad.axes[3] ?? 0) * 600 * seconds;
    jump ||= a && !padBlocked[0];
    interact ||= x && !padBlocked[1];
    run ||= (pad.buttons[7]?.value ?? 0) > 0.4;
    if (lb && !padBumpers[0]) seedStep = -1;
    if (rb && !padBumpers[1]) seedStep = 1;
    padBumpers = [lb, rb];
  } else {
    padId = "";
    padBaseline = true;
  }
  const length = Math.hypot(mx, my);
  if (length > 1) {
    mx /= length;
    my /= length;
  }
  const intent = {
    moveX: mx,
    moveY: my,
    run,
    jump,
    interact,
    seedSlot,
    seedStep,
    lookX,
    lookY,
    zoom,
  };
  lookX = lookY = zoom = 0;
  if (consume) {
    pending.jump.clear();
    pending.interact.clear();
    seedSlot = -1;
    seedStep = 0;
  }
  return intent;
}

function emptyIntent(): Intent {
  return {
    moveX: 0,
    moveY: 0,
    run: false,
    jump: false,
    interact: false,
    seedSlot: -1,
    seedStep: 0,
    lookX: 0,
    lookY: 0,
    zoom: 0,
  };
}
