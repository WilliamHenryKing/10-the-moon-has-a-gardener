import * as THREE from "three";
import type { Terrain } from "../world/terrain";
import { fbm } from "../world/terrain-gen";
import { SUN_MASK_GLSL, type SunMask, sunMaskUniforms } from "./sun-mask";

// The ground: the basin as 30 m chunks at four levels of detail around the camera (skirted so
// neighbours never crack), and a far ring out to the horizon carrying the polar massifs. One
// regolith material for both: Poly Haven's CC0 lunar scans (moon_dusted_05, moon_01 and
// moon_meteor_01), top-projected at two scales and mixed by a macro field so nothing tiles,
// triplanar on steep crater walls, graded to lunar grey. Lunar photometry replaces Lambert for
// the Sun: Lommel-Seeliger (the Moon's famously flat, limbless look) with an opposition surge
// (ground brightening around your own shadow), and the Sun mask for the long shadows.

const CHUNK = 30;
const SPACING = [0.75, 1.5, 3, 6];
/** Distance to a chunk's centre at which each level stops being used. */
const LOD_FAR = [52, 110, 230];

export interface RegolithMaps {
  /** `mean`: the colour map's mean linear luminance, so albedo can be set absolutely. */
  dust: { colour: THREE.Texture; normal: THREE.Texture; arm: THREE.Texture; mean: number };
  rough: { normal: THREE.Texture; arm: THREE.Texture };
  meteor: { normal: THREE.Texture };
}

const REGOLITH_PARS = /* glsl */ `
  uniform sampler2D dustColour;
  uniform sampler2D dustNormal;
  uniform sampler2D dustArm;
  uniform sampler2D roughNormal;
  uniform sampler2D roughArm;
  uniform sampler2D meteorNormal;
  uniform vec3 sunView;
  uniform float dustMean;
  varying vec3 vWorld;
  varying vec3 vWorldNormal;
  ${SUN_MASK_GLSL}
  float rHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float rNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(rHash(i), rHash(i + vec2(1.0, 0.0)), f.x), mix(rHash(i + vec2(0.0, 1.0)), rHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float macro(vec2 p) {
    return rNoise(p / 38.0) * 0.55 + rNoise(p / 11.0) * 0.3 + rNoise(p / 3.1) * 0.15;
  }
  vec3 unpackN(vec3 t) { return t * 2.0 - 1.0; }
  // Whiteout blend of two tangent-space normals.
  vec3 blendN(vec3 a, vec3 b) { return normalize(vec3(a.xy + b.xy, a.z * b.z)); }
`;

const REGOLITH_VERTEX_PARS = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vWorldNormal;
`;

const REGOLITH_VERTEX = /* glsl */ `
  #include <worldpos_vertex>
  vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
`;

// Replaces <map_fragment>: albedo, and the detail normal kept for later.
const REGOLITH_ALBEDO = /* glsl */ `
  vec2 p1 = vWorld.xz / 3.4;
  vec2 p2 = mat2(0.8, -0.6, 0.6, 0.8) * vWorld.xz / 9.3;
  float m = macro(vWorld.xz);
  float roughMix = smoothstep(0.35, 0.75, m);
  vec3 dust = texture2D(dustColour, p1).rgb;
  float lum = dot(dust, vec3(0.299, 0.587, 0.114));
  // Lunar highland grey with a faint warm cast; darker in old mare-like patches.
  vec3 grey = vec3(lum) * vec3(1.02, 1.0, 0.97);
  float albedo = mix(0.16, 0.22, smoothstep(0.2, 0.8, rNoise(vWorld.xz / 70.0)));
  diffuseColor.rgb = grey / dustMean * albedo * (0.86 + 0.28 * m);
  float wall = smoothstep(0.35, 0.7, 1.0 - vWorldNormal.y);
  diffuseColor.rgb *= 1.0 - wall * 0.12;
`;

// Replaces <normal_fragment_maps>: detail normals in world space, onto the geometric normal.
const REGOLITH_NORMAL = /* glsl */ `
  {
    // Low sun rakes the ground, so relief matters: strengthen detail up close, fade it far away
    // (where it would only shimmer).
    float dist = length(vWorld - cameraPosition);
    float near = 1.0 - smoothstep(25.0, 160.0, dist);
    vec3 nd = unpackN(texture2D(dustNormal, p1).rgb);
    nd.xy *= 1.9 * near;
    vec3 nr = unpackN(texture2D(roughNormal, p2).rgb);
    nr.xy *= 1.5 * (0.35 + 0.65 * near);
    vec3 nt = blendN(nd, mix(vec3(0.0, 0.0, 1.0), nr, 0.4 + 0.6 * roughMix));
    // Top projection: tangent space x → world +x, y → world -z (OpenGL normal maps).
    vec3 top = normalize(vec3(nt.x, nt.z, -nt.y));
    // Steep walls: the meteor scan, projected from the side the wall faces.
    vec3 wn = vWorldNormal;
    vec3 side;
    if (abs(wn.x) > abs(wn.z)) {
      vec3 t = unpackN(texture2D(meteorNormal, vWorld.zy / 4.0).rgb);
      side = normalize(vec3(t.z * sign(wn.x), t.y, t.x));
    } else {
      vec3 t = unpackN(texture2D(meteorNormal, vWorld.xy / 4.0).rgb);
      side = normalize(vec3(t.x, t.y, t.z * sign(wn.z)));
    }
    // Rotate the detail onto the true ground normal (reoriented around +Y).
    vec3 detail = normalize(mix(top, side, wall));
    vec3 base = normalize(wn);
    vec3 axis = cross(vec3(0.0, 1.0, 0.0), base);
    float s = length(axis);
    float c = base.y;
    vec3 world = detail;
    if (s > 1e-4) {
      axis /= s;
      world = detail * c + cross(axis, detail) * s + axis * dot(axis, detail) * (1.0 - c);
    }
    normal = normalize((viewMatrix * vec4(world, 0.0)).xyz);
  }
`;

const REGOLITH_ROUGHNESS = /* glsl */ `
  #include <roughnessmap_fragment>
  vec3 armD = texture2D(dustArm, p1).rgb;
  vec3 armR = texture2D(roughArm, p2).rgb;
  roughnessFactor = 0.96;
  float cavity = mix(armD.r, armD.r * armR.r, 0.5 + 0.5 * roughMix);
`;

// After the lights: lunar photometry for the Sun, the Sun mask, and cavity occlusion.
const REGOLITH_LIGHT = /* glsl */ `
  #include <lights_fragment_end>
  {
    vec3 V = normalize(vViewPosition);
    float ci = max(dot(normal, sunView), 0.0);
    float ce = max(dot(normal, V), 0.05);
    float ls = 2.0 / (ci + ce + 1e-3);
    float g = acos(clamp(dot(sunView, V), -1.0, 1.0));
    float surge = 1.0 + 0.55 * exp(-g / 0.07);
    float vis = sunVisible(vWorld);
    reflectedLight.directDiffuse *= min(ls, 3.0) * surge * vis;
    reflectedLight.directSpecular *= vis;
    // In shadow the regolith is lit by the sunlit ground around it and a little Earthshine.
    reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.16, 0.17, 0.2) * (1.0 - vis);
    reflectedLight.indirectDiffuse *= cavity;
    reflectedLight.directDiffuse *= mix(1.0, cavity, 0.5);
  }
`;

export function regolithMaterial(maps: RegolithMaps, mask: SunMask) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 });
  const uniforms = {
    dustColour: { value: maps.dust.colour },
    dustNormal: { value: maps.dust.normal },
    dustArm: { value: maps.dust.arm },
    roughNormal: { value: maps.rough.normal },
    roughArm: { value: maps.rough.arm },
    meteorNormal: { value: maps.meteor.normal },
    sunView: { value: new THREE.Vector3(0, 1, 0) },
    dustMean: { value: maps.dust.mean },
    ...sunMaskUniforms(mask),
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${REGOLITH_VERTEX_PARS}`)
      .replace("#include <worldpos_vertex>", REGOLITH_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${REGOLITH_PARS}`)
      .replace("#include <map_fragment>", REGOLITH_ALBEDO)
      .replace("#include <normal_fragment_maps>", REGOLITH_NORMAL)
      .replace("#include <roughnessmap_fragment>", REGOLITH_ROUGHNESS)
      .replace("#include <lights_fragment_end>", REGOLITH_LIGHT);
  };
  return { material: m, uniforms };
}

interface Chunk {
  cx: number;
  cz: number;
  lod: number;
  mesh: THREE.Mesh;
}

export class Ground {
  readonly group = new THREE.Group();
  private chunks: Chunk[] = [];
  private cache = new Map<string, THREE.BufferGeometry>();

  constructor(
    private terrain: Terrain,
    private material: THREE.Material,
    private lodScale: number,
  ) {
    const n = Math.ceil((terrain.half + 8) / CHUNK);
    for (let j = -n; j < n; j++)
      for (let i = -n; i < n; i++) {
        const cx = (i + 0.5) * CHUNK;
        const cz = (j + 0.5) * CHUNK;
        if (Math.hypot(cx, cz) > terrain.half + CHUNK) continue;
        const mesh = new THREE.Mesh(this.geometry(i, j, 3), material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.group.add(mesh);
        this.chunks.push({ cx: i, cz: j, lod: 3, mesh });
      }
    this.group.add(this.farRing());
  }

  private geometry(i: number, j: number, lod: number) {
    const key = `${i},${j},${lod}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const t = this.terrain;
    const s = SPACING[lod] as number;
    const n = Math.round(CHUNK / s) + 1;
    const x0 = i * CHUNK;
    const z0 = j * CHUNK;
    const skirt = 1 + s * 0.6;
    // Grid plus a skirt ring: (n + 2)² vertices, the outer ring dropped below the surface.
    const m = n + 2;
    const pos = new Float32Array(m * m * 3);
    const nor = new Float32Array(m * m * 3);
    const out = { x: 0, y: 1, z: 0 };
    for (let b = 0; b < m; b++)
      for (let a = 0; a < m; a++) {
        const ga = Math.min(n - 1, Math.max(0, a - 1));
        const gb = Math.min(n - 1, Math.max(0, b - 1));
        const x = x0 + ga * s;
        const z = z0 + gb * s;
        const edge = a === 0 || b === 0 || a === m - 1 || b === m - 1;
        const y = t.heightAt(x, z) - (edge ? skirt : 0);
        pos.set([x, y, z], (b * m + a) * 3);
        t.normalAt(x, z, out);
        nor.set([out.x, out.y, out.z], (b * m + a) * 3);
      }
    const idx: number[] = [];
    for (let b = 0; b < m - 1; b++)
      for (let a = 0; a < m - 1; a++) {
        const p = b * m + a;
        idx.push(p, p + m, p + 1, p + 1, p + m, p + m + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    this.cache.set(key, g);
    return g;
  }

  /** Beyond the basin: the outer slopes and the massifs on the horizon. */
  private farRing() {
    const t = this.terrain;
    const inner = t.half - 30;
    const rings: number[] = [];
    for (let r = inner; r < 5200; r *= 1.045) rings.push(r);
    const segs = 720;
    const massifs = [
      { az: 38, r: 3300, h: 720, w: 900 },
      { az: 128, r: 2700, h: 540, w: 700 },
      { az: 196, r: 3900, h: 980, w: 1300 },
      { az: 248, r: 3000, h: 480, w: 650 },
      { az: 302, r: 3600, h: 660, w: 1000 },
      { az: 347, r: 4300, h: 420, w: 800 },
    ];
    const pos = new Float32Array(rings.length * segs * 3);
    for (let k = 0; k < rings.length; k++) {
      const r = rings[k] as number;
      for (let q = 0; q < segs; q++) {
        const a = (q / segs) * Math.PI * 2;
        const x = Math.sin(a) * r;
        const z = -Math.cos(a) * r;
        let h: number;
        if (r < t.half - 2) h = t.heightAt(x, z) - 0.6;
        else {
          const edge = t.heightAt(Math.sin(a) * (t.half - 2), -Math.cos(a) * (t.half - 2));
          const out = r - t.half;
          h =
            edge * Math.exp(-out / 420) + fbm(x / 400, z / 400, 4, 3) * 18 * Math.min(1, out / 300);
          for (const mm of massifs) {
            const ma = (mm.az * Math.PI) / 180;
            const dx = x - Math.sin(ma) * mm.r;
            const dz = z + Math.cos(ma) * mm.r;
            const d2 = (dx * dx + dz * dz) / (mm.w * mm.w);
            // Ridged relief: sharp crests and gullies rather than smooth domes.
            let ridged = 0;
            let amp = 0.5;
            let f = 1;
            for (let o = 0; o < 5; o++) {
              const nz = 1 - Math.abs(fbm((x * f) / 520, (z * f) / 520, 1, 41 + o * 7));
              ridged += nz * nz * amp;
              amp *= 0.5;
              f *= 2.1;
            }
            h += mm.h * Math.exp(-d2) * (0.45 + ridged * 1.1);
          }
        }
        pos.set([x, h, z], (k * segs + q) * 3);
      }
    }
    const idx: number[] = [];
    for (let k = 0; k < rings.length - 1; k++)
      for (let q = 0; q < segs; q++) {
        const a = k * segs + q;
        const b = k * segs + ((q + 1) % segs);
        // Wound to face up.
        idx.push(a, b, a + segs, b, b + segs, a + segs);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, this.material);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return mesh;
  }

  /** Choose each chunk's level of detail for the camera. */
  update(camera: THREE.Vector3) {
    for (const c of this.chunks) {
      const d = Math.hypot((c.cx + 0.5) * CHUNK - camera.x, (c.cz + 0.5) * CHUNK - camera.z);
      let lod = 3;
      for (let l = 0; l < LOD_FAR.length; l++)
        if (d < (LOD_FAR[l] as number) * this.lodScale) {
          lod = l;
          break;
        }
      if (lod !== c.lod) {
        c.lod = lod;
        c.mesh.geometry = this.geometry(c.cx, c.cz, lod);
      }
    }
  }
}
