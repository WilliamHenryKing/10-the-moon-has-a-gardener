// The basin's shape, as a pure function of position, and the heightfield sampled from it.
// A large old crater near the lunar south pole: a gently rolling floor about 370 m across inside
// rim walls that rise 22 m (low enough that a Sun ten degrees up still reaches the middle), dotted with a few hundred smaller craters (bowls with raised rims and
// ejecta, the older ones worn soft), a landing pad, a deep bowl whose floor never sees the Sun,
// a hill whose north face looks at Earth, and a rocky ridge. Deterministic; runs in a worker.
// World axes: +X east, -Z north (toward Earth, low on the horizon), metres.

export const WORLD = {
  /** Half-extent of the detailed heightfield. */
  half: 262,
  /** Grid spacing of the heightfield. */
  step: 0.75,
  /** Radius of the basin floor and where the rim wall tops out. */
  floor: 185,
  rim: 232,
  rimHeight: 22,
};

/** Named places: centre, radius. */
export const PLACES = {
  pad: { x: 0, z: 0, r: 28 },
  bowl: { x: -118, z: 58, r: 34, depth: 13 },
  earthside: { x: 8, z: -118, r: 46 },
  ridge: { x: 112, z: -128, r: 40 },
  crystals: { x: -142, z: -44, r: 30 },
  probe: { x: 46, z: 122, r: 6 },
  arch: { x: -150, z: 128, r: 8 },
};

interface Crater {
  x: number;
  z: number;
  r: number;
  depth: number;
  rim: number;
  /** 0 fresh … 1 worn smooth. */
  age: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}
const hash2 = (x: number, y: number, seed: number) => {
  let h = (x * 374761393 + y * 668265263 + seed * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Smooth value noise in [-1, 1]. */
export function noise2(x: number, y: number, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
export function fbm(x: number, y: number, octaves: number, seed = 0) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * f, y * f, seed + i * 31);
    amp *= 0.5;
    f *= 2.03;
  }
  return sum;
}

/**
 * A population of craters with a power-law size spread (more small than large), kept off the
 * landing pad. Simple craters are about a fifth as deep as they are wide.
 */
function craters(): Crater[] {
  const rand = rng(1969);
  const out: Crater[] = [];
  for (let i = 0; i < 2600 && out.length < 340; i++) {
    const u = rand();
    const r = 1.2 * (1 - u * 0.985) ** -0.62;
    if (r > 26) continue;
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * (WORLD.floor + 20);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (Math.hypot(x - PLACES.pad.x, z - PLACES.pad.z) < PLACES.pad.r + r) continue;
    if (Math.hypot(x - PLACES.bowl.x, z - PLACES.bowl.z) < PLACES.bowl.r * 0.8) continue;
    const age = rand() ** 0.6;
    const fresh = 1 - age * 0.75;
    out.push({ x, z, r, depth: 0.3 * r * fresh, rim: 0.07 * r * fresh, age });
  }
  const b = PLACES.bowl;
  out.push({ x: b.x, z: b.z, r: b.r, depth: b.depth, rim: 3.2, age: 0.25 });
  const p = PLACES.probe;
  out.push({ x: p.x, z: p.z, r: p.r, depth: 1.9, rim: 0.7, age: 0 });
  return out;
}

/** Height of one crater's profile at normalised distance q (1 = the rim crest). */
function craterProfile(c: Crater, q: number) {
  const soft = 0.18 + c.age * 0.3;
  // Bowl: a parabola to the crest, eased by age; rim: a ridge at q = 1; ejecta: falls as q⁻³.
  const bowl = q < 1 ? -c.depth * (1 - q * q) ** (1 + c.age * 0.8) : 0;
  const rim = c.rim * Math.exp(-(((q - 1) / soft) ** 2));
  const ejecta =
    q > 1
      ? c.rim * 0.55 * q ** -3 * (1 - Math.exp(-(((q - 1) / soft) ** 2))) * (1 - smooth(2.1, 3, q))
      : 0;
  return bowl + rim + ejecta;
}

export class Shape {
  private craters = craters();
  private buckets = new Map<number, Crater[]>();
  private static CELL = 24;

  constructor() {
    for (const c of this.craters) {
      const reach = c.r * 3;
      const x0 = Math.floor((c.x - reach) / Shape.CELL);
      const x1 = Math.floor((c.x + reach) / Shape.CELL);
      const z0 = Math.floor((c.z - reach) / Shape.CELL);
      const z1 = Math.floor((c.z + reach) / Shape.CELL);
      for (let i = x0; i <= x1; i++)
        for (let j = z0; j <= z1; j++) {
          const k = i * 4096 + j;
          const list = this.buckets.get(k);
          if (list) list.push(c);
          else this.buckets.set(k, [c]);
        }
    }
  }

  /** Craters for placing props (rocks on rims, ice in the bowl). */
  get all(): readonly Crater[] {
    return this.craters;
  }

  /** Height of the pad: the ground's own height at its centre, so it sits in the land. */
  private padLevel = Number.NaN;

  height(x: number, z: number) {
    const p = PLACES.pad;
    if (Number.isNaN(this.padLevel)) {
      this.padLevel = 0;
      let sum = 0;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        sum += this.natural(p.x + Math.cos(a) * p.r, p.z + Math.sin(a) * p.r);
      }
      this.padLevel = sum / 16;
    }
    // The landing pad: levelled and compacted, blended wide so it has no edge.
    const pd = Math.hypot(x - p.x, z - p.z);
    const level = 1 - smooth(p.r * 0.45, p.r * 1.25, pd);
    return this.natural(x, z) * (1 - level) + this.padLevel * level;
  }

  private natural(x: number, z: number) {
    // The basin: a floor, then a wall that steepens toward the crest; its outline wanders.
    const angle = Math.atan2(z, x);
    const wobble = 1 + fbm(Math.cos(angle) * 2.2 + 7, Math.sin(angle) * 2.2 - 3, 3, 4) * 0.12;
    const r = Math.hypot(x, z) / wobble;
    const wall = smooth(WORLD.floor, WORLD.rim, r);
    let h = WORLD.rimHeight * wall ** 1.7 - Math.max(0, r - WORLD.rim) * 0.12;
    h += fbm(x / 70, z / 70, 4, 11) * 1.6 * (1 - wall * 0.5) + fbm(x / 9, z / 9, 3, 17) * 0.22;
    // Rolling swells on the floor, and big broken blocks up the wall.
    h += fbm(x / 140, z / 140, 2, 5) * 3.2;
    // Slumped blocks and terraces up the wall, and a broken crest.
    h += Math.max(0, fbm(x / 18, z / 18, 4, 23)) * 7 * wall * (1 - wall * 0.6);
    h += fbm(x / 7, z / 7, 3, 37) * 1.2 * wall;

    // The hill whose north face looks at Earth, and the rocky ridge.
    const e = PLACES.earthside;
    const he = Math.hypot((x - e.x) / 1.3, z - e.z) / e.r;
    h += 9 * Math.exp(-he * he * 1.4);
    const g = PLACES.ridge;
    const along = ((x - g.x) * 0.8 + (z - g.z) * 0.6) / (g.r * 1.6);
    const across = (-(x - g.x) * 0.6 + (z - g.z) * 0.8) / (g.r * 0.35);
    h += 7 * Math.exp(-(along * along + across * across)) * (1 + fbm(x / 6, z / 6, 3, 29) * 0.35);

    // Craters (only those whose bucket reaches this point).
    const list = this.buckets.get(Math.floor(x / Shape.CELL) * 4096 + Math.floor(z / Shape.CELL));
    if (list)
      for (const c of list) {
        const q = Math.hypot(x - c.x, z - c.z) / c.r;
        if (q < 3) h += craterProfile(c, q);
      }
    return h;
  }
}

export interface Heightfield {
  /** Samples per side. */
  n: number;
  step: number;
  /** World coordinate of sample (0, 0). */
  origin: number;
  heights: Float32Array;
}

export function buildHeightfield(step = WORLD.step): Heightfield {
  const shape = new Shape();
  const n = Math.floor((WORLD.half * 2) / step) + 1;
  const origin = -WORLD.half;
  const heights = new Float32Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++)
      heights[j * n + i] = shape.height(origin + i * step, origin + j * step);
  return { n, step, origin, heights };
}
