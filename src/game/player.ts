// The gardener's body in the world: movement in one-sixth gravity. Pure logic over a ground
// query, so it can be tested without a renderer.
// - Traction is poor, so starting, stopping and turning take a moment.
// - Walking is slow and the lope is quick.
// - Jumps are long and floaty (1.62 m/s²).
// - Crater lips can throw you briefly into the air, and steep walls slide you back down.

export const GRAVITY = 1.62;
export const WALK_SPEED = 1.15;
export const LOPE_SPEED = 2.3;
const ACCEL = 2.8;
const BRAKE = 3.6;
const AIR_ACCEL = 0.7;
const JUMP_SPEED = 2.35;
/** Suit jets: upward push (m/s²), the fastest climb, and seconds of fuel per flight. */
const JET_ACCEL = 3.6;
const JET_CLIMB = 3.2;
export const JET_FUEL = 1.8;
const TURN_RATE = 5;
/** Slopes steeper than this (radians) cannot be stood on. */
const STEEP = 0.56;
/** Beyond this distance from the centre the basin wall turns you back. */
export const BOUNDARY = 208;

export interface GroundQuery {
  heightAt(x: number, z: number): number;
  normalAt(
    x: number,
    z: number,
    out: { x: number; y: number; z: number },
  ): { x: number; y: number; z: number };
}

export interface MoveInput {
  /** Desired direction in world space (length 0 … 1). */
  x: number;
  z: number;
  run: boolean;
  jump: boolean;
}

export interface Obstacle {
  x: number;
  z: number;
  r: number;
}

export class Player {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  /** Facing, radians; 0 looks toward -Z (north). */
  yaw = 0;
  grounded = true;
  turn = 0;
  /** Vertical speed at the last landing (negative), for the landing squash. */
  landing = 0;
  private jumpHeld = false;
  /** Suit jets, once unlocked: hold jump in the air to climb while the fuel lasts. */
  jets = false;
  fuel = JET_FUEL;
  /** Whether the jets are firing this frame. */
  thrusting = false;
  private n = { x: 0, y: 1, z: 0 };

  place(x: number, z: number, ground: GroundQuery, yaw = 0) {
    this.x = x;
    this.z = z;
    this.y = ground.heightAt(x, z);
    this.vx = this.vy = this.vz = 0;
    this.yaw = yaw;
    this.grounded = true;
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  update(input: MoveInput, dt: number, ground: GroundQuery, obstacles: readonly Obstacle[] = []) {
    if (dt <= 0) return;
    const mag = Math.min(1, Math.hypot(input.x, input.z));
    const target = (input.run ? LOPE_SPEED : WALK_SPEED) * mag;
    const dx = mag > 1e-3 ? input.x / Math.hypot(input.x, input.z) : 0;
    const dz = mag > 1e-3 ? input.z / Math.hypot(input.x, input.z) : 0;
    const wantX = dx * target;
    const wantZ = dz * target;

    // Horizontal: ease toward the wanted velocity within the traction (or air control) limit.
    const accel = this.grounded ? (target > this.speed ? ACCEL : BRAKE) : AIR_ACCEL;
    let ax = wantX - this.vx;
    let az = wantZ - this.vz;
    const al = Math.hypot(ax, az);
    const maxDv = accel * dt;
    if (al > maxDv) {
      ax *= maxDv / al;
      az *= maxDv / al;
    }
    this.vx += ax;
    this.vz += az;

    // Steep ground pushes you downhill.
    ground.normalAt(this.x, this.z, this.n);
    const slope = Math.acos(Math.min(1, this.n.y));
    if (this.grounded && slope > STEEP) {
      const push = GRAVITY * Math.sin(slope) * 1.4 * dt;
      const hl = Math.hypot(this.n.x, this.n.z) || 1;
      this.vx += (this.n.x / hl) * push;
      this.vz += (this.n.z / hl) * push;
    }

    // Face where you are going.
    const prevYaw = this.yaw;
    if (this.speed > 0.15 && mag > 0.05) {
      const want = Math.atan2(-this.vx, -this.vz);
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, d));
    }
    const dy = Math.atan2(Math.sin(this.yaw - prevYaw), Math.cos(this.yaw - prevYaw));
    this.turn += (dy / dt - this.turn) * Math.min(1, dt * 8);

    // Jump on the press (not while held).
    if (input.jump && !this.jumpHeld && this.grounded) {
      this.vy = JUMP_SPEED;
      this.grounded = false;
    }
    this.jumpHeld = input.jump;
    this.thrusting = false;
    if (this.grounded) this.fuel = Math.min(JET_FUEL, this.fuel + dt * 1.5);
    else if (this.jets && input.jump && this.fuel > 0) {
      this.thrusting = true;
      this.fuel = Math.max(0, this.fuel - dt);
      this.vy = Math.min(JET_CLIMB, this.vy + (JET_ACCEL + GRAVITY) * dt);
    }

    // Move, keep within the basin, push out of obstacles.
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    const r = Math.hypot(this.x, this.z);
    if (r > BOUNDARY) {
      this.x *= BOUNDARY / r;
      this.z *= BOUNDARY / r;
      const nx = this.x / r;
      const nz = this.z / r;
      const out = this.vx * nx + this.vz * nz;
      if (out > 0) {
        this.vx -= out * nx;
        this.vz -= out * nz;
      }
    }
    for (const o of obstacles) {
      const ox = this.x - o.x;
      const oz = this.z - o.z;
      const d = Math.hypot(ox, oz);
      const min = o.r + 0.32;
      if (d < min && d > 1e-4) {
        this.x = o.x + (ox / d) * min;
        this.z = o.z + (oz / d) * min;
        const into = this.vx * (ox / d) + this.vz * (oz / d);
        if (into < 0) {
          this.vx -= into * (ox / d);
          this.vz -= into * (oz / d);
        }
      }
    }

    // Vertical: follow the ground when on it, fly when not; the ground can fall away beneath a
    // fast lope over a crater's lip.
    const h = ground.heightAt(this.x, this.z);
    if (this.grounded) {
      if (this.y - h > 0.06 && this.speed > 1) {
        this.grounded = false;
        this.vy = Math.min(0, this.vy);
      } else {
        this.y = h;
        this.vy = 0;
      }
    }
    if (!this.grounded) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= h) {
        this.landing = this.vy;
        this.y = h;
        this.vy = 0;
        this.grounded = true;
      }
    }
  }
}
