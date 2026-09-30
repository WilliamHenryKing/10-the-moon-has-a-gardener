import * as THREE from "three";
import type { RoverBody } from "../game/rover";

// The farm rover: an open frame on six wire-mesh wheels, each riding the ground on its own
// suspension; a seat and a small lit dash up front, a bed of planter crates behind, a solar wing
// and a dish on a mast, and two headlamps.

type Ground = (x: number, z: number) => number;

const white = new THREE.MeshStandardMaterial({ color: 0xe6e3da, roughness: 0.5 });
const frame = new THREE.MeshStandardMaterial({ color: 0xa4aab2, roughness: 0.35, metalness: 0.8 });
const dark = new THREE.MeshStandardMaterial({ color: 0x2f3237, roughness: 0.6, metalness: 0.3 });
const mesh = new THREE.MeshStandardMaterial({ color: 0x8c9098, roughness: 0.4, metalness: 0.9 });
const cells = new THREE.MeshStandardMaterial({ color: 0x1a2744, roughness: 0.25, metalness: 0.5 });
const orange = new THREE.MeshStandardMaterial({ color: 0xe0762e, roughness: 0.5 });
const seatMat = new THREE.MeshStandardMaterial({ color: 0x3b3f46, roughness: 0.85 });
const lamp = new THREE.MeshStandardMaterial({
  color: 0xfff4dc,
  emissive: 0xffe0b0,
  emissiveIntensity: 2.2,
});
const screen = new THREE.MeshStandardMaterial({
  color: 0x0a1a18,
  emissive: 0x3fd6b0,
  emissiveIntensity: 1.2,
});
const sprout = new THREE.MeshStandardMaterial({
  color: 0x6fcf86,
  roughness: 0.6,
  emissive: 0x0d2a16,
});

const WHEELS: [number, number][] = [
  [-1.05, -1.25],
  [1.05, -1.25],
  [-1.05, 0],
  [1.05, 0],
  [-1.05, 1.25],
  [1.05, 1.25],
];
const RADIUS = 0.42;

function bar(a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), frame);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

function wheel() {
  const g = new THREE.Group();
  const tread = new THREE.Mesh(new THREE.CylinderGeometry(RADIUS, RADIUS, 0.26, 24, 1, true), mesh);
  tread.material = mesh.clone();
  (tread.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 12), dark);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, RADIUS * 2 - 0.04), dark);
    spoke.rotation.y = a;
    g.add(spoke);
  }
  g.add(tread, hub);
  g.rotation.z = Math.PI / 2;
  const spin = new THREE.Group();
  spin.add(g);
  return spin;
}

export class FarmRover {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private wheels: THREE.Group[] = [];
  private spin = 0;
  /** The seat, in the rover's frame (where the gardener sits). */
  readonly seat = new THREE.Vector3(-0.35, 1.02, -0.35);

  constructor(private ground: Ground) {
    const b = this.body;
    // Frame: two side rails, cross members, a deck.
    for (const x of [-0.8, 0.8])
      b.add(bar(new THREE.Vector3(x, 0.62, -1.7), new THREE.Vector3(x, 0.62, 1.7), 0.05));
    for (const z of [-1.6, -0.6, 0.6, 1.6])
      b.add(bar(new THREE.Vector3(-0.8, 0.62, z), new THREE.Vector3(0.8, 0.62, z), 0.04));
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 3.3), dark);
    deck.position.y = 0.66;
    // Seats and the dash.
    for (const x of [-0.35, 0.35]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.5), seatMat);
      seat.position.set(x, 0.86, -0.35);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.08), seatMat);
      back.position.set(x, 1.12, -0.08);
      back.rotation.x = -0.15;
      b.add(seat, back);
    }
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.3), white);
    dash.position.set(0, 1.0, -1.3);
    dash.rotation.x = 0.3;
    const display = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.2), screen);
    display.position.set(-0.3, 1.1, -1.14);
    display.rotation.x = -0.35;
    const stick = bar(
      new THREE.Vector3(-0.35, 0.9, -0.9),
      new THREE.Vector3(-0.35, 1.15, -0.95),
      0.025,
    );
    const fender = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.5), orange);
    fender.position.set(0, 0.95, -1.7);
    // Bed of planter crates, seedlings showing.
    for (const [x, z] of [
      [-0.45, 0.8],
      [0.45, 0.8],
      [-0.45, 1.4],
      [0.45, 1.4],
    ] as const) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 0.5), white);
      crate.position.set(x, 0.83, z);
      b.add(crate);
      for (let k = 0; k < 3; k++) {
        const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), sprout);
        s.position.set(x - 0.2 + k * 0.2, 1.0, z);
        s.scale.set(1, 1.4, 1);
        b.add(s);
      }
    }
    // Solar wing on a mast at the back, dish beside it.
    const mast = bar(new THREE.Vector3(0.6, 0.66, 1.65), new THREE.Vector3(0.6, 2.0, 1.65), 0.035);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.03, 0.9), cells);
    wing.position.set(0.6, 2.05, 1.65);
    wing.rotation.x = -0.5;
    const dishMast = bar(
      new THREE.Vector3(-0.7, 0.66, 1.55),
      new THREE.Vector3(-0.7, 1.7, 1.55),
      0.025,
    );
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 16, 6, 0, Math.PI * 2, 0, 0.9),
      white,
    );
    dish.material = white.clone();
    (dish.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    dish.position.set(-0.7, 1.75, 1.55);
    dish.rotation.x = -2.2;
    for (const x of [-0.6, 0.6]) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 16), lamp);
      l.rotation.x = Math.PI / 2;
      l.position.set(x, 0.92, -1.96);
      b.add(l);
    }
    b.add(deck, dash, display, stick, fender, mast, wing, dishMast, dish);
    this.root.add(b);
    for (const [x, z] of WHEELS) {
      const w = wheel();
      w.position.set(x, RADIUS, z);
      this.wheels.push(w);
      this.root.add(w);
      // A strut from the frame down to each hub.
      b.add(
        bar(
          new THREE.Vector3(x * 0.78, 0.62, z),
          new THREE.Vector3(x * 0.95, RADIUS + 0.05, z),
          0.03,
        ),
      );
    }
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  /** Pose on the ground: body pitched and rolled to the wheels, each wheel on its own spring. */
  update(r: RoverBody, dt: number) {
    const y0 = this.ground(r.x, r.z);
    this.root.position.set(r.x, y0, r.z);
    this.root.rotation.set(0, r.yaw, 0);
    const c = Math.cos(r.yaw);
    const s = Math.sin(r.yaw);
    const heights = WHEELS.map(([x, z]) => {
      // The wheel's world position: local (x, z) turned by yaw.
      const wx = r.x + x * c + z * s;
      const wz = r.z - x * s + z * c;
      return this.ground(wx, wz) - y0;
    });
    const front = ((heights[0] as number) + (heights[1] as number)) / 2;
    const back = ((heights[4] as number) + (heights[5] as number)) / 2;
    const left = ((heights[0] as number) + (heights[2] as number) + (heights[4] as number)) / 3;
    const right = ((heights[1] as number) + (heights[3] as number) + (heights[5] as number)) / 3;
    const mid = heights.reduce((a, b) => a + b, 0) / heights.length;
    this.body.position.y = mid;
    // Nose up when the front wheels ride higher; the right side up when they do.
    this.body.rotation.set(Math.atan2(front - back, 2.5), 0, Math.atan2(right - left, 2.1));
    this.spin += (r.speed / RADIUS) * dt;
    this.wheels.forEach((w, i) => {
      w.position.y = RADIUS + (heights[i] as number);
      // Front wheels steer.
      w.rotation.set(-this.spin, i < 2 ? r.steer : 0, 0);
    });
  }

  /** The seat in world space. */
  seatAt(out = new THREE.Vector3()) {
    return this.body.localToWorld(out.copy(this.seat));
  }
}
