import * as THREE from "three";
import { PALETTE } from "./palette";
import { groundHeight } from "./terrain";

const std = (color: number, roughness = 0.6, metalness = 0.1) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

function shadowed<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return o;
}

/** Inflatable greenhouse dome with ribs and a lit doorway: the gardener's home. */
function habitat(): THREE.Group {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.75 }),
  );
  g.add(shell);
  const rib = std(PALETTE.metal, 0.4, 0.6);
  for (let i = 0; i < 6; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(3.22, 0.05, 6, 40, Math.PI), rib);
    r.rotation.y = (i / 6) * Math.PI;
    g.add(r);
  }
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1.5, 0.8),
    new THREE.MeshStandardMaterial({ color: 0xffd79a, emissive: 0xffb45a, emissiveIntensity: 1.4 }),
  );
  door.position.set(0, 0.75, 3);
  g.add(door);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 0.9), std(PALETTE.suitSoft));
  frame.position.set(0, 0.9, 2.9);
  g.add(frame);
  door.position.z = 3.36;
  return shadowed(g);
}

function waterTank(): THREE.Group {
  const g = new THREE.Group();
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 20), std(0xdad6cc, 0.4));
  tank.position.y = 0.8;
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.52, 0.52, 0.12, 20),
    std(PALETTE.accent),
  );
  band.position.y = 0.95;
  const legs = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.45, 0.25, 6),
    std(PALETTE.metal, 0.4, 0.7),
  );
  legs.position.y = 0.12;
  g.add(tank, band, legs);
  return shadowed(g);
}

/** Tall mast with a warm grow lamp: a cosy light source when the Sun is behind the ridge. */
function lampMast(): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.06, 2.6, 8),
    std(PALETTE.metal, 0.4, 0.7),
  );
  pole.position.y = 1.3;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.08, 0.2),
    new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffc070, emissiveIntensity: 2 }),
  );
  head.position.set(0.2, 2.6, 0);
  g.add(pole, head);
  const glow = new THREE.PointLight(0xffc27a, 3, 7, 1.6);
  glow.position.set(0.2, 2.4, 0);
  g.add(glow);
  return shadowed(g);
}

function crate(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.4), std(0x9c8c6c, 0.8));
  m.castShadow = m.receiveShadow = true;
  return m;
}

function place(o: THREE.Object3D, x: number, z: number, ry = 0): THREE.Object3D {
  o.position.set(x, groundHeight(x, z), z);
  o.rotation.y = ry;
  return o;
}

/** Set dressing around the bed. `half` is half the bed width so props clear it. */
export function createEquipment(): THREE.Group {
  const g = new THREE.Group();
  g.add(place(habitat(), 7.5, -9, -0.5));
  g.add(place(waterTank(), 5.1, -3.4));
  g.add(place(lampMast(), -4.8, -3.8));
  const c1 = place(crate(), 5.2, 3.2, 0.3);
  c1.position.y += 0.2;
  const c2 = place(crate(), 5.6, 2.6, -0.2);
  c2.position.y += 0.2;
  const c3 = place(crate(), 5.35, 2.9, 0.1);
  c3.position.y += 0.6;
  g.add(c1, c2, c3);
  return g;
}
