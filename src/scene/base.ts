import * as THREE from "three";
import { WATER_POINTS } from "../game/session";

// The gardener's base on the basin floor, beside the pad: the greenhouse dome the garden is
// filling with air (a mist inside rises with the oxygen, and its beds green over), the water
// tank with its pipe to the dome, and the ring of lights where the Perennial will land.
// Primitives with physically based materials: white panels, gold foil, anodised struts, glass.

export const DOME = { x: -5, z: -6, r: 5.6 };
export const LANDING = { x: 12, z: 14, r: 6.5 };
const TANK = WATER_POINTS[0];

type Ground = (x: number, z: number) => number;

const white = new THREE.MeshStandardMaterial({ color: 0xe9e6de, roughness: 0.55, metalness: 0 });
const strut = new THREE.MeshStandardMaterial({ color: 0xb9bec6, roughness: 0.35, metalness: 0.8 });
const dark = new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.6, metalness: 0.4 });
const sandbag = new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 0.95, metalness: 0 });
const water = new THREE.MeshStandardMaterial({
  color: 0x9fd6ff,
  emissive: 0x3aa6ff,
  emissiveIntensity: 2.2,
  roughness: 0.3,
});
const warm = new THREE.MeshStandardMaterial({
  color: 0xffe2b0,
  emissive: 0xffb45a,
  emissiveIntensity: 0.9,
  roughness: 0.5,
});

function shadowed<T extends THREE.Object3D>(o: T, receive = true): T {
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      c.castShadow = true;
      c.receiveShadow = receive;
    }
  });
  return o;
}

/** A dome of triangles: rings of `segs` vertices, every other ring turned half a step. */
function domeFrame(radius: number, rings: number, segs: number) {
  const rows: THREE.Vector3[][] = [];
  for (let k = 0; k < rings; k++) {
    const el = (k / rings) * (Math.PI / 2);
    const row: THREE.Vector3[] = [];
    for (let i = 0; i < segs; i++) {
      const az = ((i + (k % 2) * 0.5) / segs) * Math.PI * 2;
      row.push(
        new THREE.Vector3(
          Math.cos(el) * Math.sin(az) * radius,
          Math.sin(el) * radius,
          Math.cos(el) * Math.cos(az) * radius,
        ),
      );
    }
    rows.push(row);
  }
  const top = new THREE.Vector3(0, radius, 0);
  const tris: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [];
  for (let k = 0; k < rings - 1; k++) {
    const a = rows[k] as THREE.Vector3[];
    const b = rows[k + 1] as THREE.Vector3[];
    for (let i = 0; i < segs; i++) {
      const i1 = (i + 1) % segs;
      if (k % 2 === 0) {
        // b[i] sits between a[i] and a[i+1].
        tris.push([a[i] as THREE.Vector3, a[i1] as THREE.Vector3, b[i] as THREE.Vector3]);
        tris.push([b[i] as THREE.Vector3, a[i1] as THREE.Vector3, b[i1] as THREE.Vector3]);
      } else {
        // a[i] sits between b[i] and b[i+1].
        tris.push([b[i] as THREE.Vector3, a[i] as THREE.Vector3, b[i1] as THREE.Vector3]);
        tris.push([a[i] as THREE.Vector3, a[i1] as THREE.Vector3, b[i1] as THREE.Vector3]);
      }
    }
  }
  const last = rows[rings - 1] as THREE.Vector3[];
  for (let i = 0; i < segs; i++)
    tris.push([last[i] as THREE.Vector3, last[(i + 1) % segs] as THREE.Vector3, top]);
  // Outward winding throughout.
  const n = new THREE.Vector3();
  const c = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  for (const t of tris) {
    e1.subVectors(t[1], t[0]);
    e2.subVectors(t[2], t[0]);
    n.crossVectors(e1, e2);
    c.copy(t[0]).add(t[1]).add(t[2]);
    if (n.dot(c) < 0) [t[1], t[2]] = [t[2], t[1]];
  }
  return tris;
}

/** Air filling the dome: a mint mist up to the oxygen level, brightest at its surface. */
function mistMaterial(radius: number) {
  return new THREE.ShaderMaterial({
    uniforms: { level: { value: 0 }, time: { value: 0 }, radius: { value: radius } },
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float level;
      uniform float time;
      uniform float radius;
      varying vec3 vLocal;
      void main() {
        float h = vLocal.y / radius;
        float surf = level + 0.012 * sin(vLocal.x * 2.1 + time * 1.3) * sin(vLocal.z * 1.7 - time);
        float below = 1.0 - smoothstep(surf - 0.015, surf + 0.015, h);
        float line = exp(-pow((h - surf) * 38.0, 2.0));
        float on = step(0.004, level);
        float a = (below * (0.06 + 0.05 * h) + line * 0.4) * on;
        gl_FragColor = vec4(vec3(0.42, 1.0, 0.84) * a * 1.6, a);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

export class Base {
  readonly group = new THREE.Group();
  /** Circles the gardener cannot walk through. */
  readonly obstacles: { x: number; z: number; r: number }[] = [];
  private mist: THREE.ShaderMaterial;
  private greens: THREE.InstancedMesh;
  private greenSpots: { x: number; z: number; s: number; at: number }[] = [];
  private ring: THREE.InstancedMesh;
  private ringColour = new THREE.Color();
  private time = 0;

  constructor(ground: Ground) {
    const dome = this.dome(ground);
    this.mist = dome.mist;
    this.greens = dome.greens;
    this.group.add(dome.group);
    this.group.add(this.tank(ground));
    this.group.add(this.pipe(ground));
    this.ring = this.landingRing(ground);
    this.group.add(this.ring);
  }

  private dome(ground: Ground) {
    const g = new THREE.Group();
    const r = DOME.r;
    g.position.set(DOME.x, ground(DOME.x, DOME.z) - 0.1, DOME.z);
    const tris = domeFrame(r, 6, 22);
    // Glass: flat facets that catch the Sun one by one.
    const pos: number[] = [];
    for (const t of tris) for (const v of t) pos.push(v.x, v.y, v.z);
    const glassGeo = new THREE.BufferGeometry();
    glassGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    glassGeo.computeVertexNormals();
    const glass = new THREE.Mesh(
      glassGeo,
      new THREE.MeshStandardMaterial({
        color: 0xdcecff,
        roughness: 0.06,
        metalness: 0.1,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        envMapIntensity: 2.2,
      }),
    );
    glass.renderOrder = 2;
    // Struts along every edge.
    const edges = new Map<string, [THREE.Vector3, THREE.Vector3]>();
    const key = (v: THREE.Vector3) => `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    for (const t of tris)
      for (let i = 0; i < 3; i++) {
        const a = t[i] as THREE.Vector3;
        const b = t[(i + 1) % 3] as THREE.Vector3;
        const k = [key(a), key(b)].sort().join("|");
        if (!edges.has(k)) edges.set(k, [a, b]);
      }
    const rod = new THREE.CylinderGeometry(0.035, 0.035, 1, 6);
    rod.translate(0, 0.5, 0);
    const struts = new THREE.InstancedMesh(rod, strut, edges.size);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const d = new THREE.Vector3();
    let i = 0;
    for (const [a, b] of edges.values()) {
      d.subVectors(b, a);
      q.setFromUnitVectors(up, d.clone().normalize());
      m.compose(a, q, new THREE.Vector3(1, d.length(), 1));
      struts.setMatrixAt(i++, m);
    }
    // A ring of regolith bags holds the skirt down.
    const skirt = new THREE.Mesh(new THREE.TorusGeometry(r, 0.32, 8, 48), sandbag);
    skirt.rotation.x = Math.PI / 2;
    skirt.position.y = 0.12;
    skirt.scale.set(1, 1, 0.7);
    // The airlock faces the pad, where the gardener arrives.
    const lock = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 2.4, 20), white);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 1.05, 0);
    const hoops = [-0.9, 0, 0.9].map((z) => {
      const h = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.05, 6, 24), strut);
      h.position.set(0, 1.05, z);
      return h;
    });
    const door = new THREE.Mesh(new THREE.CircleGeometry(0.72, 24), warm);
    door.position.set(0, 1.0, 1.21);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.06, 6, 28), dark);
    frame.position.copy(door.position);
    lock.add(tube, ...hoops, door, frame);
    const toPad = Math.atan2(-DOME.x, -DOME.z);
    lock.rotation.y = toPad;
    lock.position.set(Math.sin(toPad) * (r + 0.6), 0, Math.cos(toPad) * (r + 0.6));
    // Inside: raised beds that green over as the air comes in.
    const beds = new THREE.Group();
    for (const [bx, bz, w] of [
      [-1.8, -1.2, 3.2],
      [1.6, -0.2, 2.6],
      [-0.4, 2.0, 3.0],
    ] as const) {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(w, 0.45, 1.1), sandbag);
      bed.position.set(bx, 0.22, bz);
      bed.rotation.y = bx * 0.4;
      beds.add(bed);
      for (let k = 0; k < 9; k++) {
        const t = (k + 0.5) / 9 - 0.5;
        this.greenSpots.push({
          x: bx + Math.cos(bed.rotation.y) * t * w * 0.9 + (Math.random() - 0.5) * 0.4,
          z: bz - Math.sin(bed.rotation.y) * t * w * 0.9 + (Math.random() - 0.5) * 0.5,
          s: 0.22 + Math.random() * 0.2,
          at: Math.random() * 0.9,
        });
      }
    }
    const greens = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: 0x4fae62, roughness: 0.7, emissive: 0x0c2a14 }),
      this.greenSpots.length,
    );
    greens.count = 0;
    greens.position.y = 0.45;
    const mist = mistMaterial(r * 0.97);
    const air = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.97, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      mist,
    );
    air.renderOrder = 3;
    g.add(shadowed(struts, false), shadowed(skirt), shadowed(lock), shadowed(beds), greens);
    g.add(glass, air);
    this.obstacles.push({ x: DOME.x, z: DOME.z, r: r + 0.4 });
    this.obstacles.push({
      x: DOME.x + Math.sin(toPad) * (r + 0.9),
      z: DOME.z + Math.cos(toPad) * (r + 0.9),
      r: 1.3,
    });
    return { group: g, mist, greens };
  }

  private tank(ground: Ground) {
    const g = new THREE.Group();
    g.position.set(TANK.x, ground(TANK.x, TANK.z), TANK.z);
    g.rotation.y = 0.5;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, 1.9, 6, 20), white);
    body.rotation.z = Math.PI / 2;
    body.position.y = 1.15;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.28, 24), water);
    band.rotation.z = Math.PI / 2;
    band.position.y = 1.15;
    const saddles = [-0.8, 0.8].map((x) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 1.3), dark);
      s.position.set(x, 0.35, 0);
      return s;
    });
    const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 8), strut);
    riser.position.set(0, 1.9, 0);
    const tap = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 16), water);
    tap.position.set(0, 2.2, 0);
    tap.rotation.x = Math.PI / 2;
    g.add(body, band, ...saddles, riser, tap);
    this.obstacles.push({ x: TANK.x, z: TANK.z, r: 1.6 });
    return shadowed(g);
  }

  /** The water line from the tank to the dome, lying on the regolith. */
  private pipe(ground: Ground) {
    const from = new THREE.Vector2(TANK.x, TANK.z);
    const to = new THREE.Vector2(DOME.x, DOME.z);
    const dir = to.clone().sub(from).normalize();
    const end = to.clone().addScaledVector(dir, -DOME.r - 0.1);
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 16; k++) {
      const p = from.clone().lerp(end, k / 16);
      // A lazy curve, as a hose would lie.
      const bow = Math.sin((k / 16) * Math.PI) * 1.2;
      const x = p.x - dir.y * bow;
      const z = p.y + dir.x * bow;
      pts.push(new THREE.Vector3(x, ground(x, z) + 0.09, z));
    }
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.07, 8),
      dark,
    );
    tube.receiveShadow = true;
    return tube;
  }

  private landingRing(ground: Ground) {
    const n = 16;
    const lamp = new THREE.CylinderGeometry(0.09, 0.12, 0.12, 10);
    // Unlit, so each lamp's instance colour is its glow (above 1 for the bloom).
    const ring = new THREE.InstancedMesh(lamp, new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = LANDING.x + Math.sin(a) * LANDING.r;
      const z = LANDING.z + Math.cos(a) * LANDING.r;
      m.makeTranslation(x, ground(x, z) + 0.05, z);
      ring.setMatrixAt(i, m);
      ring.setColorAt(i, new THREE.Color(0x331a08));
    }
    return ring;
  }

  /** `oxygen` is the dome's share, 0 … 1. */
  update(dt: number, oxygen: number) {
    this.time += dt;
    const u = this.mist.uniforms as { level: { value: number }; time: { value: number } };
    u.level.value += (oxygen * 0.94 - u.level.value) * Math.min(1, dt * 1.5);
    u.time.value = this.time;
    // Beds green over with the air: each sprig at its own share.
    const m = new THREE.Matrix4();
    let n = 0;
    for (const s of this.greenSpots) {
      const grow = THREE.MathUtils.smoothstep(oxygen, s.at * 0.9, s.at * 0.9 + 0.12);
      if (grow <= 0) continue;
      const k = s.s * grow;
      m.makeScale(k, k * 0.8, k).setPosition(s.x, k * 0.5, s.z);
      this.greens.setMatrixAt(n++, m);
    }
    this.greens.count = n;
    this.greens.instanceMatrix.needsUpdate = true;
    // The landing lights chase round, brighter as the Perennial draws near.
    const lit = 0.25 + 0.75 * oxygen;
    for (let i = 0; i < 16; i++) {
      const phase = (this.time * 1.6 - i / 16) % 1;
      const glow = Math.exp(-(((phase + 1) % 1) * 9)) * 3 * lit + 0.15;
      this.ring.setColorAt(i, this.ringColour.setRGB(1 * glow, 0.62 * glow, 0.28 * glow));
    }
    if (this.ring.instanceColor) this.ring.instanceColor.needsUpdate = true;
  }
}
