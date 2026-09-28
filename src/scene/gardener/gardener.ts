import * as THREE from "three";
import { ChestScreen, fabricMaterial, partMaterials, suitUniforms } from "./materials";
import { ANKLE, BONES, type BoneName, bindOf, SHIN, THIGH } from "./rig";
import type { RigidPart, SuitMesh } from "./suit-body";

// The gardener: the suit from suit-body.ts on its skeleton, moved procedurally for one-sixth
// gravity:
// - At a stroll the steps are slow and deliberate, and the body barely bobs.
// - Faster, the gait becomes the lunar lope: a skipping bound where the second foot lands just
//   after the first and the body floats between landings.
// - In a jump the arms rise for balance and the legs reach for the ground; landings squash.
// Feet are planted on the real ground by two-bone IK, and springs give the head, pack and arms
// their follow-through.

export interface Motion {
  /** Ground speed, m/s. */
  speed: number;
  grounded: boolean;
  /** Vertical speed, m/s (positive up). */
  vy: number;
  /** Turn rate, rad/s (positive left). */
  turn: number;
  /** 0 … 1 kneeling (planting). */
  kneel: number;
  /** Where the camera looks, relative to the body (radians). */
  lookYaw: number;
  lookPitch: number;
}

export const stillMotion = (): Motion => ({
  speed: 0,
  grounded: true,
  vy: 0,
  turn: 0,
  kneel: 0,
  lookYaw: 0,
  lookPitch: 0,
});

const TWO_PI = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const damp = (from: number, to: number, rate: number, dt: number) =>
  from + (to - from) * (1 - Math.exp(-rate * dt));

class Spring {
  x = 0;
  v = 0;
  constructor(
    private k: number,
    private c: number,
  ) {}
  step(target: number, dt: number) {
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (this.k * (target - this.x) - this.c * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
  kick(v: number) {
    this.v += v;
  }
}

const restAngle = (from: BoneName, to: BoneName) => {
  const a = bindOf(from);
  const b = bindOf(to);
  return Math.atan2(-(b[2] - a[2]), -(b[1] - a[1]));
};
const THIGH_REST = restAngle("thighL", "shinL");
const SHIN_REST = restAngle("shinL", "footL");
const HIPS_Y = bindOf("hips")[1];

export type GardenerTier = "high" | "medium" | "low";
const VOXEL: Record<GardenerTier, { suit: number; parts: number }> = {
  high: { suit: 0.011, parts: 1 },
  medium: { suit: 0.013, parts: 1.25 },
  low: { suit: 0.017, parts: 1.7 },
};

async function buildMeshes(tier: GardenerTier) {
  const v = VOXEL[tier];
  try {
    const worker = new Worker(new URL("./suit-body.worker.ts", import.meta.url), {
      type: "module",
    });
    const out = await new Promise<{ suit: SuitMesh; parts: RigidPart[] }>((resolve, reject) => {
      worker.onmessage = (e) => resolve(e.data);
      worker.onerror = (e) => reject(e);
      worker.postMessage(v);
    });
    worker.terminate();
    return out;
  } catch {
    const { buildParts, buildSuit } = await import("./suit-body");
    return { suit: buildSuit(v.suit), parts: buildParts(v.parts) };
  }
}

function geometry(positions: Float32Array, normals: Float32Array, indices: Uint32Array) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  const n = positions.length / 3;
  g.setIndex(new THREE.BufferAttribute(n < 65536 ? Uint16Array.from(indices) : indices, 1));
  g.computeBoundingSphere();
  return g;
}

export class Gardener {
  readonly root = new THREE.Group();
  readonly ready: Promise<void>;
  readonly screen = new ChestScreen();
  /** World height of the ground at a point (for planting the feet). */
  ground: ((x: number, z: number) => number) | null = null;
  /** Called on every footfall with the foot's world position and how hard it landed. */
  onFootfall: ((at: THREE.Vector3, strength: number) => void) | null = null;
  phase = 0;

  private bone = new Map<BoneName, THREE.Bone>();
  private skeleton: THREE.Skeleton;
  private v = 0;
  private time = 0;
  private lastU = [0, 0];
  private settle = new Spring(90, 11);
  private headLag = { x: new Spring(120, 18), y: new Spring(120, 18) };
  private armSprings = [new Spring(80, 12), new Spring(80, 12)];
  private air = 0;
  private wasGrounded = true;
  private target = new THREE.Vector3();
  private inverse = new THREE.Matrix4();
  private world = new THREE.Vector3();

  constructor(tier: GardenerTier) {
    const order: THREE.Bone[] = [];
    for (const def of BONES) {
      const b = new THREE.Bone();
      b.name = def.name;
      const p = def.parent ? bindOf(def.parent) : [0, 0, 0];
      b.position.set(
        def.at[0] - (p[0] as number),
        def.at[1] - (p[1] as number),
        def.at[2] - (p[2] as number),
      );
      (def.parent ? (this.bone.get(def.parent) as THREE.Bone) : this.root).add(b);
      this.bone.set(def.name, b);
      order.push(b);
    }
    this.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(order);
    this.ready = this.build(tier);
  }

  private b(name: BoneName) {
    return this.bone.get(name) as THREE.Bone;
  }

  private async build(tier: GardenerTier) {
    const { suit, parts } = await buildMeshes(tier);
    const g = geometry(suit.positions, suit.normals, suit.indices);
    g.setAttribute("skinIndex", new THREE.BufferAttribute(suit.joints, 4));
    g.setAttribute("skinWeight", new THREE.BufferAttribute(suit.weights, 4, true));
    g.setAttribute("region", new THREE.BufferAttribute(suit.region, 4, true));
    const body = new THREE.SkinnedMesh(g, fabricMaterial());
    body.bind(this.skeleton, new THREE.Matrix4());
    body.castShadow = true;
    body.receiveShadow = true;
    body.frustumCulled = false;
    this.root.add(body);
    const materials = partMaterials(this.screen);
    for (const p of parts) {
      const geo = geometry(p.positions, p.normals, p.indices);
      if (p.material === "screen") {
        // Planar UVs across the display face.
        geo.computeBoundingBox();
        const bb = geo.boundingBox as THREE.Box3;
        const pos = geo.getAttribute("position") as THREE.BufferAttribute;
        const uv = new Float32Array(pos.count * 2);
        for (let i = 0; i < pos.count; i++) {
          uv[i * 2] = (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x);
          uv[i * 2 + 1] = (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y);
        }
        geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      }
      const mesh = new THREE.Mesh(geo, materials[p.material]);
      const at = bindOf(p.bone);
      mesh.position.set(-at[0], -at[1], -at[2]);
      mesh.castShadow = p.material !== "glass" && p.material !== "lamp" && p.material !== "screen";
      mesh.receiveShadow = true;
      if (p.material === "glass") mesh.renderOrder = 5;
      this.b(p.bone).add(mesh);
    }
  }

  /** Dust worked into the suit so far (0 … 1). */
  set dust(v: number) {
    suitUniforms.uDust.value = clamp(v, 0, 1);
  }

  update(m: Motion, dt: number, calm: boolean) {
    this.time += dt;
    const t = this.time;
    const amp = calm ? 0.5 : 1;
    this.v = dt === 0 ? m.speed : damp(this.v, m.speed, 6, dt);
    const v = this.v;
    const airborne = m.grounded ? 0 : 1;
    this.air = damp(this.air, airborne, 8, dt);
    const move = smooth(0.05, 0.4, v) * (1 - this.air) * (1 - m.kneel);
    const lope = smooth(0.9, 1.6, v);
    const stepLen = mix(0.52 + 0.28 * v, 0.95 + 0.35 * (v - 1), lope);
    if (v > 0.02) this.phase = (this.phase + (dt * Math.PI * v) / Math.max(0.3, stepLen)) % TWO_PI;
    const offset = mix(0.5, 0.2, lope);
    const duty = mix(0.62, 0.3, lope);
    const stride = Math.min(2 * duty * stepLen, 0.62);
    const lift = mix(0.09, 0.16, lope);

    // Landings squash the body and kick the springs.
    if (m.grounded && !this.wasGrounded) {
      const hit = clamp(-m.vy / 3, 0.2, 1.2);
      this.settle.kick(-0.9 * hit * amp);
      this.onFootfall?.(this.root.position.clone(), hit);
    }
    this.wasGrounded = m.grounded;

    // ---- pelvis ------------------------------------------------------------------------------------
    const hips = this.b("hips");
    const cycle = this.phase / TWO_PI;
    const walkBob = -0.025 * (0.5 + 0.5 * Math.cos(2 * this.phase));
    // In the lope the body floats between the paired landings.
    const u0 = cycle % 1;
    const flightStart = duty + offset * 0.5;
    const flight =
      u0 > Math.min(0.95, flightStart)
        ? Math.sin(Math.PI * clamp((u0 - flightStart) / (1 - flightStart), 0, 1))
        : 0;
    const lopeBob = -0.05 + flight * (0.1 + 0.08 * clamp(v - 1, 0, 1.2));
    const bob = mix(walkBob, lopeBob, lope) * move * amp;
    const settle = this.settle.step(0, dt);
    const crouch = 0.03 + 0.05 * lope + m.kneel * 0.42;
    const sway = -Math.cos(this.phase) * 0.018 * move * (1 - lope) * amp;
    const hipsY = HIPS_Y - crouch + bob + settle - this.air * 0.02;
    hips.position.set(sway, hipsY, 0);
    const yaw = Math.sin(this.phase) * 0.07 * move * (1 - lope * 0.5) * amp;
    const pelvisPitch = -0.08 * lope * move - m.kneel * 0.2;
    hips.rotation.set(pelvisPitch, yaw, m.turn * 0.05);

    // ---- torso and head ----------------------------------------------------------------------------
    const lean = (0.05 + 0.16 * lope) * move - m.turn * 0.02;
    this.b("spine").rotation.set(-lean + m.kneel * 0.3, -yaw * 0.6, -m.turn * 0.08 * v);
    const breathe = calm ? 0 : Math.sin(t * 1.6) * 0.01;
    this.b("chest").rotation.set(breathe - lean * 0.3, -yaw * 0.6, 0);
    const hx = this.headLag.x.step(
      clamp(m.lookPitch, -0.5, 0.35) * 0.6 + lean * 0.5 + settle * 0.8,
      dt,
    );
    const hy = this.headLag.y.step(clamp(m.lookYaw, -0.9, 0.9) * 0.55, dt);
    this.b("neck").rotation.set(hx * 0.4, hy * 0.4, 0);
    this.b("head").rotation.set(hx * 0.6, hy * 0.6, 0);

    // ---- arms: counter-swing when walking, out for balance in the air ------------------------------
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1;
      const u = (cycle + (i === 0 ? offset : 0)) % 1;
      const footZ =
        u < duty ? mix(-0.5, 0.5, u / duty) : mix(0.5, -0.5, smooth(0, 1, (u - duty) / (1 - duty)));
      const swing = (this.armSprings[i] as Spring).step(
        -footZ * (0.5 - 0.25 * lope) * move * amp,
        dt,
      );
      const out = 0.12 + 0.18 * lope * move + this.air * 0.55;
      this.b(i === 0 ? "armL" : "armR").rotation.set(
        swing + this.air * 0.25 + m.kneel * 0.6,
        0,
        s * out,
      );
      this.b(i === 0 ? "foreArmL" : "foreArmR").rotation.set(
        0.35 + 0.35 * lope + m.kneel * 0.5,
        0,
        0,
      );
    }

    // ---- legs: planted feet by IK on the real ground -----------------------------------------------
    hips.updateMatrix();
    this.inverse.copy(hips.matrix).invert();
    this.root.updateMatrixWorld();
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const u = (cycle + (i === 0 ? offset : 0)) % 1;
      let z: number;
      let y = 0;
      let pitch: number;
      if (u < duty) {
        const s = u / duty;
        z = mix(-stride / 2, stride / 2, s);
        pitch = s < 0.15 ? mix(0.25, 0, s / 0.15) : s > 0.75 ? mix(0, -0.45, (s - 0.75) / 0.25) : 0;
      } else {
        const s = (u - duty) / (1 - duty);
        z = mix(stride / 2, -stride / 2, smooth(0, 1, s));
        y = lift * Math.sin(Math.PI * s);
        pitch = mix(-0.45, 0.25, smooth(0.1, 0.9, s));
      }
      if (this.lastU[i] !== undefined && u < (this.lastU[i] as number) && move > 0.3 && dt > 0) {
        this.world.set(side * 0.11, 0, z).applyMatrix4(this.root.matrixWorld);
        this.onFootfall?.(this.world.clone(), 0.4 + 0.5 * lope);
      }
      this.lastU[i] = u;
      z *= move;
      y *= move;
      pitch *= move;
      // In the air the legs hang a little bent, reaching for the ground as it nears.
      z = mix(z, side * 0.06 - 0.05, this.air);
      y = mix(y, 0.12, this.air);
      // Kneeling: the left knee down, the right foot forward.
      if (m.kneel > 0) {
        z = mix(z, side < 0 ? 0.28 : -0.26, m.kneel);
        y = mix(y, side < 0 ? -0.02 : 0, m.kneel);
      }
      // Where the ground actually is under this foot.
      let ground = 0;
      if (this.ground) {
        this.world.set(side * 0.11, 0, z).applyMatrix4(this.root.matrixWorld);
        ground = clamp(this.ground(this.world.x, this.world.z) - this.root.position.y, -0.35, 0.35);
      }
      this.target.set(
        side * 0.11,
        ANKLE + y + ground * (1 - this.air) + Math.max(0, -pitch) * 0.08,
        z - 0.01,
      );
      this.solveLeg(i, pitch, pelvisPitch);
    }
  }

  private solveLeg(i: number, pitch: number, pelvisPitch: number) {
    const thigh = this.b(i === 0 ? "thighL" : "thighR");
    const shin = this.b(i === 0 ? "shinL" : "shinR");
    const foot = this.b(i === 0 ? "footL" : "footR");
    const d = this.target.applyMatrix4(this.inverse).sub(thigh.position);
    const L = clamp(d.length(), Math.abs(THIGH - SHIN) + 1e-3, THIGH + SHIN - 1e-3);
    const theta = Math.atan2(-d.z, -d.y);
    const roll = Math.atan2(d.x, -d.y);
    const beta = Math.acos(clamp((THIGH * THIGH + L * L - SHIN * SHIN) / (2 * THIGH * L), -1, 1));
    const knee =
      Math.PI - Math.acos(clamp((THIGH * THIGH + SHIN * SHIN - L * L) / (2 * THIGH * SHIN), -1, 1));
    const thighX = theta + beta - THIGH_REST;
    const shinX = -knee - (SHIN_REST - THIGH_REST);
    thigh.rotation.set(thighX, 0, roll, "ZXY");
    shin.rotation.set(shinX, 0, 0);
    foot.rotation.set(pitch - pelvisPitch - thighX - shinX, 0, -roll);
  }
}
