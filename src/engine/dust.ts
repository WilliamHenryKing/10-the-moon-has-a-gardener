import * as THREE from "three";
import { GRAVITY } from "../game/player";

// Kicked-up regolith. With no air, dust neither billows nor hangs: every grain flies a clean
// ballistic arc under one-sixth gravity and drops straight back, the look of the Apollo films.

const MAX = 900;

export class Dust {
  readonly points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private next = 0;
  private attr: THREE.BufferAttribute;
  private age: THREE.BufferAttribute;

  constructor(private ground: (x: number, z: number) => number) {
    const g = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    this.age = new THREE.BufferAttribute(this.life, 1);
    this.age.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("position", this.attr);
    g.setAttribute("life", this.age);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uPixel: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float life;
        uniform float uPixel;
        varying float vLife;
        void main() {
          vLife = life;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = life > 0.0 ? uPixel * 3.2 / max(0.5, -mv.z) * 6.0 : 0.0;
        }`,
      fragmentShader: /* glsl */ `
        varying float vLife;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = (1.0 - smoothstep(0.2, 1.0, d)) * clamp(vLife * 2.0, 0.0, 1.0) * 0.55;
          gl_FragColor = vec4(vec3(0.42, 0.41, 0.39) * 0.6, a);
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
  }

  /** A puff where a boot lands, scaled by how hard. */
  kick(at: THREE.Vector3, strength: number, forward = { x: 0, z: 0 }) {
    const n = Math.round(10 + strength * 30);
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const a = Math.random() * Math.PI * 2;
      const s = (0.25 + Math.random() * 0.9) * (0.6 + strength);
      this.pos.set([at.x + Math.cos(a) * 0.08, at.y + 0.03, at.z + Math.sin(a) * 0.08], i * 3);
      this.vel.set(
        [
          Math.cos(a) * s + forward.x * 0.6,
          0.35 + Math.random() * 1.1 * (0.5 + strength),
          Math.sin(a) * s + forward.z * 0.6,
        ],
        i * 3,
      );
      this.life[i] = 1.6 + Math.random();
    }
  }

  update(dt: number, pixelRatio: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uPixel!.value = pixelRatio;
    if (dt <= 0) return;
    for (let i = 0; i < MAX; i++) {
      let life = this.life[i] as number;
      if (life <= 0) continue;
      const j = i * 3;
      this.vel[j + 1] = (this.vel[j + 1] as number) - GRAVITY * dt;
      const x = (this.pos[j] as number) + (this.vel[j] as number) * dt;
      const y = (this.pos[j + 1] as number) + (this.vel[j + 1] as number) * dt;
      const z = (this.pos[j + 2] as number) + (this.vel[j + 2] as number) * dt;
      this.pos[j] = x;
      this.pos[j + 1] = y;
      this.pos[j + 2] = z;
      life -= dt;
      if (y < this.ground(x, z)) life = 0;
      this.life[i] = life;
    }
    this.attr.needsUpdate = true;
    this.age.needsUpdate = true;
  }
}
