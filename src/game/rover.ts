import type { GroundQuery, Obstacle } from "./player";
import { BOUNDARY } from "./player";

// The farm rover's driving: a six-wheeled cart on soft regolith. It picks up speed slowly and
// coasts a long way, steers like a car (the rear follows the front), will not climb what the
// gardener could not, and stays inside the basin. Pure logic over a ground query.

export const ROVER_TOP = 5.5;
const REVERSE_TOP = 2;
const ACCEL = 1.7;
const BRAKE = 3.6;
const DRAG = 0.5;
const STEER_MAX = 0.5;
const WHEELBASE = 2.2;
/** Slopes steeper than this (radians) stop the rover climbing. */
const TOO_STEEP = 0.5;

export interface DriveInput {
  /** −1 … 1: back, forward. */
  throttle: number;
  /** −1 … 1: left, right. */
  steer: number;
}

export class RoverBody {
  x = 0;
  z = 0;
  /** Facing, radians; 0 looks toward −Z, like the gardener. */
  yaw = 0;
  speed = 0;
  steer = 0;
  private n = { x: 0, y: 1, z: 0 };

  place(x: number, z: number, yaw: number) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.speed = 0;
    this.steer = 0;
  }

  get forward() {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }

  update(input: DriveInput, dt: number, ground: GroundQuery, obstacles: readonly Obstacle[] = []) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    // Steering eases to the stick; it straightens a little at speed.
    const want =
      -input.steer * STEER_MAX * (1 - 0.4 * Math.min(1, Math.abs(this.speed) / ROVER_TOP));
    this.steer += (want - this.steer) * Math.min(1, dt * 4);
    // Throttle, brake, coast.
    const t = input.throttle;
    if (Math.abs(t) > 0.05) {
      const top = t > 0 ? ROVER_TOP : REVERSE_TOP;
      const target = t * top;
      const braking = Math.sign(target) !== Math.sign(this.speed) && Math.abs(this.speed) > 0.1;
      const rate = braking ? BRAKE : ACCEL;
      const dv = target - this.speed;
      this.speed += Math.sign(dv) * Math.min(Math.abs(dv), rate * dt);
    } else {
      const drop = DRAG * dt;
      this.speed = Math.abs(this.speed) <= drop ? 0 : this.speed - Math.sign(this.speed) * drop;
    }
    // Uphill beyond its grip it bogs down.
    ground.normalAt(this.x, this.z, this.n);
    const f = this.forward;
    const climb = -(this.n.x * f.x + this.n.z * f.z) * Math.sign(this.speed);
    if (Math.acos(Math.min(1, this.n.y)) > TOO_STEEP && climb > 0)
      this.speed *= 1 - Math.min(1, dt * 3);
    this.yaw += ((this.speed * Math.tan(this.steer)) / WHEELBASE) * dt;
    const previousX = this.x;
    const previousZ = this.z;
    this.x += f.x * this.speed * dt;
    this.z += f.z * this.speed * dt;
    const r = Math.hypot(this.x, this.z);
    if (r > BOUNDARY) {
      this.x *= BOUNDARY / r;
      this.z *= BOUNDARY / r;
      this.speed *= 0.5;
    }
    for (const o of obstacles) {
      let ox = this.x - o.x;
      let oz = this.z - o.z;
      let d = Math.hypot(ox, oz);
      const min = o.r + 1.5;
      if (d < min) {
        if (d < 1e-4) {
          ox = previousX - o.x;
          oz = previousZ - o.z;
          d = Math.hypot(ox, oz);
          if (d < 1e-4) {
            ox = -f.x;
            oz = -f.z;
            d = 1;
          }
        }
        this.x = o.x + (ox / d) * min;
        this.z = o.z + (oz / d) * min;
        this.speed *= 0.3;
      }
    }
  }
}
