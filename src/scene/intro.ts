import * as THREE from "three";
import type { Lander } from "./lander";

// The arrival, as a film: a title shot high over the real south pole with Earth on the northern
// horizon; then the gardener's lander comes down out of the south-east, the camera chasing it low
// over the ridge until it hands over to a watcher by the pad for the last hundred metres; dust at
// touchdown, the engine gutters out, and the camera swings down behind the gardener at the foot
// of the ladder. Skippable at any point after the title.

export type IntroPhase = "title" | "descent" | "arrive" | "done";

const DESCENT = 17;
const SETTLE = 2.2;
const ARRIVE = 1.8;

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

export class Intro {
  phase: IntroPhase = "title";
  /** Where the camera is and what it looks at, while the intro has it. */
  readonly eye = new THREE.Vector3();
  readonly target = new THREE.Vector3();
  /** Seconds into the current phase. */
  private t = 0;
  private time = 0;
  private start = new THREE.Vector3();
  private site: THREE.Vector3;
  private watcher: THREE.Vector3;
  private from = { eye: new THREE.Vector3(), target: new THREE.Vector3() };
  private landed = false;
  /** Called once at touchdown. */
  onTouchdown: (() => void) | null = null;

  constructor(
    private lander: Lander,
    site: { x: number; y: number; z: number },
    /** The lander's heading (radians about +Y). */
    private heading: number,
  ) {
    this.site = new THREE.Vector3(site.x, site.y, site.z);
    this.start.set(site.x + 700, site.y + 950, site.z + 2300);
    this.watcher = new THREE.Vector3(site.x + 20, site.y + 5.5, site.z + 17);
    lander.root.visible = false;
    this.titleShot(0);
  }

  begin() {
    if (this.phase !== "title") return;
    this.phase = "descent";
    this.t = 0;
    this.lander.root.visible = true;
  }

  /** Jump to the gardener at the ladder (from the descent). */
  skip() {
    if (this.phase !== "descent") return;
    this.t = DESCENT + SETTLE;
    this.touchdown();
  }

  /** Hand over to the follow camera, which is at `eye` looking at `target`. */
  finish(followEye: THREE.Vector3, followTarget: THREE.Vector3, dt: number, calm = false) {
    if (this.phase !== "arrive") return;
    this.t = calm ? ARRIVE : this.t + dt;
    const k = ease(clamp01(this.t / ARRIVE));
    this.eye.lerpVectors(this.from.eye, followEye, k);
    this.target.lerpVectors(this.from.target, followTarget, k);
    if (this.t >= ARRIVE) this.phase = "done";
  }

  update(dt: number, calm = false) {
    if (!calm) this.time += dt;
    if (calm && this.phase === "descent") this.skip();
    if (this.phase === "title") {
      this.titleShot(this.time);
      this.lander.update(dt, 0);
      return;
    }
    if (this.phase !== "descent") return;
    this.t += dt;
    const s = clamp01(this.t / DESCENT);
    // Fast at first, braking hard, the last metres slow.
    const k = 1 - (1 - s) ** 3;
    const pos = new THREE.Vector3().lerpVectors(this.start, this.site, k);
    // A little extra height early on, so it clears the ridge on the way in.
    pos.y += Math.sin(s * Math.PI) * 120 * (1 - s);
    const vel = new THREE.Vector3()
      .subVectors(this.site, this.start)
      .multiplyScalar(3 * (1 - s) ** 2);
    const lr = this.lander.root;
    lr.position.copy(pos);
    // Pitched back against the motion while it brakes, level for touchdown.
    const brake = (1 - s) ** 2;
    lr.rotation.set(-0.35 * brake, this.heading, 0.08 * brake);
    const thrust = s < 1 ? 0.45 + 0.55 * Math.min(1, s * 1.6) : 0;
    this.lander.update(dt, thrust);
    // Chase: behind and above the lander, looking ahead and down at the ground it crosses.
    const dir =
      vel.lengthSq() > 1e-6 ? vel.clone().setY(0).normalize() : new THREE.Vector3(0, 0, -1);
    const chaseEye = pos
      .clone()
      .addScaledVector(dir, -55)
      .add(new THREE.Vector3(0, 22, 0));
    const chaseTarget = pos
      .clone()
      .addScaledVector(dir, 30)
      .add(new THREE.Vector3(0, -12, 0));
    // A watcher by the pad for the last stretch.
    const w = ease(clamp01((s - 0.55) / 0.25));
    this.eye.lerpVectors(chaseEye, this.watcher, w);
    this.target.lerpVectors(chaseTarget, pos.clone().add(new THREE.Vector3(0, 1.5, 0)), w);
    if (s >= 1 && !this.landed) this.touchdown();
    if (this.landed && this.t >= DESCENT + SETTLE) {
      this.phase = "arrive";
      this.t = 0;
      this.from.eye.copy(this.eye);
      this.from.target.copy(this.target);
    }
  }

  private touchdown() {
    const lr = this.lander.root;
    lr.visible = true;
    lr.position.copy(this.site);
    lr.rotation.set(0, this.heading, 0);
    this.lander.update(0, 0);
    if (!this.landed) {
      this.landed = true;
      this.onTouchdown?.();
    }
    if (this.t >= DESCENT + SETTLE) {
      this.eye.copy(this.watcher);
      this.target.copy(this.site).add(new THREE.Vector3(0, 1.5, 0));
      this.phase = "arrive";
      this.t = 0;
      this.from.eye.copy(this.eye);
      this.from.target.copy(this.target);
    }
  }

  /** High over the ridge, looking north: the basin small below, Earth over the horizon. */
  private titleShot(time: number) {
    const drift = Math.sin(time * 0.05) * 60;
    this.eye.set(-700 + drift, 560, 2500);
    const yaw = (10 * Math.PI) / 180;
    const pitch = (-7 * Math.PI) / 180;
    this.target
      .set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
      .multiplyScalar(1000)
      .add(this.eye);
  }
}
