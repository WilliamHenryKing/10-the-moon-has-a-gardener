import * as THREE from "three";
import { PALETTE } from "./palette";

const mat = (color: number, roughness = 0.7, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

function capsule(r: number, len: number, m: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), m);
  mesh.position.y = -len / 2 - r * 0.6; // hangs from its pivot
  return mesh;
}

/** A limb that swings from a joint at its top. */
function limb(r: number, len: number, m: THREE.Material, end?: THREE.Mesh): THREE.Group {
  const pivot = new THREE.Group();
  pivot.add(capsule(r, len, m));
  if (end) {
    end.position.y = -len - r * 1.4;
    pivot.add(end);
  }
  return pivot;
}

/**
 * The gardener: a soft white suit with a hard torso, an orange-trimmed life-support pack
 * that doubles as a seed pack, and a gold visor. About 1.4 tiles tall.
 */
export class Astronaut {
  readonly group = new THREE.Group();
  private body = new THREE.Group();
  private legs: THREE.Group[] = [];
  private arms: THREE.Group[] = [];
  private target = new THREE.Vector3();
  private facing = 0;
  private phase = 0;
  /** Called on each footfall, for footstep sounds. */
  onStep: (() => void) | null = null;
  private kneel = 0;
  private kneelTimer = 0;
  private lookAt: THREE.Vector3 | null = null;

  constructor() {
    const suit = mat(PALETTE.suit, 0.8);
    const soft = mat(PALETTE.suitSoft, 0.9);
    const accent = mat(PALETTE.accent, 0.5);
    const dark = mat(PALETTE.rubber, 0.6);

    for (const side of [-1, 1]) {
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.24), dark);
      boot.position.z = 0.03;
      const leg = limb(0.075, 0.32, soft, boot);
      leg.position.set(side * 0.1, 0.56, 0);
      this.legs.push(leg);
      this.body.add(leg);

      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), accent);
      const arm = limb(0.058, 0.3, soft, glove);
      arm.position.set(side * 0.23, 0.98, 0);
      arm.rotation.z = side * 0.12;
      this.arms.push(arm);
      this.body.add(arm);
    }

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.26, 6, 14), suit);
    torso.position.y = 0.84;
    torso.scale.z = 0.8;
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 16), accent);
    belt.position.y = 0.66;
    belt.scale.z = 0.8;
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.18), suit);
    pack.position.set(0, 0.9, -0.21);
    const packTrim = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.2), accent);
    packTrim.position.set(0, 1.05, -0.21);
    const seedPod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.3, 10),
      new THREE.MeshStandardMaterial({ color: 0x6fdcc8, emissive: 0x2a8a7c, roughness: 0.3 }),
    );
    seedPod.position.set(0.19, 0.9, -0.24);
    const patch = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), accent);
    patch.position.set(-0.1, 0.95, 0.153);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 16), suit);
    helmet.position.y = 1.2;
    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(
        0.155,
        24,
        16,
        -Math.PI * 0.42,
        Math.PI * 0.84,
        Math.PI * 0.25,
        Math.PI * 0.42,
      ),
      new THREE.MeshStandardMaterial({ color: PALETTE.visor, metalness: 1, roughness: 0.12 }),
    );
    visor.position.set(0, 1.2, 0.025);
    visor.rotation.y = 0;
    const neck = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 8, 20), accent);
    neck.rotation.x = Math.PI / 2;
    neck.position.y = 1.06;
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.28, 4), dark);
    antenna.position.set(-0.13, 1.25, -0.24);

    this.body.add(torso, belt, pack, packTrim, seedPod, patch, helmet, visor, neck, antenna);
    this.body.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    this.group.add(this.body);
    this.target.copy(this.group.position);
  }

  place(p: THREE.Vector3): void {
    this.group.position.copy(p);
    this.target.copy(p);
  }

  /** Walk beside a tile, then kneel to work it. */
  tend(tile: THREE.Vector3): void {
    const from = this.group.position;
    const away = new THREE.Vector3(from.x - tile.x, 0, from.z - tile.z);
    if (away.lengthSq() < 0.01) away.set(0, 0, 1);
    away.normalize().multiplyScalar(0.62);
    this.target.set(tile.x + away.x, tile.y, tile.z + away.z);
    this.lookAt = tile.clone();
    this.kneelTimer = 0.9;
  }

  get moving(): boolean {
    return this.group.position.distanceTo(this.target) > 0.03;
  }

  update(dt: number, time: number, reduced: boolean): void {
    const pos = this.group.position;
    const toTarget = new THREE.Vector3().subVectors(this.target, pos);
    toTarget.y = 0;
    const dist = toTarget.length();
    const walking = dist > 0.03;
    if (walking) {
      if (reduced) pos.copy(this.target);
      else pos.addScaledVector(toTarget.normalize(), Math.min(dist, dt * 2.2));
      this.facing = Math.atan2(this.target.x - pos.x, this.target.z - pos.z) || this.facing;
      const before = Math.floor(this.phase / Math.PI);
      this.phase += dt * 9;
      if (Math.floor(this.phase / Math.PI) !== before) this.onStep?.();
    } else {
      if (this.lookAt) this.facing = Math.atan2(this.lookAt.x - pos.x, this.lookAt.z - pos.z);
      if (this.kneelTimer > 0) this.kneelTimer -= dt;
    }
    pos.y = this.target.y;

    let d = this.facing - this.group.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.group.rotation.y += d * Math.min(1, dt * 8);

    const kneelGoal = !walking && this.kneelTimer > 0 ? 1 : 0;
    this.kneel += (kneelGoal - this.kneel) * Math.min(1, dt * (reduced ? 20 : 8));

    // Low-gravity lope: long slow strides and a floaty bob.
    const stride = walking ? Math.sin(this.phase) : 0;
    const legs = this.legs;
    const arms = this.arms;
    legs[0]?.rotation.set(stride * 0.55 - this.kneel * 0.9, 0, 0);
    legs[1]?.rotation.set(-stride * 0.55 + this.kneel * 0.2, 0, 0);
    arms[0]?.rotation.set(-stride * 0.4 - this.kneel * 1.1, 0, -0.12);
    arms[1]?.rotation.set(stride * 0.4 - this.kneel * 1.1, 0, 0.12);
    const bob = walking ? Math.abs(Math.sin(this.phase)) * 0.06 : Math.sin(time * 1.6) * 0.008;
    this.body.position.y = bob - this.kneel * 0.18;
    this.body.rotation.x = this.kneel * 0.35;
  }
}
