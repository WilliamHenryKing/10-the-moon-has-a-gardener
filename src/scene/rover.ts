import * as THREE from "three";
import { PALETTE } from "./palette";

const mat = (color: number, roughness = 0.6, metalness = 0.2) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

/**
 * The farm rover: an open chassis on six mesh wheels, a flat bed carrying the shade
 * panels (the stack shows how many are left), a solar wing and a small crane arm.
 */
export class Rover {
  readonly group = new THREE.Group();
  private stack = new THREE.Group();
  private wheels: THREE.Mesh[] = [];

  constructor() {
    const white = mat(PALETTE.suit, 0.55);
    const metal = mat(PALETTE.metal, 0.35, 0.8);
    const accent = mat(PALETTE.accent, 0.5);
    const tyre = mat(PALETTE.rubber, 0.9);

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 2.1), metal);
    chassis.position.y = 0.42;
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 1.1), white);
    bed.position.set(0, 0.52, -0.4);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.5), white);
    cab.position.set(0, 0.63, 0.65);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.06, 0.52), accent);
    stripe.position.set(0, 0.7, 0.65);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.1), mat(PALETTE.rubber, 0.8));
    seat.position.set(0, 0.72, 0.25);
    this.group.add(chassis, bed, cab, stripe, seat);

    for (const side of [-1, 1]) {
      for (const z of [-0.75, 0, 0.75]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.18, 18), tyre);
        w.rotation.z = Math.PI / 2;
        w.position.set(side * 0.64, 0.26, z);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 10), metal);
        hub.rotation.z = Math.PI / 2;
        hub.position.copy(w.position);
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.06), metal);
        strut.position.set(side * 0.55, 0.36, z);
        this.wheels.push(w);
        this.group.add(w, hub, strut);
      }
    }

    // Solar wing on a mast, and a crane arm used to lift panels.
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), metal);
    mast.position.set(-0.35, 0.95, 0.75);
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.02, 0.5),
      mat(PALETTE.panelFilm, 0.3, 0.5),
    );
    wing.position.set(-0.35, 1.3, 0.75);
    wing.rotation.z = 0.25;
    const arm1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.06), accent);
    arm1.position.set(0.38, 0.9, -0.95);
    arm1.rotation.x = 0.3;
    const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.6), accent);
    arm2.position.set(0.38, 1.26, -0.72);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffc070, emissiveIntensity: 2 }),
    );
    lamp.position.set(0.3, 0.66, 0.92);
    const lamp2 = lamp.clone();
    lamp2.position.x = -0.3;
    this.group.add(mast, wing, arm1, arm2, lamp, lamp2, this.stack);

    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true;
    });
  }

  /** Show `count` panels stacked flat on the bed. */
  setLoad(count: number): void {
    this.stack.clear();
    const film = mat(PALETTE.panelFilm, 0.3, 0.5);
    const frame = mat(PALETTE.panelFrame, 0.35, 0.8);
    for (let i = 0; i < count; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.045, 0.7), i % 2 ? film : frame);
      p.position.set(0, 0.585 + i * 0.05, -0.4);
      p.rotation.y = (i % 3) * 0.05 - 0.05;
      p.castShadow = true;
      this.stack.add(p);
    }
  }

  update(time: number): void {
    // Idle shimmer of the wheels settling in the regolith.
    for (const [i, w] of this.wheels.entries()) w.rotation.x = Math.sin(time * 0.3 + i) * 0.02;
  }
}
