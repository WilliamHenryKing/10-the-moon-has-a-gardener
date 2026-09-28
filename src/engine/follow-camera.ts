import * as THREE from "three";
import type { Terrain } from "../world/terrain";

// A calm third-person camera: it orbits a point above the gardener's shoulders, zooms between a
// close over-the-shoulder view and a wide establishing one, and drifts round behind the gardener
// once you stop steering it. It never dips under the ground or behind a hill: if the ground
// blocks the line to the gardener, it pulls in.

export class FollowCamera {
  yaw = 0;
  pitch = 0.16;
  distance = 3.9;
  private curDistance = 3.9;
  private pivot = new THREE.Vector3();
  private idle = 10;
  private shake = 0;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private terrain: Terrain,
  ) {}

  /** Pointer drag, in pixels. */
  drag(dx: number, dy: number) {
    this.yaw -= dx * 0.0055;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.0045, -0.25, 1.15);
    this.idle = 0;
  }

  zoom(delta: number) {
    this.distance = THREE.MathUtils.clamp(this.distance * (1 + delta * 0.001), 2.2, 14);
  }

  /** A jolt (landings, rover bumps). */
  bump(strength: number) {
    this.shake = Math.min(1, this.shake + strength);
  }

  update(dt: number, target: THREE.Vector3, facing: number, moving: boolean) {
    this.idle += dt;
    // After a pause, swing back behind the gardener while it walks.
    if (moving && this.idle > 1.6) {
      // The camera's yaw equals the gardener's facing when it sits directly behind.
      let d = facing - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 1.2);
    }
    const goal = new THREE.Vector3(target.x, target.y + 1.5, target.z);
    if (this.pivot.lengthSq() === 0) this.pivot.copy(goal);
    this.pivot.lerp(goal, Math.min(1, dt * 7));
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    // Pull in when the ground is in the way.
    let want = this.distance;
    const hit = this.terrain.raycast(
      this.pivot.x,
      this.pivot.y,
      this.pivot.z,
      dir.x,
      dir.y,
      dir.z,
      want,
    );
    if (hit !== null) want = Math.max(1.2, hit - 0.35);
    this.curDistance +=
      (want - this.curDistance) * Math.min(1, dt * (want < this.curDistance ? 14 : 3));
    const pos = this.pivot.clone().addScaledVector(dir, this.curDistance);
    const floor = this.terrain.heightAt(pos.x, pos.z) + 0.35;
    if (pos.y < floor) pos.y = floor;
    this.shake = Math.max(0, this.shake - dt * 3);
    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.06;
      pos.x += (Math.random() - 0.5) * s;
      pos.y += (Math.random() - 0.5) * s;
    }
    this.camera.position.copy(pos);
    this.camera.lookAt(this.pivot);
  }

  /** The camera's horizontal forward and right, for camera-relative movement. */
  basis() {
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    return { fx, fz, rx: -fz, rz: fx };
  }
}
