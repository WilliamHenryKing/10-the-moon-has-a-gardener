import * as THREE from "three";
import { glow } from "./caches";

// The gardener's lander: a squat descent stage in gold foil on four splayed legs, a white crew
// cabin with a hatch and ladder, quads of attitude thrusters, and one engine whose plume burns
// through the descent and gutters out at touchdown. It stays by the pad afterwards.

const foil = new THREE.MeshStandardMaterial({ color: 0xd8a640, roughness: 0.3, metalness: 1 });
const foilDark = new THREE.MeshStandardMaterial({ color: 0x8a6a2a, roughness: 0.4, metalness: 1 });
const white = new THREE.MeshStandardMaterial({ color: 0xe8e5dd, roughness: 0.5 });
const metal = new THREE.MeshStandardMaterial({ color: 0xa9afb8, roughness: 0.35, metalness: 0.85 });
const dark = new THREE.MeshStandardMaterial({ color: 0x2c2f35, roughness: 0.5, metalness: 0.5 });
const glass = new THREE.MeshStandardMaterial({ color: 0x0c1420, roughness: 0.08, metalness: 0.6 });
const hatchLight = new THREE.MeshStandardMaterial({
  color: 0xfff0d0,
  emissive: 0xffc27a,
  emissiveIntensity: 1.2,
});

function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

function plumeTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const g = c.getContext("2d");
  if (g) {
    const v = g.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, "rgba(255,255,255,1)");
    v.addColorStop(0.25, "rgba(255,236,200,0.8)");
    v.addColorStop(1, "rgba(255,180,120,0)");
    g.fillStyle = v;
    g.fillRect(0, 0, 64, 256);
    // Narrow it toward the bell.
    g.globalCompositeOperation = "destination-in";
    const h = g.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, "rgba(0,0,0,0)");
    h.addColorStop(0.5, "rgba(0,0,0,1)");
    h.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = h;
    g.fillRect(0, 0, 64, 256);
  }
  return new THREE.CanvasTexture(c);
}

export class Lander {
  readonly root = new THREE.Group();
  /** Where the gardener climbs down, in the lander's frame. */
  readonly hatch = new THREE.Vector3(0, 0, 2.6);
  private plume: THREE.Mesh;
  private plumeMat: THREE.MeshBasicMaterial;
  private flare: THREE.Sprite;
  private time = 0;

  constructor() {
    const g = this.root;
    // Descent stage: an octagonal drum in foil, darker bays between the legs.
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 1.3, 8), foil);
    drum.position.y = 1.55;
    drum.rotation.y = Math.PI / 8;
    const bays = new THREE.Mesh(new THREE.CylinderGeometry(1.57, 1.57, 0.5, 8, 1, true), foilDark);
    bays.position.y = 1.35;
    bays.rotation.y = Math.PI / 8;
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.62, 0.08, 8), metal);
    deck.position.y = 2.24;
    deck.rotation.y = Math.PI / 8;
    // Crew cabin: faceted white, two dark windows toward the front, a lit hatch.
    const cabin = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.25, 1.25, 7), white);
    cabin.position.y = 2.9;
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.05, 0.35, 7), white);
    roof.position.y = 3.7;
    const windows = [-0.38, 0.38].map((x) => {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.06), glass);
      w.position.set(x, 3.15, 1.1);
      w.rotation.x = -0.12;
      return w;
    });
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.06), hatchLight);
    hatch.position.set(0, 2.72, 1.18);
    // Platform and ladder down the front leg.
    const porch = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.7), metal);
    porch.position.set(0, 2.24, 1.85);
    const ladder = new THREE.Group();
    ladder.add(
      rod(new THREE.Vector3(-0.25, 2.2, 2.1), new THREE.Vector3(-0.25, 0.2, 2.55), 0.02, metal),
    );
    ladder.add(
      rod(new THREE.Vector3(0.25, 2.2, 2.1), new THREE.Vector3(0.25, 0.2, 2.55), 0.02, metal),
    );
    for (let k = 1; k < 7; k++) {
      const t = k / 7;
      const y = 2.2 - t * 2;
      const z = 2.1 + t * 0.45;
      ladder.add(rod(new THREE.Vector3(-0.25, y, z), new THREE.Vector3(0.25, y, z), 0.015, metal));
    }
    // Four legs with struts and footpads.
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      const s = Math.sin(a);
      const c = Math.cos(a);
      const hip = new THREE.Vector3(s * 1.45, 1.8, c * 1.45);
      const knee = new THREE.Vector3(s * 2.35, 0.9, c * 2.35);
      const foot = new THREE.Vector3(s * 2.6, 0.06, c * 2.6);
      g.add(rod(hip, knee, 0.07, metal), rod(knee, foot, 0.05, metal));
      g.add(rod(new THREE.Vector3(s * 1.5, 1.0, c * 1.5), knee, 0.035, metal));
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.08, 16), metal);
      pad.position.copy(foot);
      g.add(pad);
      // Attitude thruster quads on the corners of the deck.
      const quad = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), dark);
      const qa = a + Math.PI / 4;
      quad.position.set(Math.sin(qa) * 1.62, 2.1, Math.cos(qa) * 1.62);
      g.add(quad);
    }
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.55, 0.6, 20, 1, true), dark);
    bell.position.y = 0.72;
    const tank = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), white);
    tank.position.set(1.8, 1.6, 0);
    tank.scale.set(0.6, 0.9, 0.6);
    g.add(drum, bays, deck, cabin, roof, ...windows, hatch, porch, ladder, bell, tank);
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    // The plume: two crossed quads, additive, pointing down from the bell.
    this.plumeMat = new THREE.MeshBasicMaterial({
      map: plumeTexture(),
      color: new THREE.Color(2.2, 1.9, 1.6),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const quad = new THREE.PlaneGeometry(1.2, 6);
    quad.translate(0, -3, 0);
    this.plume = new THREE.Mesh(quad, this.plumeMat);
    const cross = new THREE.Mesh(quad, this.plumeMat);
    cross.rotation.y = Math.PI / 2;
    this.plume.add(cross);
    this.plume.position.y = 0.42;
    this.plume.renderOrder = 5;
    // Seen from above the quads thin out; a glow at the bell carries the burn.
    this.flare = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glow(),
        color: new THREE.Color(2.4, 2.0, 1.6),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.flare.position.y = 0.2;
    g.add(this.plume, this.flare);
  }

  /** Engine thrust 0 … 1 (the plume's length and brightness). */
  update(dt: number, thrust: number) {
    this.time += dt;
    const flicker = 0.85 + 0.15 * Math.sin(this.time * 53) * Math.sin(this.time * 31);
    this.plume.visible = this.flare.visible = thrust > 0.01;
    this.flare.scale.setScalar((1.2 + 2.2 * thrust) * flicker);
    this.plume.scale.set(0.7 + 0.3 * thrust, (0.3 + 0.9 * thrust) * flicker, 1);
    this.plumeMat.opacity = Math.min(1, thrust * 1.4);
  }
}
