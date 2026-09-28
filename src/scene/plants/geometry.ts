import * as THREE from "three";

// Small procedural shapes for the garden's species: leaf blades, pleated fans, pinnate fronds,
// stems, bells and petals. Every shape grows along +Y from the origin and faces +Z, so a part is
// placed by rotating it about its base.

/**
 * A leaf blade: `length` along +Y, `width` across X, its outline set by `shape(t)` (0 … 1 width
 * along the length), bent toward +Z by `curl` (radians over the length) and cupped across by
 * `cup`. A raised midrib shows in the normals.
 */
export function blade(
  length: number,
  width: number,
  opts: {
    curl?: number;
    cup?: number;
    segs?: number;
    shape?: (t: number) => number;
    pleats?: number;
  } = {},
) {
  const segs = opts.segs ?? 8;
  const across = opts.pleats ? opts.pleats * 2 : 4;
  const shape = opts.shape ?? ((t: number) => Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.8);
  const curl = opts.curl ?? 0.4;
  const cup = opts.cup ?? 0.25;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const w = width * shape(t) * 0.5;
    // Bend: walk along an arc of angle curl · t.
    const a = curl * t;
    const r = curl !== 0 ? length / curl : 0;
    const cy = curl !== 0 ? r * Math.sin(a) : length * t;
    const cz = curl !== 0 ? r * (1 - Math.cos(a)) : 0;
    for (let j = 0; j <= across; j++) {
      const s = j / across - 0.5;
      const pleat = opts.pleats ? (j % 2 === 0 ? 0 : 1) * width * 0.045 * shape(t) : 0;
      const x = s * 2 * w;
      const lift = cup * w * (4 * s * s) + pleat;
      pos.push(x, cy - Math.sin(a) * lift, cz + Math.cos(a) * lift);
      uv.push(s + 0.5, t);
    }
  }
  const row = across + 1;
  for (let i = 0; i < segs; i++)
    for (let j = 0; j < across; j++) {
      const p = i * row + j;
      idx.push(p, p + 1, p + row, p + 1, p + row + 1, p + row);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A pinnate frond: a rachis with leaflets either side, `length` long, flat along +Y. */
export function frond(length: number, width: number, pairs = 11) {
  const parts: THREE.BufferGeometry[] = [];
  const rachis = new THREE.CylinderGeometry(0.004, 0.007, length, 5, 1, true);
  rachis.translate(0, length / 2, 0);
  parts.push(rachis);
  for (let i = 0; i < pairs; i++) {
    const t = 0.15 + (i / pairs) * 0.82;
    const size = width * (1 - t * 0.75) * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.3)));
    for (const s of [-1, 1]) {
      const leaf = blade(size, size * 0.34, { curl: 0.3, cup: 0.3, segs: 4 });
      leaf.rotateZ(s * (1.05 - t * 0.25));
      leaf.translate(0, t * length, 0);
      parts.push(leaf);
    }
  }
  return merge(parts);
}

/** A stem from the origin up `height`, tapering r0 → r1, arched toward +Z by `arch` metres. */
export function stem(height: number, r0: number, r1: number, arch = 0, segs = 8) {
  const path: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    path.push(new THREE.Vector3(0, height * t, arch * t * t));
  }
  const curve = new THREE.CatmullRomCurve3(path);
  const tube = new THREE.TubeGeometry(curve, segs * 2, 1, 6, false);
  // Taper: scale each ring about the curve.
  const pos = tube.getAttribute("position") as THREE.BufferAttribute;
  const n = tube.getAttribute("normal") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const ring = Math.floor(i / 7);
    const t = ring / (segs * 2);
    const c = curve.getPoint(t);
    const r = r0 + (r1 - r0) * t;
    pos.setXYZ(i, c.x + n.getX(i) * r, c.y + n.getY(i) * r, c.z + n.getZ(i) * r);
  }
  tube.computeVertexNormals();
  return tube;
}

/** A hanging bell, mouth down, `radius` wide and `height` deep; top at the origin. */
export function bell(radius: number, height: number) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const r = radius * (0.25 + 0.75 * Math.sin((t * Math.PI) / 2) ** 1.4) * (1 + 0.18 * t ** 6);
    pts.push(new THREE.Vector2(r, -height * t));
  }
  const g = new THREE.LatheGeometry(pts, 14);
  g.computeVertexNormals();
  return g;
}

/** A five-petal star flower, flat, facing +Y. */
export function star(radius: number, petals = 5) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= petals * 8; i++) {
    const a = (i / (petals * 8)) * Math.PI * 2;
    const r = radius * (0.35 + 0.65 * Math.abs(Math.cos((a * petals) / 2)) ** 0.8);
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Merge geometries with the same attributes (position, normal, uv when present). */
export function merge(parts: THREE.BufferGeometry[]) {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (const p of parts) {
    const g = p.index ? p : p;
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    const a = g.getAttribute("position") as THREE.BufferAttribute;
    const b = g.getAttribute("normal") as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i++) {
      pos.push(a.getX(i), a.getY(i), a.getZ(i));
      nor.push(b.getX(i), b.getY(i), b.getZ(i));
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
    else for (let i = 0; i < a.count; i++) idx.push(i + base);
    base += a.count;
    p.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}
