import * as THREE from "three";
import type { Perennial } from "./perennial";

// The ending, as a film. When the dome is full (or when the Perennial's time comes, full or not)
// the ship comes down on the landing ring. If the dome is full its twelve colonists walk in single
// file to the airlock; then, inside, among the beds the garden greened, the gardener lifts off the
// helmet: the first breath on the Moon. The medal card follows. If the ship lands before the dome
// is full it waits on the ring, and the walk begins the moment the dome fills.

export type FinalePhase = "idle" | "landing" | "waiting" | "walk" | "breath" | "medal";

const LANDING = 15;
const BREATH = 9;

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

export class Finale {
  phase: FinalePhase = "idle";
  /** Whether the finale owns the camera (and the gardener) right now. */
  get cinematic() {
    return this.phase === "landing" || this.phase === "walk" || this.phase === "breath";
  }
  readonly eye = new THREE.Vector3();
  readonly target = new THREE.Vector3();
  /** Black between shots, 0 … 1. */
  fade = 0;
  /** Arms raised to the helmet, and how far it is off, 0 … 1. */
  lift = 0;
  helmet = 0;
  /** Where the gardener stands for the last shot, and which way. */
  readonly stand: { x: number; z: number; yaw: number };
  private t = 0;
  private landed = false;
  onPhase: ((p: FinalePhase) => void) | null = null;

  constructor(
    private ship: Perennial,
    private pad: THREE.Vector3,
    private dome: { x: number; y: number; z: number; r: number },
    private door: THREE.Vector3,
  ) {
    // Inside the dome, a step in from the airlock, facing its middle.
    const toDoor = Math.atan2(door.x - dome.x, door.z - dome.z);
    const inX = dome.x + Math.sin(toDoor) * dome.r * 0.45;
    const inZ = dome.z + Math.cos(toDoor) * dome.r * 0.45;
    this.stand = { x: inX, z: inZ, yaw: toDoor };
  }

  private go(p: FinalePhase) {
    this.phase = p;
    this.t = 0;
    this.onPhase?.(p);
  }

  /** The Perennial starts down (the dome is full, or its time has come). */
  call() {
    if (this.phase === "idle") this.go("landing");
  }

  /** The dome is full: if the ship is already down, the colonists come out. */
  full() {
    if (this.phase === "waiting") this.go("walk");
  }

  /** From the medal card back to the garden. */
  resume() {
    if (this.phase === "medal") this.phase = "waiting";
  }

  update(dt: number, domeFull: boolean, calm = false) {
    this.t += dt;
    // Reduced motion uses fixed shots and settled arrivals instead of moving cameras.
    if (calm && this.phase === "landing") this.t = Math.max(this.t, LANDING + 2.01);
    const t = this.t;
    switch (this.phase) {
      case "landing": {
        const s = clamp01(t / LANDING);
        const height = 700 * (1 - s) ** 3;
        const thrust = s < 1 ? 0.5 + 0.5 * Math.min(1, s * 1.5) : 0;
        this.ship.pose(this.pad, height, thrust, dt);
        // A low wide shot from the south: the ring, the dome beyond it, Earth over the rim.
        this.eye.set(this.pad.x + 14, this.pad.y + 3.2, this.pad.z + 34);
        const shipAt = this.pad.clone().add(new THREE.Vector3(0, height + 6, 0));
        const look = new THREE.Vector3(this.pad.x - 4, this.pad.y + 12, this.pad.z - 30);
        this.target.lerpVectors(shipAt, look, ease(clamp01((s - 0.2) / 0.8)) * 0.5);
        if (s >= 1 && !this.landed) this.landed = true;
        if (t > LANDING + 2) this.go(domeFull ? "walk" : "waiting");
        break;
      }
      case "waiting":
      case "medal":
        this.ship.pose(this.pad, 0, 0, dt);
        this.ship.update(dt);
        break;
      case "walk": {
        this.ship.pose(this.pad, 0, 0, dt);
        if (t < dt * 1.5) this.ship.disembark();
        this.ship.update(calm ? 60 : dt);
        // Alongside the file, drifting with it toward the dome.
        const k = calm ? 0.5 : ease(clamp01(t / 14));
        const a = new THREE.Vector3().lerpVectors(this.pad, this.door, 0.25 + 0.55 * k);
        const side = new THREE.Vector3(this.door.z - this.pad.z, 0, -(this.door.x - this.pad.x))
          .normalize()
          .multiplyScalar(9);
        this.eye
          .copy(a)
          .add(side)
          .add(new THREE.Vector3(0, 2.6, 0));
        this.target.copy(a).add(new THREE.Vector3(0, 1.2, 0));
        const left = this.ship.stillWalking;
        this.fade = clamp01(1 - left / 0.8);
        if (left <= 0) this.go("breath");
        break;
      }
      case "breath": {
        // Behind the gardener's left shoulder, close, the beds and the mist all round.
        const s = this.stand;
        // The gardener faces (−sin yaw, −cos yaw); behind is the opposite, right is (cos, −sin).
        const back = new THREE.Vector3(Math.sin(s.yaw), 0, Math.cos(s.yaw));
        const right = new THREE.Vector3(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
        const head = new THREE.Vector3(s.x, this.dome.y + 1.62, s.z);
        this.eye
          .copy(head)
          .addScaledVector(back, 1.35 - (calm ? 0 : 0.25 * ease(clamp01(t / BREATH))))
          .addScaledVector(right, -0.55)
          .add(new THREE.Vector3(0, 0.12, 0));
        this.target
          .copy(head)
          .addScaledVector(back, -2.5)
          .add(new THREE.Vector3(0, 0.05, 0));
        this.fade = clamp01(1 - t / 0.8);
        const h = clamp01((t - 1.4) / 4.2);
        this.helmet = h;
        this.lift =
          Math.sin(Math.min(1, h * 1.25) * Math.PI * 0.5) *
          (1 - 0.55 * ease(clamp01((h - 0.6) / 0.4)));
        if (t > BREATH) this.go("medal");
        break;
      }
      default:
        break;
    }
  }
}
