import * as THREE from "three";
import type { Garden } from "../game/garden";
import { PANEL_HEIGHT, PANEL_WIDTH, type Panel } from "../game/light";
import { glow } from "./caches";

// What the gardener sets down: shade panels (a woven sheet on a light frame, standing where it
// was put and throwing a real shadow), and sprinklers, whose heads turn and throw arcs of water
// that glitter in the low Sun as they fall in one-sixth gravity.

type Ground = (x: number, z: number) => number;

const sheet = new THREE.MeshStandardMaterial({
  color: 0xd8d0b8,
  roughness: 0.85,
  side: THREE.DoubleSide,
});
const frame = new THREE.MeshStandardMaterial({ color: 0xaab0b8, roughness: 0.35, metalness: 0.8 });
const dark = new THREE.MeshStandardMaterial({ color: 0x33363c, roughness: 0.55, metalness: 0.4 });
const blue = new THREE.MeshStandardMaterial({
  color: 0x8fd0ff,
  emissive: 0x2a86d8,
  emissiveIntensity: 1.2,
});

const DROPS = 64;
const GRAVITY = 1.62;

function panelModel() {
  const g = new THREE.Group();
  const w = PANEL_WIDTH;
  const h = PANEL_HEIGHT;
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(w, h - 0.2, 0.02), sheet);
  cloth.position.y = 0.2 + (h - 0.2) / 2;
  g.add(cloth);
  for (const x of [-w / 2, w / 2]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, h, 8), frame);
    post.position.set(x, h / 2, 0);
    // A splayed foot front and back.
    for (const z of [-0.45, 0.45]) {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6), frame);
      foot.position.set(x, 0.3, z / 2);
      foot.rotation.x = z > 0 ? 0.62 : -0.62;
      g.add(foot);
    }
    g.add(post);
  }
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, w, 8), frame);
  top.rotation.z = Math.PI / 2;
  top.position.y = h;
  g.add(top);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

function sprinklerModel() {
  const g = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6), frame);
    leg.position.set(Math.sin(a) * 0.12, 0.22, Math.cos(a) * 0.12);
    leg.rotation.set(Math.cos(a) * 0.45, 0, -Math.sin(a) * 0.45);
    g.add(leg);
  }
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.14, 12), dark);
  body.position.y = 0.46;
  const head = new THREE.Group();
  head.position.y = 0.56;
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), blue);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 6), frame);
    arm.rotation.z = Math.PI / 2;
    arm.position.x = s * 0.16;
    head.add(arm);
  }
  head.add(hub);
  g.add(body, head);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return { root: g, head };
}

interface Sprinkler {
  x: number;
  z: number;
  y: number;
  head: THREE.Group;
  drops: { age: number; life: number; p: THREE.Vector3; v: THREE.Vector3 }[];
}

export class KitView {
  readonly group = new THREE.Group();
  private panels = new Set<Panel>();
  private sprinklers: Sprinkler[] = [];
  private seen = 0;
  private spray: THREE.Points;
  private positions = new Float32Array(DROPS * 6 * 3);
  private time = 0;

  constructor(private ground: Ground) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geo.setDrawRange(0, 0);
    this.spray = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: glow(),
        color: new THREE.Color(1.3, 1.6, 2.0),
        size: 0.13,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.spray.frustumCulled = false;
    this.group.add(this.spray);
  }

  update(dt: number, g: Garden) {
    this.time += dt;
    for (const p of g.panels) {
      if (this.panels.has(p)) continue;
      this.panels.add(p);
      const m = panelModel();
      m.position.set(p.x, this.ground(p.x, p.z), p.z);
      m.rotation.y = p.yaw;
      this.group.add(m);
    }
    while (this.seen < g.sprinklers.length) {
      const s = g.sprinklers[this.seen++];
      if (!s) break;
      const made = sprinklerModel();
      const y = this.ground(s.x, s.z);
      made.root.position.set(s.x, y, s.z);
      this.group.add(made.root);
      this.sprinklers.push({ x: s.x, z: s.z, y, head: made.head, drops: [] });
    }
    // Spin, spray and let the drops fall.
    let n = 0;
    for (const s of this.sprinklers) {
      s.head.rotation.y += dt * 2.4;
      const spin = s.head.rotation.y;
      if (s.drops.length < DROPS && dt > 0)
        for (let k = 0; k < 2; k++) {
          const side = k === 0 ? 1 : -1;
          const a = spin + (side > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.3;
          const speed = 1.6 + Math.random() * 1.3;
          s.drops.push({
            age: 0,
            life: 1.6 + Math.random() * 0.8,
            p: new THREE.Vector3(s.x + Math.cos(a) * 0.3, s.y + 0.58, s.z - Math.sin(a) * 0.3),
            v: new THREE.Vector3(
              Math.cos(a) * speed,
              1.1 + Math.random() * 0.6,
              -Math.sin(a) * speed,
            ),
          });
        }
      for (const d of s.drops) {
        d.age += dt;
        d.v.y -= GRAVITY * dt;
        d.p.addScaledVector(d.v, dt);
        const floor = this.ground(d.p.x, d.p.z) + 0.02;
        if (d.p.y < floor) d.age = d.life;
      }
      s.drops = s.drops.filter((d) => d.age < d.life);
      for (const d of s.drops) {
        if (n >= this.positions.length / 3) break;
        this.positions.set([d.p.x, d.p.y, d.p.z], n * 3);
        n++;
      }
    }
    const attr = this.spray.geometry.getAttribute("position") as THREE.BufferAttribute;
    attr.needsUpdate = true;
    this.spray.geometry.setDrawRange(0, n);
  }
}
