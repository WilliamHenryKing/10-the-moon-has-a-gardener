import * as THREE from "three";
import { glow } from "./caches";
import { plumeTexture } from "./lander";

// The colony ship Perennial: a tall white lander with a ring of lit windows and its name round
// the hull, four engines and four great legs. It comes down on the landing ring at the end, lowers
// its ramp, and its twelve colonists walk in single file to the dome's airlock.

const white = new THREE.MeshStandardMaterial({ color: 0xebe8e0, roughness: 0.45 });
const grey = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.4, metalness: 0.7 });
const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.5, metalness: 0.5 });
const foil = new THREE.MeshStandardMaterial({ color: 0xd6a33c, roughness: 0.3, metalness: 1 });
const windowLit = new THREE.MeshStandardMaterial({
  color: 0xfff0d8,
  emissive: 0xffc98a,
  emissiveIntensity: 1.6,
});

function nameBand() {
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = 128;
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = "#e9e5dc";
    g.fillRect(0, 0, 2048, 128);
    g.fillStyle = "#c2562a";
    g.fillRect(0, 10, 2048, 8);
    g.fillRect(0, 110, 2048, 8);
    g.fillStyle = "#23262c";
    g.font = "600 64px ui-sans-serif, system-ui, sans-serif";
    g.textBaseline = "middle";
    for (const x of [140, 1164]) g.fillText("P E R E N N I A L", x, 66);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.45 });
}

function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 10), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

/** Colonists' walking pace, m/s (brisk: they have waited months for this). */
const WALK = 1.5;

/** A colonist in a white suit: enough to read at a distance, walking. */
function colonist() {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: 0xe6e2d8, roughness: 0.7 });
  const visor = new THREE.MeshStandardMaterial({ color: 0xc89a3a, roughness: 0.15, metalness: 1 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.55, 4, 12), suit);
  body.position.y = 1.05;
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.45, 0.18), suit);
  pack.position.set(0, 1.18, 0.22);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), suit);
  helmet.position.y = 1.62;
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(
      0.162,
      16,
      12,
      Math.PI * 1.25,
      Math.PI * 0.5,
      Math.PI * 0.3,
      Math.PI * 0.4,
    ),
    visor,
  );
  face.position.y = 1.62;
  const legs = [-0.1, 0.1].map((x) => {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.5, 4, 8), suit);
    leg.geometry.translate(0, -0.3, 0);
    leg.position.set(x, 0.72, 0);
    return leg;
  });
  g.add(body, pack, helmet, face, ...legs);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return { root: g, legs };
}

interface Walker {
  root: THREE.Group;
  legs: THREE.Mesh[];
  delay: number;
}

export class Perennial {
  readonly root = new THREE.Group();
  private plumes: THREE.Mesh[] = [];
  private flares: THREE.Sprite[] = [];
  private plumeMat: THREE.MeshBasicMaterial;
  private ramp: THREE.Group;
  private rampDown = 0;
  private walkers: Walker[] = [];
  private time = 0;
  /** Seconds since the colonists set off (−1: not yet). */
  private walking = -1;

  constructor(
    private ground: (x: number, z: number) => number,
    /** Where the colonists walk to (the airlock door). */
    private door: THREE.Vector3,
  ) {
    const g = this.root;
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.3, 8, 40), white);
    hull.position.y = 7.2;
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(3.12, 3.12, 0.9, 40, 1, true),
      nameBand(),
    );
    band.position.y = 8.6;
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 3.1, 3.2, 40), white);
    nose.position.y = 12.8;
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      grey,
    );
    cap.position.y = 14.4;
    // A ring of lit windows over the name.
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.08), windowLit);
      w.position.set(Math.sin(a) * 3.13, 10.1, Math.cos(a) * 3.13);
      w.rotation.y = a;
      g.add(w);
    }
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.6, 2.2, 40), foil);
    skirt.position.y = 2.6;
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.2, 40), grey);
    deck.position.y = 3.2;
    g.add(hull, band, nose, cap, skirt, deck);
    // Four legs and four engines.
    this.plumeMat = new THREE.MeshBasicMaterial({
      map: plumeTexture(),
      color: new THREE.Color(2.2, 1.9, 1.6),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const s = Math.sin(a);
      const c = Math.cos(a);
      const hip = new THREE.Vector3(s * 3.0, 3.4, c * 3.0);
      const foot = new THREE.Vector3(s * 5.4, 0.1, c * 5.4);
      g.add(rod(hip, foot, 0.2, grey));
      g.add(rod(new THREE.Vector3(s * 3.2, 1.8, c * 3.2), foot.clone().lerp(hip, 0.35), 0.1, grey));
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.16, 20), grey);
      pad.position.copy(foot);
      g.add(pad);
      const ea = a + Math.PI / 4;
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.8, 1.2, 20, 1, true), dark);
      bell.position.set(Math.sin(ea) * 1.5, 1.1, Math.cos(ea) * 1.5);
      g.add(bell);
      const quad = new THREE.PlaneGeometry(2.2, 14);
      quad.translate(0, -7, 0);
      const plume = new THREE.Mesh(quad, this.plumeMat);
      const cross = new THREE.Mesh(quad, this.plumeMat);
      cross.rotation.y = Math.PI / 2;
      plume.add(cross);
      plume.position.set(bell.position.x, 0.6, bell.position.z);
      plume.renderOrder = 5;
      const flare = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glow(),
          color: new THREE.Color(2.4, 2.0, 1.6),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      flare.position.copy(plume.position);
      this.plumes.push(plume);
      this.flares.push(flare);
      g.add(plume, flare);
    }
    // The ramp, hinged at the deck on the side facing the dome; lowered on landing.
    this.ramp = new THREE.Group();
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 4.2), grey);
    plank.position.set(0, 0, 2.1);
    this.ramp.add(plank);
    this.ramp.position.set(0, 3.2, 3.3);
    g.add(this.ramp);
    g.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material !== this.plumeMat) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    for (let i = 0; i < 12; i++) {
      const c = colonist();
      c.root.visible = false;
      this.walkers.push({ root: c.root, legs: c.legs, delay: i * 0.65 });
    }
    this.root.visible = false;
  }

  /** The colonists, to add to the scene beside the ship. */
  get people() {
    return this.walkers.map((w) => w.root);
  }

  /** Place the ship `height` metres above its spot (0 = landed), turned to face the dome. */
  pose(at: THREE.Vector3, height: number, thrust: number, dt: number) {
    this.time += dt;
    this.root.visible = true;
    this.root.position.set(at.x, at.y + height, at.z);
    this.root.rotation.y = Math.atan2(this.door.x - at.x, this.door.z - at.z);
    const flicker = 0.85 + 0.15 * Math.sin(this.time * 47) * Math.sin(this.time * 29);
    for (const p of this.plumes) {
      p.visible = thrust > 0.01;
      p.scale.set(0.8 + 0.2 * thrust, (0.3 + 0.9 * thrust) * flicker, 1);
    }
    for (const f of this.flares) {
      f.visible = thrust > 0.01;
      f.scale.setScalar((2 + 4 * thrust) * flicker);
    }
    this.plumeMat.opacity = Math.min(1, thrust * 1.4);
    // The ramp comes down once the ship is down.
    this.rampDown = height < 0.05 ? Math.min(1, this.rampDown + dt / 3) : 0;
    this.ramp.rotation.x = this.rampDown * 0.62;
  }

  /** Start the colonists walking to the dome. */
  disembark() {
    if (this.walking < 0) this.walking = 0;
  }

  /** Seconds until the last colonist is through the airlock (0 once they all are). */
  get stillWalking() {
    if (this.walking < 0) return Infinity;
    const last = this.walkers[this.walkers.length - 1];
    const end = (last?.delay ?? 0) + this.pathLength() / WALK;
    return Math.max(0, end - this.walking);
  }

  private start() {
    const base = this.root.position;
    const yaw = this.root.rotation.y;
    return new THREE.Vector3(base.x + Math.sin(yaw) * 8.2, 0, base.z + Math.cos(yaw) * 8.2);
  }

  private pathLength() {
    const s = this.start();
    return Math.hypot(this.door.x - s.x, this.door.z - s.z);
  }

  update(dt: number) {
    if (this.walking < 0) return;
    this.walking += dt;
    // From the foot of the ramp to the airlock, in single file.
    const start = this.start();
    const end = this.door;
    const length = this.pathLength();
    const heading = Math.atan2(end.x - start.x, end.z - start.z);
    for (const w of this.walkers) {
      const t = this.walking - w.delay;
      const d = t * WALK;
      if (t < 0 || d > length) {
        w.root.visible = false;
        continue;
      }
      w.root.visible = true;
      const k = d / length;
      const x = start.x + (end.x - start.x) * k;
      const z = start.z + (end.z - start.z) * k;
      const stride = Math.sin(t * 6.2);
      w.root.position.set(x, this.ground(x, z) + Math.abs(stride) * 0.05, z);
      // The figures face +Z at rest; turn them down the path.
      w.root.rotation.y = heading + Math.PI;
      const [l, r] = w.legs;
      if (l && r) {
        l.rotation.x = stride * 0.45;
        r.rotation.x = -stride * 0.45;
      }
    }
  }
}
