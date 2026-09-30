import * as THREE from "three";
import { PLACES } from "../world/terrain-gen";
import { type GrazerModel, GrazerModels } from "./grazers/model";
import {
  clearGroundSegment,
  GRAZER_RADIUS,
  type GrazerObstacle,
  type GroundPoint,
  grazerPath,
  PLOT_RADIUS,
} from "./grazers/navigation";

export { GRAZER_RADIUS, type GrazerObstacle } from "./grazers/navigation";

export interface GrazerFrame {
  player?: GroundPoint;
  plants?: readonly GroundPoint[];
  obstacles?: readonly GrazerObstacle[];
  calm?: boolean;
}

type Ground = (x: number, z: number) => number;
type Behaviour = "walk" | "crop" | "watch";
interface Foot {
  p: THREE.Vector3;
  from: THREE.Vector3;
  to: THREE.Vector3;
  swing: boolean;
  progress: number;
  side: number;
  front: number;
}
interface Patch extends GroundPoint {
  amount: number;
  seed: number;
}
interface Grazer extends GroundPoint {
  y: number;
  yaw: number;
  home: GroundPoint;
  model: GrazerModel;
  state: Behaviour;
  age: number;
  target: number;
  next: number;
  path: GroundPoint[];
  replan: number;
  feet: Foot[];
}

const UP = new THREE.Vector3(0, 1, 0);
const smooth = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};
const yawDelta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const SPEED = 0.32;
const SWING_TIME = 0.62;
const BROWSE_TIME = 6.2;
const PATCHES = 6;

/**
 * A quiet four-legged herd and its crystal lichen. Coordinates are metres in the basin.
 * No game state is changed: plots, the gardener and supplied obstacles are exclusion circles.
 * Add `group` to an untransformed scene, then update with physical (not accelerated day) dt.
 */
export class Grazers {
  readonly group: THREE.Group;
  private readonly models: GrazerModels;
  private grazers: Grazer[] = [];
  private patches: Patch[] = [];
  private readonly circles: GrazerObstacle[] = [];
  private time = 0;
  private calm = false;
  private disposed = false;
  private dummy = new THREE.Object3D();
  private hip = new THREE.Vector3();
  private knee = new THREE.Vector3();
  private axis = new THREE.Vector3();
  private bend = new THREE.Vector3();
  private vector = new THREE.Vector3();
  private rest = new THREE.Vector3();
  private normal = new THREE.Vector3();
  private facing = new THREE.Quaternion();
  private footRotation = new THREE.Quaternion();

  constructor(
    private readonly ground: Ground,
    count = 3,
  ) {
    const n = Math.max(0, Math.min(4, Math.floor(count)));
    const homes = [
      { x: -38, z: -8 },
      { x: PLACES.crystals.x + 10, z: PLACES.crystals.z + 5 },
      { x: PLACES.crystals.x - 7, z: PLACES.crystals.z - 8 },
      { x: PLACES.crystals.x + 14, z: PLACES.crystals.z - 17 },
    ];
    for (let i = 0; i < n; i++) {
      const home = homes[i] as GroundPoint;
      for (let j = 0; j < PATCHES; j++) {
        const a = (j / PATCHES) * Math.PI * 2 + i * 0.63;
        const reach = 5.2 + (j % 3) * 1.4;
        this.patches.push({
          x: home.x + Math.sin(a) * reach,
          z: home.z + Math.cos(a) * reach,
          amount: 1,
          seed: i * 31 + j * 7,
        });
      }
    }
    this.models = new GrazerModels(n, this.patches.length);
    this.group = this.models.group;
    this.group.name = "crystalLichenGrazers";
    for (let i = 0; i < n; i++) {
      this.circles.push({ x: 0, z: 0, r: GRAZER_RADIUS });
      this.grazers.push({
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
        home: homes[i] as GroundPoint,
        model: this.models.bodies[i] as GrazerModel,
        state: "walk",
        age: 0,
        target: -1,
        next: 0,
        path: [],
        replan: 0,
        feet: [-1, 1].flatMap((side) =>
          [1, -1].map((front) => ({
            p: new THREE.Vector3(),
            from: new THREE.Vector3(),
            to: new THREE.Vector3(),
            swing: false,
            progress: 0,
            side,
            front,
          })),
        ),
      });
    }
    this.reset();
  }

  /** Stable borrowed circles for player/rover collision; reading them allocates nothing. */
  get obstacles(): readonly Readonly<GrazerObstacle>[] {
    return this.circles;
  }

  /** Stop optional animation in place; every airborne foot becomes a planted contact now. */
  setMotion(calm: boolean) {
    if (this.disposed || this.calm === calm) return;
    this.calm = calm;
    if (calm)
      for (const grazer of this.grazers)
        for (const foot of grazer.feet) {
          foot.swing = false;
          foot.progress = 0;
          foot.p.y = this.ground(foot.p.x, foot.p.z);
        }
    this.pose(0);
  }

  reset() {
    if (this.disposed) return;
    this.time = 0;
    for (const patch of this.patches) patch.amount = 1;
    for (const [i, grazer] of this.grazers.entries()) {
      grazer.x = grazer.home.x;
      grazer.z = grazer.home.z;
      const first = this.patches[i * PATCHES] as Patch;
      grazer.yaw = Math.atan2(first.x - grazer.x, first.z - grazer.z);
      grazer.y = this.ground(grazer.x, grazer.z) + 1.42;
      grazer.state = "walk";
      grazer.age = grazer.replan = 0;
      grazer.target = -1;
      grazer.next = i * PATCHES;
      grazer.path = [];
      for (const foot of grazer.feet) {
        this.restPoint(grazer, foot, foot.p);
        foot.swing = false;
        foot.progress = 0;
        foot.from.copy(foot.p);
        foot.to.copy(foot.p);
      }
    }
    this.pose(0);
  }

  update(dt: number, frame: GrazerFrame = {}) {
    if (this.disposed) return;
    if (frame.calm !== undefined) this.setMotion(frame.calm);
    const step = this.calm || !Number.isFinite(dt) ? 0 : Math.max(0, Math.min(0.1, dt));
    if (step > 0) {
      this.time += step;
      for (const patch of this.patches) patch.amount = Math.min(1, patch.amount + step / 70);
      const fixed: GrazerObstacle[] = (frame.obstacles ?? []).filter(
        (obstacle) => !this.circles.includes(obstacle),
      );
      for (const plant of frame.plants ?? [])
        fixed.push({ x: plant.x, z: plant.z, r: PLOT_RADIUS });
      if (frame.player) fixed.push({ ...frame.player, r: 0.65 });
      for (const [i, grazer] of this.grazers.entries()) {
        const circles = [...fixed];
        for (const peer of this.grazers)
          if (peer !== grazer) circles.push({ x: peer.x, z: peer.z, r: GRAZER_RADIUS + 0.3 });
        this.advance(grazer, i, step, frame.player, circles);
        this.stepFeet(grazer, step, circles);
      }
    }
    this.pose(step);
  }

  private choose(grazer: Grazer, index: number, circles: readonly GrazerObstacle[]) {
    for (let j = 0; j < PATCHES; j++) {
      const target = index * PATCHES + ((grazer.next - index * PATCHES + j) % PATCHES);
      const patch = this.patches[target] as Patch;
      if (patch.amount < 0.55 || !clearGroundSegment(patch, patch, circles, this.ground, 0.95))
        continue;
      const yaw = Math.atan2(patch.x - grazer.x, patch.z - grazer.z);
      const goal = { x: patch.x - Math.sin(yaw) * 1.35, z: patch.z - Math.cos(yaw) * 1.35 };
      const path = grazerPath(grazer, goal, circles, this.ground);
      if (!path.length) continue;
      grazer.target = target;
      grazer.next = index * PATCHES + ((target - index * PATCHES + 1) % PATCHES);
      grazer.path = path;
      grazer.replan = 1;
      grazer.state = "walk";
      grazer.age = 0;
      return true;
    }
    grazer.state = "watch";
    grazer.age = 0;
    grazer.target = -1;
    return false;
  }

  private advance(
    grazer: Grazer,
    index: number,
    dt: number,
    player: GroundPoint | undefined,
    circles: readonly GrazerObstacle[],
  ) {
    grazer.age += dt;
    grazer.replan = Math.max(0, grazer.replan - dt);
    const near = player
      ? Math.hypot(player.x - grazer.x, player.z - grazer.z) < (grazer.state === "watch" ? 6 : 5)
      : false;
    if (near) {
      if (grazer.state !== "watch") {
        grazer.state = "watch";
        grazer.age = 0;
      }
      return;
    }
    if (grazer.state === "watch") {
      if (grazer.age > 1.5) this.choose(grazer, index, circles);
      return;
    }
    if (grazer.state === "crop") {
      const patch = this.patches[grazer.target];
      if (!patch || !clearGroundSegment(grazer, grazer, circles, this.ground)) {
        grazer.state = "watch";
        grazer.age = 0;
        return;
      }
      if (grazer.age > 1.2 && grazer.age < 4.7)
        patch.amount = Math.max(0.38, patch.amount - dt * 0.1);
      if (grazer.age > BROWSE_TIME + index * 0.45) this.choose(grazer, index, circles);
      return;
    }
    if (grazer.target < 0) {
      this.choose(grazer, index, circles);
      return;
    }
    const goal = grazer.path[0];
    if (!goal) {
      if (grazer.replan <= 0) this.choose(grazer, index, circles);
      return;
    }
    const distance = Math.hypot(goal.x - grazer.x, goal.z - grazer.z);
    let lag = 0;
    for (const foot of grazer.feet) {
      this.restPoint(grazer, foot, this.rest);
      lag = Math.max(lag, Math.hypot(this.rest.x - foot.p.x, this.rest.z - foot.p.z));
    }
    // A heavy shell waits for its support, rather than dragging planted feet to catch up.
    if (lag > 0.8) return;
    if (distance < 0.1) {
      // A detour may approach from the side. Face the food before lowering the head.
      if (grazer.path.length === 1) {
        const patch = this.patches[grazer.target] as Patch;
        const turn = yawDelta(grazer.yaw, Math.atan2(patch.x - grazer.x, patch.z - grazer.z));
        if (Math.abs(turn) > 0.02) {
          grazer.yaw += Math.max(-dt * 0.55, Math.min(dt * 0.55, turn));
          return;
        }
      }
      grazer.path.shift();
      if (!grazer.path.length) {
        grazer.state = "crop";
        grazer.age = 0;
      }
      return;
    }
    const desired = Math.atan2(goal.x - grazer.x, goal.z - grazer.z);
    grazer.yaw += Math.max(-dt * 0.55, Math.min(dt * 0.55, yawDelta(grazer.yaw, desired)));
    if (Math.abs(yawDelta(grazer.yaw, desired)) > 0.8) return;
    const travel = Math.min(distance, dt * SPEED);
    const next = {
      x: grazer.x + Math.sin(grazer.yaw) * travel,
      z: grazer.z + Math.cos(grazer.yaw) * travel,
    };
    if (clearGroundSegment(grazer, next, circles, this.ground)) {
      grazer.x = next.x;
      grazer.z = next.z;
    } else if (grazer.replan <= 0) {
      this.choose(grazer, index, circles);
    }
  }

  private restPoint(grazer: Grazer, foot: Foot, out: THREE.Vector3) {
    const x = foot.side * 1.04;
    const z = foot.front * 0.86;
    const c = Math.cos(grazer.yaw);
    const s = Math.sin(grazer.yaw);
    out.set(grazer.x + x * c + z * s, 0, grazer.z - x * s + z * c);
    out.y = this.ground(out.x, out.z);
    return out;
  }

  private stepFeet(grazer: Grazer, dt: number, circles: readonly GrazerObstacle[]) {
    let swinging = false;
    for (const foot of grazer.feet)
      if (foot.swing) {
        foot.progress = Math.min(1, foot.progress + dt / SWING_TIME);
        foot.p.lerpVectors(foot.from, foot.to, smooth(foot.progress));
        foot.p.y += Math.sin(foot.progress * Math.PI) * 0.24;
        if (foot.progress === 1) {
          foot.swing = false;
          foot.p.copy(foot.to);
        } else swinging = true;
      }
    if (swinging) return;
    let lag = 0.28;
    let next: Foot | null = null;
    for (const foot of grazer.feet) {
      this.restPoint(grazer, foot, this.rest);
      const distance = Math.hypot(this.rest.x - foot.p.x, this.rest.z - foot.p.z);
      if (distance > lag && clearGroundSegment(foot.p, this.rest, circles, this.ground, 0.35)) {
        lag = distance;
        next = foot;
      }
    }
    if (next) {
      next.swing = true;
      next.progress = 0;
      next.from.copy(next.p);
      this.restPoint(grazer, next, next.to);
    }
  }

  private ball(mesh: THREE.InstancedMesh, index: number, position: THREE.Vector3, radius: number) {
    this.dummy.position.copy(position);
    this.dummy.quaternion.identity();
    this.dummy.scale.setScalar(radius);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
  }

  private link(index: number, a: THREE.Vector3, b: THREE.Vector3, radius: number) {
    this.vector.subVectors(b, a);
    this.dummy.position.copy(a).addScaledVector(this.vector, 0.5);
    this.dummy.scale.set(radius, this.vector.length(), radius * 0.86);
    this.vector.normalize();
    this.dummy.quaternion.setFromUnitVectors(UP, this.vector);
    this.dummy.updateMatrix();
    this.models.links.setMatrixAt(index, this.dummy.matrix);
  }

  private pose(dt: number) {
    for (const [i, grazer] of this.grazers.entries()) {
      const feet = grazer.feet;
      let supports = 0;
      let supportHeight = 0;
      for (const foot of feet)
        if (!foot.swing) {
          supports++;
          supportHeight += foot.p.y;
        }
      const height = supportHeight / Math.max(1, supports) + 1.42;
      grazer.y += (height - grazer.y) * Math.min(1, dt * 4);
      const circle = this.circles[i] as GrazerObstacle;
      circle.x = grazer.x;
      circle.z = grazer.z;
      const dip =
        !this.calm && grazer.state === "crop"
          ? smooth(grazer.age / 1.1) * (1 - smooth((grazer.age - 4.9) / 1.1))
          : 0;
      const tiltX =
        Math.atan2(
          (feet[1]?.p.y ?? 0) + (feet[3]?.p.y ?? 0) - (feet[0]?.p.y ?? 0) - (feet[2]?.p.y ?? 0),
          3.44,
        ) * 0.65;
      const tiltZ =
        Math.atan2(
          (feet[2]?.p.y ?? 0) + (feet[3]?.p.y ?? 0) - (feet[0]?.p.y ?? 0) - (feet[1]?.p.y ?? 0),
          4.16,
        ) * 0.65;
      const sway = this.calm ? 0 : Math.sin(this.time * 1.4 + i * 2.3) * 0.009;
      const model = grazer.model;
      model.root.position.set(grazer.x, grazer.y, grazer.z);
      model.root.rotation.set(tiltX + dip * 0.015, grazer.yaw, tiltZ + sway, "YXZ");
      model.head.rotation.x = 0.12 + dip * 0.66;
      // The mandible lifts to crop the crystal tips; a downward stroke would dig into regolith.
      model.jaw.rotation.x = -dip * (0.08 + 0.14 * Math.sin(this.time * 6.2 + i) ** 2);
      model.root.updateMatrixWorld(true);
      for (const [k, foot] of feet.entries()) {
        this.hip
          .set(foot.side * 0.78, -0.28, foot.front * 0.7)
          .applyMatrix4(model.root.matrixWorld);
        this.rest.copy(foot.p);
        this.rest.y += 0.14;
        this.axis.subVectors(this.rest, this.hip);
        const distance = this.axis.length();
        this.axis.divideScalar(Math.max(0.0001, distance));
        this.bend.set(Math.cos(grazer.yaw) * foot.side, 0.14, -Math.sin(grazer.yaw) * foot.side);
        this.bend.addScaledVector(this.axis, -this.bend.dot(this.axis)).normalize();
        const reach = Math.min(1.98, distance);
        const along = (1 - 1.04 ** 2 + reach ** 2) / (2 * Math.max(reach, 0.001));
        const outward = Math.sqrt(Math.max(0, 1 - along * along));
        this.knee
          .copy(this.hip)
          .addScaledVector(this.axis, along)
          .addScaledVector(this.bend, outward);
        this.link(i * 8 + k * 2, this.hip, this.knee, 0.18);
        this.link(i * 8 + k * 2 + 1, this.knee, this.rest, 0.13);
        this.ball(this.models.joints, i * 12 + k * 3, this.hip, 0.17);
        this.ball(this.models.joints, i * 12 + k * 3 + 1, this.knee, 0.14);
        this.ball(this.models.joints, i * 12 + k * 3 + 2, this.rest, 0.105);
        const e = 0.16;
        this.normal
          .set(
            this.ground(foot.p.x - e, foot.p.z) - this.ground(foot.p.x + e, foot.p.z),
            e * 2,
            this.ground(foot.p.x, foot.p.z - e) - this.ground(foot.p.x, foot.p.z + e),
          )
          .normalize();
        this.facing.setFromAxisAngle(UP, grazer.yaw);
        this.footRotation.setFromUnitVectors(UP, this.normal).multiply(this.facing);
        this.dummy.position.copy(foot.p);
        this.dummy.quaternion.copy(this.footRotation);
        this.dummy.scale.setScalar(1);
        this.dummy.updateMatrix();
        this.models.feet.setMatrixAt(i * 4 + k, this.dummy.matrix);
      }
      for (let side = 0; side < 2; side++) {
        this.vector.set(side ? 0.28 : -0.28, 0.09, 0.87).applyMatrix4(model.head.matrixWorld);
        this.ball(this.models.eyes, i * 2 + side, this.vector, 1);
      }
    }
    for (const [i, patch] of this.patches.entries()) {
      this.dummy.position.set(patch.x, this.ground(patch.x, patch.z) + 0.05, patch.z);
      this.dummy.rotation.set(0, patch.seed * 0.31, 0);
      this.dummy.scale.set(0.54, 0.08, 0.43);
      this.dummy.updateMatrix();
      this.models.crust.setMatrixAt(i, this.dummy.matrix);
      for (let j = 0; j < 7; j++) {
        const angle = j * 2.399 + patch.seed;
        const spread = 0.08 + (j % 4) * 0.105;
        const x = patch.x + Math.sin(angle) * spread;
        const z = patch.z + Math.cos(angle) * spread;
        const size = (0.25 + (j % 3) * 0.07) * patch.amount;
        this.dummy.position.set(x, this.ground(x, z) + 0.055, z);
        this.dummy.rotation.set(Math.sin(angle) * 0.18, angle, Math.cos(angle) * 0.16);
        this.dummy.scale.set(1, size, 1);
        this.dummy.updateMatrix();
        this.models.lichen.setMatrixAt(i * 7 + j, this.dummy.matrix);
      }
    }
    this.models.commit();
  }

  snapshot() {
    return {
      calm: this.calm,
      disposed: this.disposed,
      time: this.time,
      grazers: this.grazers.map((grazer) => ({
        x: grazer.x,
        y: grazer.y,
        z: grazer.z,
        r: GRAZER_RADIUS,
        yaw: grazer.yaw,
        state: grazer.state,
        target: grazer.target,
        headPitch: grazer.model.head.rotation.x,
        feet: grazer.feet.map((foot) => ({
          x: foot.p.x,
          y: foot.p.y,
          z: foot.p.z,
          planted: !foot.swing,
        })),
      })),
      lichen: this.patches.map((patch) => ({ x: patch.x, z: patch.z, amount: patch.amount })),
    };
  }

  diagnostics() {
    return this.models.diagnostics();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.models.dispose();
    this.grazers.length = this.patches.length = 0;
    this.circles.length = 0;
  }
}
