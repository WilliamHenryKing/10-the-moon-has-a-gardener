import * as THREE from "three";
import type { PartMaterial } from "./suit-body";

// The suit's materials. The soft suit is woven orthofabric: off-white with the gardener's teal
// bands, darker in the bellows creases, a fine weave in the normal (in the bind pose, so it
// never swims), and lunar dust that climbs the boots and knees the longer you walk. The hard
// parts are fibreglass, anodised aluminium, a gold visor, rubberised gloves and boots.

export const suitUniforms = {
  /** 0 … 1: how much regolith has worked into the fabric. */
  uDust: { value: 0.15 },
};

const FABRIC_PARS = /* glsl */ `
  attribute vec4 region;
  varying vec4 vRegion;
  varying vec3 vBind;
`;
const FABRIC_VERTEX = /* glsl */ `
  #include <begin_vertex>
  vRegion = region;
  vBind = position;
`;
const FABRIC_FRAGMENT_PARS = /* glsl */ `
  uniform float uDust;
  varying vec4 vRegion;
  varying vec3 vBind;
`;
const FABRIC_COLOUR = /* glsl */ `
  #include <color_fragment>
  vec3 base = vec3(0.86, 0.85, 0.82);
  vec3 accent = vec3(0.1, 0.44, 0.41);
  vec3 c = mix(base, accent, vRegion.r);
  c *= 1.0 - vRegion.g * 0.35;
  vec3 regolith = vec3(0.34, 0.33, 0.31);
  c = mix(c, regolith, clamp(vRegion.a * uDust * 1.3, 0.0, 0.85));
  diffuseColor.rgb = c;
`;
// A fine weave: two crossed thread directions, as a bump on the normal.
const FABRIC_NORMAL = /* glsl */ `
  #include <normal_fragment_maps>
  {
    vec3 q = vBind * 2100.0;
    float w1 = sin(q.x + q.y * 0.7) * sin(q.z * 0.9 - q.y * 0.4);
    float w2 = sin(q.y * 1.3 - q.z * 0.5) * sin(q.x * 0.8 + q.z);
    float bump = (w1 + w2) * 0.5;
    vec3 dx = dFdx(vViewPosition);
    vec3 dy = dFdy(vViewPosition);
    float hx = dFdx(bump);
    float hy = dFdy(bump);
    vec3 r1 = cross(dy, normal);
    vec3 r2 = cross(normal, dx);
    float det = dot(dx, r1);
    vec3 grad = sign(det) * (hx * r1 + hy * r2);
    normal = normalize(abs(det) * normal - grad * 0.00035);
  }
`;

export function fabricMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.82,
    sheen: 0.45,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(0xffffff),
  });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, suitUniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${FABRIC_PARS}`)
      .replace("#include <begin_vertex>", FABRIC_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FABRIC_FRAGMENT_PARS}`)
      .replace("#include <color_fragment>", FABRIC_COLOUR)
      .replace("#include <normal_fragment_maps>", FABRIC_NORMAL);
  };
  return m;
}

/** The chest display: a small live readout, drawn into a canvas. */
export class ChestScreen {
  readonly canvas = document.createElement("canvas");
  readonly texture: THREE.CanvasTexture;
  constructor() {
    this.canvas.width = 256;
    this.canvas.height = 128;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.draw(0.2, 12);
  }
  draw(oxygen: number, seeds: number) {
    const g = this.canvas.getContext("2d");
    if (!g) return;
    g.fillStyle = "#031214";
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = "#1fd1b7";
    g.lineWidth = 3;
    g.strokeRect(10, 10, 236, 108);
    g.fillStyle = "#1fd1b7";
    g.font = "bold 26px ui-monospace, monospace";
    g.fillText(`O2 ${Math.round(oxygen * 100)}%`, 22, 52);
    g.fillRect(22, 66, 212 * oxygen, 12);
    g.globalAlpha = 0.35;
    g.fillRect(22 + 212 * oxygen, 66, 212 * (1 - oxygen), 12);
    g.globalAlpha = 1;
    g.font = "20px ui-monospace, monospace";
    g.fillText(`SEEDS ${seeds}`, 22, 106);
    this.texture.needsUpdate = true;
  }
}

export function partMaterials(screen: ChestScreen): Record<PartMaterial, THREE.Material> {
  return {
    shell: new THREE.MeshPhysicalMaterial({
      color: 0xf2f1ec,
      roughness: 0.34,
      clearcoat: 0.55,
      clearcoatRoughness: 0.22,
    }),
    metal: new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 1, roughness: 0.3 }),
    visor: new THREE.MeshPhysicalMaterial({
      color: 0xd6a54f,
      metalness: 1,
      roughness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
    }),
    glove: new THREE.MeshStandardMaterial({ color: 0x78838e, roughness: 0.74 }),
    boot: new THREE.MeshStandardMaterial({ color: 0xd4d1ca, roughness: 0.72 }),
    sole: new THREE.MeshStandardMaterial({ color: 0x393836, roughness: 0.92 }),
    pack: new THREE.MeshStandardMaterial({ color: 0xdcdad4, roughness: 0.5 }),
    screen: new THREE.MeshBasicMaterial({
      map: screen.texture,
      color: new THREE.Color(2.2, 2.2, 2.2),
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xe0f2ff,
      roughness: 0.06,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    }),
    seedA: new THREE.MeshStandardMaterial({ color: 0x74d27a, roughness: 0.6, emissive: 0x0f2a10 }),
    seedB: new THREE.MeshStandardMaterial({ color: 0xe2b248, roughness: 0.6, emissive: 0x2a1c05 }),
    seedC: new THREE.MeshStandardMaterial({ color: 0x6ea6ff, roughness: 0.6, emissive: 0x0a1630 }),
    lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.6, 4.6) }),
  };
}
