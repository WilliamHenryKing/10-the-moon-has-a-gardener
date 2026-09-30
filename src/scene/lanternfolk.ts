import * as THREE from "three";
import { glow } from "./caches";

// The basin is not as empty as the survey said. Lanternfolk drift in a slow procession along the
// crater rim, bells pulsing with a cold light, trailing tendrils. When the Sun sinks behind the
// hills they come down into the basin and hover over the blooms, one to a flower, lighting the
// ground under them; when it comes back they rise and rejoin the procession. The first dusk they
// find three blooms together, they leave something behind.

type Ground = (x: number, z: number) => number;

const RIM = 226;
const SPEED = 0.0042; // radians a second along the rim
/** They are big: a bell four metres across, tendrils trailing twelve. */
const SIZE = 2.2;
/** Hovering height over a bloom (their tendrils just reach it). */
const HOVER = 7;

const BELL_VERTEX = /* glsl */ `
  uniform float pulse;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  varying float vH;
  void main() {
    vec3 p = position;
    // The bell contracts and relaxes as it swims.
    float squeeze = 1.0 - 0.12 * pulse * smoothstep(0.0, 1.0, 1.0 - p.y);
    p.xz *= squeeze;
    p.y *= 1.0 + 0.08 * pulse;
    vH = position.y;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;

const BELL_FRAGMENT = /* glsl */ `
  uniform vec3 colour;
  uniform float pulse;
  uniform float strength;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  varying float vH;
  void main() {
    float rim = pow(clamp(1.0 - abs(dot(normalize(vNormalV), vViewDir)), 0.0, 1.0), 2.2);
    float veins = 0.5 + 0.5 * sin(vH * 26.0 + pulse * 3.0);
    float a = (0.1 + rim * 0.75 + veins * 0.08) * (0.7 + 0.5 * pulse) * strength;
    gl_FragColor = vec4(colour * a * 2.2, a);
  }`;

const TENDRIL_VERTEX = /* glsl */ `
  uniform float time;
  uniform float phase;
  attribute float along;
  varying float vAlong;
  void main() {
    vec3 p = position;
    // Each tendril sways more toward its tip, a wave running down it.
    float w = along * along;
    p.x += sin(time * 1.3 + phase + along * 5.0) * 0.35 * w;
    p.z += cos(time * 1.1 + phase * 1.7 + along * 4.0) * 0.3 * w;
    vAlong = along;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;

const TENDRIL_FRAGMENT = /* glsl */ `
  uniform vec3 colour;
  uniform float strength;
  varying float vAlong;
  void main() {
    float a = (1.0 - vAlong) * 0.55 * strength;
    gl_FragColor = vec4(colour * a * 2.0, a);
  }`;

/** Six ribbons hanging from the bell's rim, `along` 0 at the bell and 1 at the tip. */
function tendrils() {
  const pos: number[] = [];
  const along: number[] = [];
  const idx: number[] = [];
  const n = 6;
  const seg = 14;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const r = 0.55 + (k % 2) * 0.12;
    const len = 2.2 + (k % 3) * 0.6;
    const base = pos.length / 3;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const x = Math.cos(a) * r * (1 - t * 0.4);
      const z = Math.sin(a) * r * (1 - t * 0.4);
      const y = 0.05 - t * len;
      const wdt = 0.05 * (1 - t * 0.7);
      // A ribbon: two vertices across, facing roughly outward.
      pos.push(x - Math.sin(a) * wdt, y, z + Math.cos(a) * wdt);
      pos.push(x + Math.sin(a) * wdt, y, z - Math.cos(a) * wdt);
      along.push(t, t);
      if (i < seg) {
        const v = base + i * 2;
        idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("along", new THREE.Float32BufferAttribute(along, 1));
  g.setIndex(idx);
  return g;
}

interface Folk {
  root: THREE.Group;
  bell: THREE.ShaderMaterial;
  tail: THREE.ShaderMaterial;
  core: THREE.Sprite;
  pool: THREE.Mesh;
  /** Place along the rim (radians) and height above it. */
  angle: number;
  lift: number;
  phase: number;
  /** Where it is going at dusk: a bloom, or null (the rim). */
  target: THREE.Vector3 | null;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
}

export class Lanternfolk {
  readonly group = new THREE.Group();
  private folk: Folk[] = [];
  private time = 0;
  private dusk = false;
  private gifted = false;
  /** Called once, the first dusk they gather over three or more blooms: where they left it. */
  onGift: ((x: number, z: number) => void) | null = null;

  constructor(
    private ground: Ground,
    count: number,
  ) {
    const bellGeo = new THREE.SphereGeometry(0.85, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const tailGeo = tendrils();
    const poolGeo = new THREE.CircleGeometry(7, 32);
    poolGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < count; i++) {
      const hue = new THREE.Color().setHSL(0.5 + (i % 3) * 0.06, 0.8, 0.62);
      const phase = i * 1.93;
      const bell = new THREE.ShaderMaterial({
        uniforms: { colour: { value: hue }, pulse: { value: 0 }, strength: { value: 1 } },
        vertexShader: BELL_VERTEX,
        fragmentShader: BELL_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const tail = new THREE.ShaderMaterial({
        uniforms: {
          colour: { value: hue },
          time: { value: 0 },
          phase: { value: phase },
          strength: { value: 1 },
        },
        vertexShader: TENDRIL_VERTEX,
        fragmentShader: TENDRIL_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const root = new THREE.Group();
      const b = new THREE.Mesh(bellGeo, bell);
      const t = new THREE.Mesh(tailGeo, tail);
      const core = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glow(),
          color: hue.clone().multiplyScalar(2.2),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      core.position.y = 0.25;
      core.scale.setScalar(1.6);
      root.add(b, t, core);
      root.scale.setScalar(SIZE);
      for (const m of [b, t]) m.frustumCulled = false;
      const pool = new THREE.Mesh(
        poolGeo,
        new THREE.MeshBasicMaterial({
          map: glow(),
          color: hue.clone().multiplyScalar(0.6),
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      this.group.add(root, pool);
      const angle = (i / count) * 0.9 + 1.2;
      const f: Folk = {
        root,
        bell,
        tail,
        core,
        pool,
        angle,
        lift: 17 + (i % 4) * 3,
        phase,
        target: null,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
      };
      f.pos.copy(this.rimPoint(f, 0));
      this.folk.push(f);
    }
  }

  private rimPoint(f: Folk, time: number) {
    const a = f.angle + time * SPEED;
    const x = Math.sin(a) * RIM;
    const z = -Math.cos(a) * RIM;
    const bob = Math.sin(time * 0.4 + f.phase) * 1.5;
    return new THREE.Vector3(x, this.ground(x, z) + f.lift + bob, z);
  }

  /**
   * `sun`: how much of the Sun clears the hills (dusk when it sinks behind them).
   * `blooms`: where the open flowers are.
   */
  update(dt: number, sun: number, blooms: readonly { x: number; z: number }[]) {
    this.time += dt;
    const t = this.time;
    const wasDusk = this.dusk;
    this.dusk = this.dusk ? sun < 0.7 : sun < 0.3;
    if (this.dusk && !wasDusk) {
      // Down to the flowers: one each, nearest first round the procession.
      const free = [...blooms];
      for (const f of this.folk) {
        let best = -1;
        let bestD = Infinity;
        for (let i = 0; i < free.length; i++) {
          const b = free[i] as { x: number; z: number };
          const d = Math.hypot(b.x - f.pos.x, b.z - f.pos.z);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        const b = best >= 0 ? free.splice(best, 1)[0] : undefined;
        f.target = b ? new THREE.Vector3(b.x, this.ground(b.x, b.z) + HOVER, b.z) : null;
      }
      if (!this.gifted && blooms.length >= 3) {
        this.gifted = true;
        const c = blooms.reduce((s, b) => ({ x: s.x + b.x, z: s.z + b.z }), { x: 0, z: 0 });
        this.onGift?.(c.x / blooms.length + 1.5, c.z / blooms.length + 1.5);
      }
    }
    if (!this.dusk && wasDusk) for (const f of this.folk) f.target = null;
    for (const f of this.folk) {
      const goal = f.target
        ? f.target.clone().add(new THREE.Vector3(0, Math.sin(t * 0.9 + f.phase) * 0.4, 0))
        : this.rimPoint(f, t);
      // Swim toward the goal: steer, never snap.
      const want = goal.sub(f.pos);
      const dist = want.length();
      // Quick down to the flowers (the dusk is short), unhurried along the rim.
      const cruise = f.target ? 14 : 3;
      want.setLength(Math.min(cruise, dist * 0.7));
      f.vel.lerp(want, Math.min(1, dt * (f.target ? 1.4 : 0.8)));
      f.pos.addScaledVector(f.vel, dt);
      f.root.position.copy(f.pos);
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.1 + f.phase);
      (f.bell.uniforms.pulse as { value: number }).value = pulse;
      (f.tail.uniforms.time as { value: number }).value = t;
      f.core.scale.setScalar(1.3 + pulse * 0.6);
      // Light pooled on the ground under it, brighter the lower it hovers.
      const gy = this.ground(f.pos.x, f.pos.z);
      const low = THREE.MathUtils.clamp(1 - (f.pos.y - gy - HOVER) / 10, 0, 1);
      f.pool.position.set(f.pos.x, gy + 0.05, f.pos.z);
      (f.pool.material as THREE.MeshBasicMaterial).opacity = low * (0.35 + 0.25 * pulse);
      f.pool.visible = low > 0.01;
    }
  }
}
