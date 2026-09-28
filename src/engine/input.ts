// Keyboard, mouse, touch and gamepad folded into one intent.
// - Keyboard: WASD or arrows move, Shift lopes, Space jumps, E interacts.
// - Mouse: drag or pointer-lock to look, wheel to zoom.
// - Touch: the left half is a floating stick; drag the right half to look.
// - Gamepad: left stick, right stick, A, X, and the right trigger to lope.

export interface Intent {
  /** Stick, x right and y forward, length 0 … 1. */
  moveX: number;
  moveY: number;
  run: boolean;
  jump: boolean;
  interact: boolean;
  /** Look deltas in pixels since the last read. */
  lookX: number;
  lookY: number;
  zoom: number;
}

const keys = new Set<string>();
let lookX = 0;
let lookY = 0;
let zoom = 0;
let dragging = false;
let lastX = 0;
let lastY = 0;
// Touch: one stick finger and one look finger.
let stickId: number | null = null;
let stickOrigin = { x: 0, y: 0 };
const stick = { x: 0, y: 0 };
let lookId: number | null = null;
const buttons = { jump: false, interact: false, run: false };

export function bindInput(target: HTMLElement, active: () => boolean) {
  window.addEventListener("keydown", (e) => {
    if (!active()) return;
    if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
      return;
    keys.add(e.code);
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code))
      e.preventDefault();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  window.addEventListener("blur", () => keys.clear());

  target.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") {
      if (e.clientX < window.innerWidth * 0.45 && stickId === null) {
        stickId = e.pointerId;
        stickOrigin = { x: e.clientX, y: e.clientY };
      } else if (lookId === null) {
        lookId = e.pointerId;
        lastX = e.clientX;
        lastY = e.clientY;
      }
    } else {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    }
    target.setPointerCapture(e.pointerId);
  });
  target.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") {
      if (e.pointerId === stickId) {
        const dx = e.clientX - stickOrigin.x;
        const dy = e.clientY - stickOrigin.y;
        const r = Math.hypot(dx, dy);
        const k = r > 60 ? 60 / r : 1;
        stick.x = (dx * k) / 60;
        stick.y = (-dy * k) / 60;
      } else if (e.pointerId === lookId) {
        lookX += (e.clientX - lastX) * 1.4;
        lookY += (e.clientY - lastY) * 1.4;
        lastX = e.clientX;
        lastY = e.clientY;
      }
      return;
    }
    if (document.pointerLockElement === target) {
      lookX += e.movementX;
      lookY += e.movementY;
    } else if (dragging) {
      lookX += e.clientX - lastX;
      lookY += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
    }
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId === stickId) {
      stickId = null;
      stick.x = stick.y = 0;
    }
    if (e.pointerId === lookId) lookId = null;
    dragging = false;
  };
  target.addEventListener("pointerup", end);
  target.addEventListener("pointercancel", end);
  target.addEventListener(
    "wheel",
    (e) => {
      zoom += e.deltaY;
      e.preventDefault();
    },
    { passive: false },
  );
}

/** On-screen buttons (touch UI) set these while held. */
export function setButton(name: keyof typeof buttons, down: boolean) {
  buttons[name] = down;
}

export function readIntent(): Intent {
  const k = (c: string) => keys.has(c);
  let mx = (k("KeyD") || k("ArrowRight") ? 1 : 0) - (k("KeyA") || k("ArrowLeft") ? 1 : 0);
  let my = (k("KeyW") || k("ArrowUp") ? 1 : 0) - (k("KeyS") || k("ArrowDown") ? 1 : 0);
  let run = k("ShiftLeft") || k("ShiftRight") || buttons.run;
  let jump = k("Space") || buttons.jump;
  let interact = k("KeyE") || buttons.interact;
  mx += stick.x;
  my += stick.y;
  // Gamepad, if one is connected.
  const pad = navigator.getGamepads?.().find((p) => p?.connected);
  if (pad) {
    const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
    mx += dz(pad.axes[0] ?? 0);
    my -= dz(pad.axes[1] ?? 0);
    lookX += dz(pad.axes[2] ?? 0) * 14;
    lookY += dz(pad.axes[3] ?? 0) * 10;
    jump ||= !!pad.buttons[0]?.pressed;
    interact ||= !!pad.buttons[2]?.pressed;
    run ||= (pad.buttons[7]?.value ?? 0) > 0.4;
  }
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  // A full touch stick lopes.
  if (Math.hypot(stick.x, stick.y) > 0.92) run = true;
  const intent: Intent = { moveX: mx, moveY: my, run, jump, interact, lookX, lookY, zoom };
  lookX = lookY = zoom = 0;
  return intent;
}
