import * as THREE from "three";
import { PALETTE } from "./palette";

let seed = 11;
export function rnd(): number {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
}

const CRATERS: [number, number, number][] = [
  [-9, -7, 3.2],
  [11, -12, 4.5],
  [-15, 6, 2.6],
  [7, 9, 2.2],
  [-4, -18, 5.5],
  [18, 3, 3],
  [-22, -14, 6],
];

/** Height of the regolith at (x, z): gentle swells plus bowl craters, flat around the farm. */
export function groundHeight(x: number, z: number): number {
  let h = Math.sin(x * 0.13) * Math.cos(z * 0.11) * 0.5 + Math.sin(x * 0.37 + z * 0.29) * 0.12;
  for (const [cx, cz, r] of CRATERS) {
    const d = Math.hypot(x - cx, z - cz) / r;
    if (d < 1) h -= (1 - d * d) * r * 0.22;
    else if (d < 1.5) h += Math.sin(((d - 1) / 0.5) * Math.PI) * r * 0.07;
  }
  const farm = Math.hypot(x * 0.8, z) / 7.5;
  const flat = Math.min(1, Math.max(0, farm - 0.6) / 0.6);
  return h * flat - 0.02;
}

function ground(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(160, 160, 200, 200);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const light = new THREE.Color(PALETTE.regolith);
  const dark = new THREE.Color(PALETTE.regolithDark);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = groundHeight(x, z);
    pos.setY(i, y);
    const n = Math.sin(x * 1.7 + z * 0.4) * Math.sin(z * 2.1 - x * 0.3) * 0.5 + 0.5;
    c.copy(dark).lerp(light, 0.55 + n * 0.3 + Math.max(-0.4, y * 0.15));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
  );
  mesh.receiveShadow = true;
  return mesh;
}

export function boulderGeometry(r: number, detail = 1): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(r, detail);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const k = rnd() * 10;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
    const s = 1 + Math.sin(v.x * 5 + k) * 0.12 + Math.cos(v.z * 4 - k) * 0.1 + (rnd() - 0.5) * 0.08;
    v.multiplyScalar(s);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function scatterBoulders(group: THREE.Group): void {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x6b6660,
    roughness: 0.95,
    flatShading: true,
  });
  const geo = boulderGeometry(1, 1);
  const n = 90;
  const inst = new THREE.InstancedMesh(geo, mat, n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let placed = 0;
  while (placed < n) {
    const a = rnd() * Math.PI * 2;
    const d = 9 + rnd() ** 1.5 * 55;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const s = 0.15 + rnd() ** 3 * (d > 20 ? 2.2 : 0.8);
    q.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3));
    m.compose(
      new THREE.Vector3(x, groundHeight(x, z) + s * 0.25, z),
      q,
      new THREE.Vector3(s, s * 0.7, s),
    );
    inst.setMatrixAt(placed++, m);
  }
  inst.castShadow = true;
  inst.receiveShadow = true;
  group.add(inst);
}

/** A far ring of crater-rim ridges that catch the low Sun. */
function ridges(group: THREE.Group): void {
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a847c, roughness: 1, flatShading: true });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rnd() * 0.2;
    const d = 95 + rnd() * 25;
    const geo = new THREE.ConeGeometry(12 + rnd() * 16, 5 + rnd() * 12, 7, 1);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(Math.cos(a) * d, -1, Math.sin(a) * d);
    mesh.rotation.y = rnd() * 3;
    mesh.scale.z = 0.6;
    group.add(mesh);
  }
}

export function createTerrain(): THREE.Group {
  const group = new THREE.Group();
  group.add(ground());
  scatterBoulders(group);
  ridges(group);
  return group;
}
