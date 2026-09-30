import * as THREE from "three";
import type { Terrain } from "../world/terrain";
import { REGOLITH_NOISE, REGOLITH_VERTEX, REGOLITH_VERTEX_PARS, type RegolithMaps } from "./ground";
import { basinBand, groundHeight, type Lunar } from "./lunar";

// Beyond the basin: the real ground of the lunar south pole, out to 146 km, where the Moon's
// curvature has long since taken it under the horizon. One polar mesh around the basin, its rings
// spreading geometrically so each holds about the same share of the view. It tucks under the
// basin's own ground at the rim and blends out into NASA's heights. The shading takes its normals
// from the height grids (sharper than any mesh this size) and its shadows from the baked
// skylines: the Sun reaches a point when it stands above that point's skyline in its direction.
// Close to the basin it wears the same regolith, so the seam does not show.

export interface FarDetail {
  /** Each ring's radius over the last's. */
  ratio: number;
  /** Vertices around each ring. */
  segs: number;
}

const OUTER = 146000;

export function farLandGeometry(lunar: Lunar, terrain: Terrain, detail: FarDetail) {
  const half = terrain.half;
  const band = basinBand(half);
  const height = groundHeight(terrain, lunar);
  const rings: number[] = [];
  for (let r = half - 14; r < OUTER; r = Math.max(r * detail.ratio, r + 1.5)) rings.push(r);
  rings.push(OUTER);
  const segs = detail.segs;
  const pos = new Float32Array(rings.length * segs * 3);
  for (let k = 0; k < rings.length; k++) {
    const r = rings[k] as number;
    // Tucked a little under the basin's own chunks, so they win wherever both stand.
    const tuck = 1.2 * (1 - Math.max(0, Math.min(1, (r - band.from) / (band.to - band.from))));
    for (let q = 0; q < segs; q++) {
      const a = (q / segs) * Math.PI * 2;
      const x = Math.sin(a) * r;
      const z = -Math.cos(a) * r;
      pos.set([x, height(x, z) - tuck, z], (k * segs + q) * 3);
    }
  }
  const quads = (rings.length - 1) * segs;
  const idx = new Uint32Array(quads * 6);
  let o = 0;
  for (let k = 0; k < rings.length - 1; k++)
    for (let q = 0; q < segs; q++) {
      const a = k * segs + q;
      const b = k * segs + ((q + 1) % segs);
      // Wound to face up.
      idx.set([a, b, a + segs, b, b + segs, a + segs], o);
      o += 6;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), OUTER);
  return g;
}

const FAR_PARS = /* glsl */ `
  uniform sampler2D dustColour;
  uniform sampler2D dustNormal;
  uniform vec3 sunView;
  uniform vec3 sunIrradiance;
  uniform float dustMean;
  uniform highp sampler2DArray horizonNear;
  uniform highp sampler2DArray horizonMid;
  uniform highp sampler2DArray horizonFar;
  uniform sampler2D normalNear;
  uniform sampler2D normalMid;
  uniform sampler2D normalFar;
  uniform vec3 lunarHalf;
  // The skyline directions either side of the Sun (layer, layer, blend), their channels, and
  // the Sun's height in radians.
  uniform vec3 sunSlice;
  uniform vec4 sunChannelA;
  uniform vec4 sunChannelB;
  uniform float sunElevation;
  uniform vec2 basinBand;
  varying vec3 vWorld;
  varying vec3 vWorldNormal;
  ${REGOLITH_NOISE}

  // How much the near and middle grids count here (the far grid fills the rest).
  vec2 lunarWeights(vec2 xz) {
    float m = max(abs(xz.x), abs(xz.y));
    return vec2(
      1.0 - smoothstep(lunarHalf.x * 0.86, lunarHalf.x * 0.96, m),
      1.0 - smoothstep(lunarHalf.y * 0.86, lunarHalf.y * 0.96, m)
    );
  }

  float skyline(highp sampler2DArray t, vec2 xz, float h, vec2 gx, vec2 gy) {
    float s = 0.5 / h;
    vec2 uv = xz * s + 0.5;
    float a = dot(textureGrad(t, vec3(uv, sunSlice.x), gx * s, gy * s), sunChannelA);
    float b = dot(textureGrad(t, vec3(uv, sunSlice.y), gx * s, gy * s), sunChannelB);
    return mix(a, b, sunSlice.z) * 0.75 - 0.25;
  }

  /** 0 … 1: how much of the Sun's disc clears the skyline. */
  float lunarSun(vec2 xz, vec2 gx, vec2 gy) {
    vec2 w = lunarWeights(xz);
    float h = 0.0;
    if (w.y < 1.0) h = skyline(horizonFar, xz, lunarHalf.z, gx, gy);
    if (w.y > 0.0) h = mix(h, skyline(horizonMid, xz, lunarHalf.y, gx, gy), w.y);
    if (w.x > 0.0) h = mix(h, skyline(horizonNear, xz, lunarHalf.x, gx, gy), w.x);
    return smoothstep(-0.006, 0.006, sunElevation - h);
  }

  vec2 gridSlope(sampler2D t, vec2 xz, float h, vec2 gx, vec2 gy) {
    float s = 0.5 / h;
    return textureGrad(t, xz * s + 0.5, gx * s, gy * s).rg * 2.0 - 1.0;
  }

  vec3 lunarNormal(vec2 xz, vec2 gx, vec2 gy) {
    vec2 w = lunarWeights(xz);
    vec2 n = vec2(0.0);
    if (w.y < 1.0) n = gridSlope(normalFar, xz, lunarHalf.z, gx, gy);
    if (w.y > 0.0) n = mix(n, gridSlope(normalMid, xz, lunarHalf.y, gx, gy), w.y);
    if (w.x > 0.0) n = mix(n, gridSlope(normalNear, xz, lunarHalf.x, gx, gy), w.x);
    return vec3(n.x, sqrt(max(0.0, 1.0 - dot(n, n))), n.y);
  }
`;

// Replaces <map_fragment>: the ground's normal first (the albedo reads its slope), then albedo.
const FAR_ALBEDO = /* glsl */ `
  vec2 lunarGx = dFdx(vWorld.xz);
  vec2 lunarGy = dFdy(vWorld.xz);
  float farDist = length(vWorld - cameraPosition);
  // Metres of ground under one pixel: each pattern fades before it could shimmer.
  float farFoot = max(length(lunarGx), length(lunarGy));
  // Near the basin the mesh follows its flank; beyond, the grids know the ground best.
  float wGrid = smoothstep(basinBand.x, basinBand.y, length(vWorld.xz));
  vec3 farN = normalize(mix(normalize(vWorldNormal), lunarNormal(vWorld.xz, lunarGx, lunarGy), wGrid));
  vec2 p1 = vWorld.xz / 3.4;
  vec3 dust = texture2D(dustColour, p1).rgb;
  float lum = dot(dust, vec3(0.299, 0.587, 0.114));
  vec3 grey = vec3(lum) * vec3(1.02, 1.0, 0.97) / dustMean;
  float mottle = (rNoise(vWorld.xz / 70.0) - 0.5) * (1.0 - smoothstep(8.0, 24.0, farFoot));
  mottle += (rNoise(vWorld.xz / 900.0 + 17.0) - 0.5) * (1.0 - smoothstep(110.0, 320.0, farFoot));
  mottle += (rNoise(vWorld.xz / 7000.0 + 41.0) - 0.5) * 1.3;
  // Steep walls shed their dust downhill: fresher, brighter ground.
  float steep = smoothstep(0.08, 0.45, 1.0 - farN.y);
  diffuseColor.rgb = grey * 0.19 * (1.0 + 0.3 * mottle) * (1.0 + 0.28 * steep);
`;

// Replaces <normal_fragment_maps>: the regolith's own detail up close, on the ground's normal.
const FAR_NORMAL = /* glsl */ `
  {
    vec3 nd = unpackN(texture2D(dustNormal, p1).rgb);
    nd.xy *= 1.9 * (1.0 - smoothstep(25.0, 160.0, farDist));
    vec3 detail = normalize(vec3(nd.x, nd.z, -nd.y));
    vec3 axis = cross(vec3(0.0, 1.0, 0.0), farN);
    float s = length(axis);
    float c = farN.y;
    vec3 world = detail;
    if (s > 1e-4) {
      axis /= s;
      world = detail * c + cross(axis, detail) * s + axis * dot(axis, detail) * (1.0 - c);
    }
    normal = normalize((viewMatrix * vec4(world, 0.0)).xyz);
  }
`;

// After the lights: the regolith's photometry, with the skylines for shadow. The Sun here is its
// own term, not the scene's key light (which dims when the Sun sinks behind the hills as seen
// from the basin; out on the land each point has its own skyline).
const FAR_LIGHT = /* glsl */ `
  #include <lights_fragment_end>
  {
    vec3 V = normalize(vViewPosition);
    float ci = max(dot(normal, sunView), 0.0);
    float ce = max(dot(normal, V), 0.05);
    float ls = 2.0 / (ci + ce + 1e-3);
    float g = acos(clamp(dot(sunView, V), -1.0, 1.0));
    float surge = 1.0 + 0.55 * exp(-g / 0.07);
    float vis = lunarSun(vWorld.xz, lunarGx, lunarGy);
    reflectedLight.directDiffuse =
      diffuseColor.rgb * RECIPROCAL_PI * sunIrradiance * ci * min(ls, 3.0) * surge * vis;
    reflectedLight.directSpecular = vec3(0.0);
    // By the basin, shadows keep the basin's readable fill; out on the land they sink toward the
    // near-black of real lunar shade, lit only by the sunlit slopes around and Earthshine.
    reflectedLight.indirectDiffuse *= mix(1.0, mix(0.3, 1.0, vis), wGrid);
    reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.16, 0.17, 0.2) * (1.0 - vis) * (1.0 - 0.85 * wGrid);
  }
`;

export class FarLand {
  readonly mesh: THREE.Mesh;
  private uniforms: {
    sunView: { value: THREE.Vector3 };
    sunSlice: { value: THREE.Vector3 };
    sunChannelA: { value: THREE.Vector4 };
    sunChannelB: { value: THREE.Vector4 };
    sunElevation: { value: number };
  };

  constructor(
    lunar: Lunar,
    terrain: Terrain,
    maps: RegolithMaps,
    detail: FarDetail,
    /** The Sun's irradiance (the key light's colour × intensity, unshadowed). */
    sun: THREE.Color,
  ) {
    const band = basinBand(terrain.half);
    const g = lunar.info.grids;
    this.uniforms = {
      sunView: { value: new THREE.Vector3(0, 1, 0) },
      sunSlice: { value: new THREE.Vector3() },
      sunChannelA: { value: new THREE.Vector4(1, 0, 0, 0) },
      sunChannelB: { value: new THREE.Vector4(0, 1, 0, 0) },
      sunElevation: { value: 0.16 },
    };
    const all = {
      ...this.uniforms,
      dustColour: { value: maps.dust.colour },
      dustNormal: { value: maps.dust.normal },
      dustMean: { value: maps.dust.mean },
      sunIrradiance: { value: sun },
      horizonNear: { value: lunar.horizon.near },
      horizonMid: { value: lunar.horizon.mid },
      horizonFar: { value: lunar.horizon.far },
      normalNear: { value: lunar.normals.near },
      normalMid: { value: lunar.normals.mid },
      normalFar: { value: lunar.normals.far },
      lunarHalf: { value: new THREE.Vector3(g.near.half, g.mid.half, g.far.half) },
      basinBand: { value: new THREE.Vector2(band.from, band.to + 200) },
    };
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 });
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, all);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${REGOLITH_VERTEX_PARS}`)
        .replace("#include <worldpos_vertex>", REGOLITH_VERTEX);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${FAR_PARS}`)
        .replace("#include <map_fragment>", FAR_ALBEDO)
        .replace("#include <normal_fragment_maps>", FAR_NORMAL)
        .replace("#include <lights_fragment_end>", FAR_LIGHT);
    };
    m.customProgramCacheKey = () => "far-land";
    this.mesh = new THREE.Mesh(farLandGeometry(lunar, terrain, detail), m);
    this.mesh.frustumCulled = false;
    // After the basin's chunks, so the ground they hide is never shaded.
    this.mesh.renderOrder = 1;
  }

  /** Follow the Sun: which skyline directions straddle it, and how high it stands. */
  update(sun: THREE.Vector3, sunView: THREE.Vector3) {
    const u = this.uniforms;
    u.sunView.value.copy(sunView);
    const az = Math.atan2(sun.x, -sun.z);
    const f = ((((az / (Math.PI * 2)) * 16) % 16) + 16) % 16;
    const k0 = Math.floor(f) % 16;
    const k1 = (k0 + 1) % 16;
    u.sunSlice.value.set(Math.floor(k0 / 4), Math.floor(k1 / 4), f - Math.floor(f));
    u.sunChannelA.value.set(0, 0, 0, 0).setComponent(k0 % 4, 1);
    u.sunChannelB.value.set(0, 0, 0, 0).setComponent(k1 % 4, 1);
    u.sunElevation.value = Math.asin(Math.max(-1, Math.min(1, sun.y / sun.length())));
  }
}
