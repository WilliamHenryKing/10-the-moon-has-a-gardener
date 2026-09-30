import * as THREE from "three";
import type { Pickup, Unlock } from "../game/garden";

// What the survey left in the basin, each with a beacon you can see from across it: amber when
// it is yours to open, a slow dim red while it waits for a milestone, dark once opened. The
// crashed probe south-east of the pad, the survey marker on the Earthside slope, the ice drill in
// the bowl (working lamps over the ice), and the supply pod, which comes down on its thrusters
// when the dome is 60% full.

type Ground = (x: number, z: number) => number;

const foil = new THREE.MeshStandardMaterial({ color: 0xd9a53c, roughness: 0.32, metalness: 1 });
const white = new THREE.MeshStandardMaterial({ color: 0xe6e3da, roughness: 0.5 });
const metal = new THREE.MeshStandardMaterial({ color: 0xaab0b8, roughness: 0.35, metalness: 0.8 });
const dark = new THREE.MeshStandardMaterial({ color: 0x33363c, roughness: 0.55, metalness: 0.4 });
const cells = new THREE.MeshStandardMaterial({ color: 0x1a2744, roughness: 0.25, metalness: 0.5 });
const orange = new THREE.MeshStandardMaterial({ color: 0xe0762e, roughness: 0.5 });
const lampLit = new THREE.MeshStandardMaterial({
  color: 0xfff0d0,
  emissive: 0xffd49a,
  emissiveIntensity: 3,
});
const ice = new THREE.MeshStandardMaterial({
  color: 0xdff2ff,
  roughness: 0.12,
  metalness: 0,
  emissive: 0x1d3850,
  emissiveIntensity: 0.6,
});

let glowTexture: THREE.Texture | null = null;
/** A soft round glow for sprites and light pools. */
export function glow() {
  if (glowTexture) return glowTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  if (g) {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.18, "rgba(255,255,255,0.55)");
    r.addColorStop(0.5, "rgba(255,255,255,0.12)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  }
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}

function shadowed<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return o;
}

function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

/** The survey probe that came down hard years ago: foil body, one wing, a bent leg. */
function probe() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.75, 6), foil);
  body.position.y = 0.55;
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.06, 6), white);
  deck.position.y = 0.95;
  const wing = new THREE.Group();
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.03, 0.72), cells);
  panel.position.x = 1.3;
  const arm = rod(new THREE.Vector3(0.5, 0, 0), new THREE.Vector3(0.36 + 0.02, 0, 0), 0.03, metal);
  wing.add(panel, arm);
  wing.position.set(0.1, 0.7, 0);
  wing.rotation.set(0.25, 0, -0.35);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 8, 0, Math.PI * 2, 0, 0.9), white);
  dish.material = white.clone();
  (dish.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  dish.position.set(-0.25, 1.25, 0.1);
  dish.rotation.set(2.4, 0.3, 0.2);
  const mast = rod(
    new THREE.Vector3(-0.1, 0.95, 0),
    new THREE.Vector3(-0.25, 1.2, 0.1),
    0.03,
    metal,
  );
  const legs = [0, 1, 2].map((k) => {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    const top = new THREE.Vector3(Math.sin(a) * 0.5, 0.35, Math.cos(a) * 0.5);
    const bent = k === 1 ? 0.45 : 1;
    const foot = new THREE.Vector3(Math.sin(a) * 1.0 * bent, -0.05, Math.cos(a) * 1.0);
    const leg = rod(top, foot, 0.035, metal);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.04, 12), metal);
    pad.position.copy(foot);
    return [leg, pad];
  });
  g.add(body, deck, wing, dish, mast, ...legs.flat());
  // It hit at an angle and stayed that way, half dug in.
  g.rotation.set(0.28, 0.9, -0.18);
  return { root: g, beaconY: 1.7, obstacle: 1.3 };
}

/** A survey marker on a tripod: instrument head and a tall whip antenna. */
function marker() {
  const g = new THREE.Group();
  const head = new THREE.Vector3(0, 1.45, 0);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    g.add(rod(head, new THREE.Vector3(Math.sin(a) * 0.7, 0, Math.cos(a) * 0.7), 0.025, metal));
  }
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.32), white);
  box.position.copy(head).add(new THREE.Vector3(0, 0.1, 0));
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.06, 0.33), orange);
  stripe.position.copy(box.position);
  const whip = rod(new THREE.Vector3(0.12, 1.6, 0), new THREE.Vector3(0.12, 2.9, 0), 0.012, metal);
  g.add(box, stripe, whip);
  return { root: g, beaconY: 2.95, obstacle: 0.8 };
}

/** The ice drill over the bowl's frozen floor, its work lamps the only light down there. */
function drill() {
  const g = new THREE.Group();
  const h = 4.2;
  const feet = [0, 1, 2].map((k) => {
    const a = (k / 3) * Math.PI * 2 + 0.3;
    return new THREE.Vector3(Math.sin(a) * 1.5, 0, Math.cos(a) * 1.5);
  });
  const top = new THREE.Vector3(0, h, 0);
  for (const f of feet) {
    g.add(rod(f, top, 0.06, metal));
    // Cross bracing.
    g.add(
      rod(
        f.clone().lerp(top, 0.3),
        feet[(feet.indexOf(f) + 1) % 3]?.clone().lerp(top, 0.3) ?? f,
        0.025,
        metal,
      ),
    );
  }
  const column = rod(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, h - 0.2, 0), 0.12, dark);
  const motor = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), white);
  motor.position.y = h - 0.1;
  const hut = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.0), white);
  hut.position.set(2.2, 0.45, 0.6);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.41, 0.12, 1.01), orange);
  stripe.position.set(2.2, 0.7, 0.6);
  const lamps = [
    [0.9, h - 0.6, 0.9],
    [-1.0, h - 0.8, 0.2],
  ].map(([x, y, z]) => {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.2), lampLit);
    l.position.set(x as number, y as number, z as number);
    l.lookAt(0, 0, 0);
    return l;
  });
  // The ice itself: a glittering crust around the bore.
  const crust = new THREE.Mesh(new THREE.CircleGeometry(3.6, 40), ice);
  crust.rotation.x = -Math.PI / 2;
  crust.position.y = 0.04;
  crust.receiveShadow = true;
  const shards = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), ice, 26);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < 26; i++) {
    const a = i * 2.39996;
    const r = 1.2 + ((i * 0.37) % 1) * 2.2;
    const s = 0.1 + ((i * 0.61) % 1) * 0.22;
    q.setFromEuler(new THREE.Euler(i * 0.7, i * 1.3, i * 0.4));
    m.compose(
      new THREE.Vector3(Math.sin(a) * r, s * 0.4, Math.cos(a) * r),
      q,
      new THREE.Vector3(s, s * 1.8, s),
    );
    shards.setMatrixAt(i, m);
  }
  // Lamplight pooled on the ice.
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(5, 32),
    new THREE.MeshBasicMaterial({
      map: glow(),
      color: 0xffc98a,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.08;
  g.add(column, motor, hut, stripe, ...lamps, shards, crust, pool);
  return { root: g, beaconY: h + 0.5, obstacle: 1.8 };
}

/** The supply pod: a squat capsule on landing legs, thrusters underneath. */
function pod() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.85, 1.1, 6, 20), white);
  body.position.y = 1.55;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.87, 0.87, 0.25, 20), orange);
  band.position.y = 1.35;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const hip = new THREE.Vector3(Math.sin(a) * 0.7, 1.0, Math.cos(a) * 0.7);
    const foot = new THREE.Vector3(Math.sin(a) * 1.35, 0, Math.cos(a) * 1.35);
    g.add(rod(hip, foot, 0.05, metal));
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.05, 12), metal);
    pad.position.copy(foot);
    g.add(pad);
  }
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 0.35, 16, 1, true), dark);
  nozzle.position.y = 0.5;
  g.add(body, band, nozzle);
  return { root: g, beaconY: 3.1, obstacle: 1.5 };
}

const BUILDERS: Record<string, () => { root: THREE.Group; beaconY: number; obstacle: number }> = {
  probe,
  earthside: marker,
  icedrill: drill,
  supply: pod,
};

interface Item {
  pickup: Pickup;
  root: THREE.Group;
  beacon: THREE.Sprite;
  ground: number;
  obstacle: number;
}

const AMBER = new THREE.Color(1.0, 0.62, 0.22);
const LOCKED = new THREE.Color(0.9, 0.12, 0.08);

export class Caches {
  readonly group = new THREE.Group();
  private items: Item[] = [];
  private time = 0;
  private flame: THREE.Sprite;
  /** Seconds since the supply pod started down (−1: not yet). */
  private descent = -1;
  /** Called once when the pod touches down (for the dust). */
  onTouchdown: ((x: number, y: number, z: number) => void) | null = null;

  constructor(ground: Ground, pickups: readonly Pickup[]) {
    for (const p of pickups) {
      const build = BUILDERS[p.id];
      if (!build) continue;
      const made = build();
      const y = ground(p.x, p.z);
      made.root.position.set(p.x, y - (p.id === "probe" ? 0.25 : 0), p.z);
      shadowed(made.root);
      const beacon = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glow(),
          color: AMBER.clone(),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      beacon.position.set(0, made.beaconY, 0);
      beacon.scale.setScalar(1.6);
      made.root.add(beacon);
      this.group.add(made.root);
      this.items.push({ pickup: p, root: made.root, beacon, ground: y, obstacle: made.obstacle });
      if (p.id === "supply") made.root.visible = false;
    }
    this.flame = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glow(),
        color: new THREE.Color(2.4, 1.6, 1.0),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.flame.scale.set(1.6, 3.2, 1);
    this.flame.visible = false;
    this.group.add(this.flame);
  }

  /** Circles the gardener cannot walk through (the pod only once it is down). */
  get obstacles() {
    return this.items
      .filter((i) => i.root.visible && !(i.pickup.id === "supply" && this.descent < 7))
      .map((i) => ({ x: i.pickup.x, z: i.pickup.z, r: i.obstacle }));
  }

  update(dt: number, unlocked: ReadonlySet<Unlock>) {
    this.time += dt;
    for (const it of this.items) {
      const p = it.pickup;
      const mat = it.beacon.material as THREE.SpriteMaterial;
      if (p.taken) {
        it.beacon.visible = false;
        continue;
      }
      const open = !p.needs || unlocked.has(p.needs);
      const pulse = open
        ? 0.55 + 0.45 * Math.sin(this.time * 3.2 + p.x) ** 2
        : 0.25 + 0.2 * Math.sin(this.time * 1.1 + p.z) ** 2;
      mat.color.copy(open ? AMBER : LOCKED).multiplyScalar(pulse * (open ? 2.4 : 1.2));
      it.beacon.scale.setScalar(open ? 1.2 + pulse * 0.8 : 1.1);
      if (p.id === "supply") this.updatePod(it, dt, open);
    }
  }

  private updatePod(it: Item, dt: number, open: boolean) {
    if (!open) return;
    if (this.descent < 0) {
      this.descent = 0;
      it.root.visible = true;
    }
    if (this.descent >= 7) {
      this.flame.visible = false;
      return;
    }
    this.descent = Math.min(7, this.descent + dt);
    // Falls fast, burns hard, settles the last metres slowly.
    const t = this.descent / 7;
    const height = 140 * (1 - t) ** 3;
    it.root.position.y = it.ground + height;
    this.flame.visible = height > 0.05;
    this.flame.position.set(it.pickup.x, it.ground + height + 0.1, it.pickup.z);
    const burn = 0.6 + 0.4 * Math.sin(this.time * 40) ** 2;
    this.flame.scale.set(1.4 * burn, (2.2 + 3 * (1 - t)) * burn, 1);
    if (this.descent >= 7) {
      it.root.position.y = it.ground;
      this.onTouchdown?.(it.pickup.x, it.ground, it.pickup.z);
    }
  }
}
