import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Plant } from "../../game/garden";
import { SPECIES_ORDER, type SpeciesId } from "../../game/species";
import { bell, blade, frond, merge, star, stem } from "./geometry";

// The garden as instanced parts: every species is a handful of part types (leaves, stems, fans,
// bells, fronds, petals), each drawn for every plant in one call. Each frame the plants' parts
// are posed from their growth:
// - leaves unfurl one after another and flowers burst open at bloom;
// - thirsty plants droop;
// - sunleaf fans turn to the Sun, glassfern fiddleheads uncurl and nightbells glow.
// A disc of dug regolith sits under each plant, darker while it is wet.

const MAX = 90;

interface PoseState {
  growth: number;
  /** 0 … 1 after blooming (with overshoot), for the flowers. */
  bloom: number;
  droop: number;
  time: number;
  /** Direction to the Sun's azimuth, radians, in the plant's own frame. */
  sunYaw: number;
}

type Pose = (o: THREE.Object3D, k: number, s: PoseState, r: (n: number) => number) => number;

interface PartDef {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  perPlant: number;
  shadow: boolean;
  /** Sets the part's local transform; returns its scale (0 hides it). */
  pose: Pose;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ramp = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const GOLDEN = 2.39996;

function leafMaterial(color: number, opts: THREE.MeshPhysicalMaterialParameters = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.62,
    side: THREE.DoubleSide,
    sheen: 0.4,
    sheenColor: new THREE.Color(0xffffff),
    sheenRoughness: 0.5,
    ...opts,
  });
}

function birchBark() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = "#e9e6de";
    g.fillRect(0, 0, 64, 256);
    let seed = 3;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(30,28,26,${0.5 + rand() * 0.4})`;
      g.fillRect(rand() * 64, rand() * 256, 6 + rand() * 18, 1 + rand() * 2.5);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A sprig of birch leaves: six small leaves round a twig, for dense foliage in few instances. */
function leafCluster() {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const leaf = blade(0.11, 0.075, { curl: 0.5, cup: 0.3, segs: 3 });
    leaf.rotateX(0.6 + (i % 2) * 0.4);
    leaf.rotateY(i * 1.05);
    leaf.translate(Math.sin(i * 1.05) * 0.03, i * 0.02, Math.cos(i * 1.05) * 0.03);
    parts.push(leaf);
  }
  return merge(parts);
}

// ---- the species -----------------------------------------------------------------------------------
function speciesParts(id: SpeciesId): PartDef[] {
  switch (id) {
    case "mooncress": {
      const leaf = blade(0.19, 0.1, {
        curl: 1.1,
        cup: 0.5,
        segs: 6,
        shape: (t) => Math.sin(Math.PI * t) ** 0.55,
      });
      return [
        {
          geometry: leaf,
          material: leafMaterial(0x93b4a3, { sheen: 0.9, sheenColor: new THREE.Color(0xe8fff6) }),
          perPlant: 26,
          shadow: true,
          pose: (o, k, s, r) => {
            const ring = k < 8 ? 0 : k < 17 ? 1 : 2;
            const appear = ramp(k / 30, k / 30 + 0.2, s.growth);
            const a = k * GOLDEN + r(1) * 6;
            const rad = [0.03, 0.11, 0.19][ring] as number;
            o.position.set(Math.cos(a) * rad, 0.015 + (2 - ring) * 0.035, Math.sin(a) * rad);
            o.rotation.set(0.5 + ring * 0.45 + s.droop * 0.6, -a + Math.PI / 2, 0, "YXZ");
            return appear * (0.8 + 0.4 * r(k + 3)) * (1 + ring * 0.2);
          },
        },
        {
          geometry: star(0.035),
          material: new THREE.MeshStandardMaterial({
            color: 0xf6f3ea,
            roughness: 0.5,
            emissive: 0x2a2a24,
          }),
          perPlant: 7,
          shadow: false,
          pose: (o, k, s, r) => {
            const a = k * GOLDEN * 1.7 + r(2) * 6;
            const rad = 0.05 + (k % 3) * 0.055;
            o.position.set(Math.cos(a) * rad, 0.13 + r(k) * 0.03, Math.sin(a) * rad);
            o.rotation.set(r(k + 9) * 0.4 - 0.2, a, 0);
            return s.bloom * (0.8 + r(k + 11) * 0.5);
          },
        },
      ];
    }
    case "sunleaf": {
      const paddle = blade(0.78, 0.2, {
        curl: 0.25,
        cup: 0.35,
        segs: 10,
        pleats: 3,
        shape: (t) => Math.min(1, t * 3) ** 0.7 * (1 - 0.6 * t ** 4),
      });
      return [
        {
          geometry: stem(0.34, 0.05, 0.03),
          material: new THREE.MeshStandardMaterial({ color: 0x6b5a33, roughness: 0.7 }),
          perPlant: 1,
          shadow: true,
          pose: (o, _k, s) => {
            o.rotation.set(0, 0, 0);
            return ramp(0, 0.2, s.growth) * (0.5 + 0.5 * s.growth);
          },
        },
        {
          geometry: paddle,
          material: leafMaterial(0xc79b44, {
            roughness: 0.48,
            sheen: 0.8,
            sheenColor: new THREE.Color(0xfff0c0),
          }),
          perPlant: 7,
          shadow: true,
          pose: (o, k, s, r) => {
            const appear = ramp(0.05 + k * 0.1, 0.3 + k * 0.1, s.growth);
            // Spread within the fan's plane; the plane turns to face the Sun and leans back.
            const spread = (k - 3) * 0.36 + (r(k) - 0.5) * 0.1;
            o.position.set(0, 0.32 * (0.5 + 0.5 * s.growth), 0);
            o.rotation.set(-0.18 + s.droop * 0.6, s.sunYaw, spread * (1 + s.droop * 0.3), "YXZ");
            return appear * (0.85 + r(k + 4) * 0.25);
          },
        },
        {
          geometry: stem(0.26, 0.035, 0.004),
          material: new THREE.MeshStandardMaterial({
            color: 0xffa92e,
            roughness: 0.4,
            emissive: 0x7a3a00,
          }),
          perPlant: 3,
          shadow: false,
          pose: (o, k, s) => {
            o.position.set((k - 1) * 0.05, 0.3, 0.03);
            o.rotation.set(0.25, s.sunYaw, (k - 1) * 0.3, "YXZ");
            return s.bloom * (1 - Math.abs(k - 1) * 0.25);
          },
        },
      ];
    }
    case "nightbell": {
      return [
        {
          geometry: stem(0.5, 0.01, 0.005, 0.18),
          material: new THREE.MeshStandardMaterial({ color: 0x3b3159, roughness: 0.6 }),
          perPlant: 5,
          shadow: true,
          pose: (o, k, s, r) => {
            const a = k * GOLDEN + r(1) * 6;
            o.position.set(Math.cos(a) * 0.03, 0, Math.sin(a) * 0.03);
            o.rotation.set(0.15 + s.droop * 0.3, a + Math.PI / 2, 0, "YXZ");
            return ramp(0.1 + k * 0.1, 0.5 + k * 0.08, s.growth) * (0.7 + r(k) * 0.4);
          },
        },
        {
          geometry: bell(0.05, 0.075),
          material: new THREE.MeshStandardMaterial({
            color: 0x6a5cd6,
            roughness: 0.35,
            emissive: 0x6f63ff,
            emissiveIntensity: 1.6,
            side: THREE.DoubleSide,
          }),
          perPlant: 5,
          shadow: false,
          pose: (o, k, s, r) => {
            const a = k * GOLDEN + r(1) * 6;
            const h = 0.5 * (0.7 + r(k) * 0.4);
            const reach = 0.18 * (0.7 + r(k) * 0.4);
            o.position.set(Math.cos(a) * (0.03 + reach), h * 0.93, Math.sin(a) * (0.03 + reach));
            o.rotation.set(0, 0, 0);
            const bud = ramp(0.55 + k * 0.06, 0.8 + k * 0.04, s.growth);
            return bud * (0.45 + 0.55 * s.bloom) * (1 + Math.sin(s.time * 1.3 + k) * 0.03);
          },
        },
        {
          geometry: blade(0.22, 0.05, { curl: 0.7, cup: 0.4, segs: 5 }),
          material: leafMaterial(0x2f3b4e),
          perPlant: 6,
          shadow: true,
          pose: (o, k, s, r) => {
            const a = k * 1.05 + r(3) * 6;
            o.position.set(0, 0, 0);
            o.rotation.set(0.9 + s.droop * 0.4, a, 0, "YXZ");
            return ramp(k * 0.05, 0.3 + k * 0.05, s.growth);
          },
        },
      ];
    }
    case "glassfern": {
      const fern = frond(0.8, 0.22);
      const mat = leafMaterial(0x7fe3d4, {
        transparent: true,
        opacity: 0.82,
        emissive: 0x1d6a64,
        emissiveIntensity: 0.6,
        roughness: 0.25,
        sheen: 0.8,
        sheenColor: new THREE.Color(0xc8fff6),
      });
      // Fiddleheads: each frond starts coiled and unrolls as the plant grows (per-instance curl).
      // The rachis bends at constant curvature toward +Z; leaflets ride the bent frame.
      const coil = /* glsl */ `
        float fernT = clamp(position.y / 0.8, 0.0, 1.0);
        float fernA = aCurl * 9.0 * fernT;
      `;
      mat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nattribute float aCurl;")
          .replace(
            "#include <beginnormal_vertex>",
            `#include <beginnormal_vertex>
            ${coil}
            objectNormal = vec3(objectNormal.x, objectNormal.y * cos(fernA) - objectNormal.z * sin(fernA), objectNormal.y * sin(fernA) + objectNormal.z * cos(fernA));`,
          )
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
            if (aCurl > 0.001) {
              float fernR = 0.8 / (aCurl * 9.0);
              vec3 fernC = vec3(0.0, fernR * sin(fernA), fernR * (1.0 - cos(fernA)));
              vec3 fernN = vec3(0.0, -sin(fernA), cos(fernA));
              transformed = fernC + vec3(transformed.x, 0.0, 0.0) + fernN * transformed.z;
            }`,
          );
      };
      return [
        {
          geometry: fern,
          material: mat,
          perPlant: 7,
          shadow: true,
          pose: (o, k, s, r) => {
            const a = k * ((Math.PI * 2) / 7) + r(1) * 6;
            o.position.set(0, 0, 0);
            o.rotation.set(0.55 + s.droop * 0.5 + r(k) * 0.2, a, 0, "YXZ");
            return ramp(k * 0.06, 0.25 + k * 0.06, s.growth) * (0.75 + 0.35 * r(k + 5));
          },
        },
      ];
    }
    case "craterbloom": {
      const petal = blade(0.42, 0.14, { curl: -1.5, cup: 0.4, segs: 7 });
      return [
        {
          geometry: blade(0.62, 0.12, {
            curl: 0.35,
            cup: 0.55,
            segs: 7,
            shape: (t) => (1 - t) ** 0.7,
          }),
          material: leafMaterial(0x5d7d56, { sheen: 0.2 }),
          perPlant: 9,
          shadow: true,
          pose: (o, k, s, r) => {
            const a = k * GOLDEN + r(1) * 6;
            o.position.set(0, 0, 0);
            o.rotation.set(0.5 + s.droop * 0.5 + (k % 3) * 0.12, a, 0, "YXZ");
            return ramp(k * 0.04, 0.25 + k * 0.04, s.growth) * (0.7 + r(k) * 0.4);
          },
        },
        {
          geometry: stem(1.5, 0.03, 0.018, 0.08),
          material: new THREE.MeshStandardMaterial({ color: 0x4f6a3f, roughness: 0.6 }),
          perPlant: 1,
          shadow: true,
          pose: (o, _k, s) => {
            o.position.set(0, 0, 0);
            o.rotation.set(0, 0, 0);
            return ramp(0.35, 0.95, s.growth);
          },
        },
        {
          geometry: petal,
          material: leafMaterial(0xff6f6f, {
            sheen: 0.8,
            sheenColor: new THREE.Color(0xffd0c8),
            emissive: 0x3a0808,
          }),
          perPlant: 22,
          shadow: false,
          pose: (o, k, s, r) => {
            const a = k * GOLDEN;
            const lift = k < 11 ? 0 : 0.04;
            o.position.set(
              0,
              1.5 * ramp(0.35, 0.95, s.growth) + lift,
              0.08 * ramp(0.35, 0.95, s.growth),
            );
            o.rotation.set(-0.2 - (k < 11 ? 0.45 : 0) + (1 - s.bloom) * -1.1, a, 0, "YXZ");
            return Math.max(0.25 * ramp(0.8, 1, s.growth), s.bloom) * (0.85 + r(k) * 0.3);
          },
        },
      ];
    }
    case "birch": {
      const bark = new THREE.MeshStandardMaterial({ map: birchBark(), roughness: 0.75 });
      return [
        {
          geometry: stem(3.4, 0.09, 0.025, 0.12, 10),
          material: bark,
          perPlant: 1,
          shadow: true,
          pose: (o, _k, s) => {
            o.position.set(0, 0, 0);
            o.rotation.set(0, 0, 0);
            return 0.18 + 0.82 * s.growth;
          },
        },
        {
          geometry: stem(1.1, 0.025, 0.006, 0.25),
          material: bark,
          perPlant: 10,
          shadow: true,
          pose: (o, k, s, r) => {
            const h = (0.35 + (k / 10) * 0.55) * 3.4 * (0.18 + 0.82 * s.growth);
            o.position.set(0, h, 0);
            o.rotation.set(0.9 - (k / 10) * 0.35, k * GOLDEN + r(2) * 6, 0, "YXZ");
            return ramp(0.15 + k * 0.03, 0.5 + k * 0.03, s.growth) * (1.1 - k * 0.05);
          },
        },
        {
          geometry: leafCluster(),
          material: leafMaterial(0x86b64d, { sheen: 0.3 }),
          perPlant: 90,
          shadow: true,
          pose: (o, k, s, r) => {
            const branch = k % 10;
            const h = (0.35 + (branch / 10) * 0.55) * 3.4 * (0.18 + 0.82 * s.growth);
            const ba = branch * GOLDEN + r(2) * 6;
            const reach = (0.2 + r(k) * 0.95) * (1.1 - branch * 0.05) * ramp(0.15, 0.6, s.growth);
            const dir = new THREE.Vector3(Math.sin(ba), 0.5, Math.cos(ba)).normalize();
            o.position.set(
              dir.x * reach + (r(k + 1) - 0.5) * 0.25,
              h + dir.y * reach + (r(k + 2) - 0.5) * 0.25,
              dir.z * reach + (r(k + 3) - 0.5) * 0.25,
            );
            o.rotation.set(r(k + 4) * 3, r(k + 5) * 6, r(k + 6) * 3);
            return (
              ramp(0.3 + (k / 90) * 0.4, 0.5 + (k / 90) * 0.45, s.growth) * (0.8 + r(k + 7) * 0.5)
            );
          },
        },
      ];
    }
    case "orchid": {
      return [
        {
          geometry: stem(0.45, 0.012, 0.006, 0.1),
          material: new THREE.MeshStandardMaterial({ color: 0x9d8fb8, roughness: 0.5 }),
          perPlant: 3,
          shadow: true,
          pose: (o, k, s) => {
            o.position.set(0, 0, 0);
            o.rotation.set(0.1, k * 2.1, 0, "YXZ");
            return ramp(0, 0.5, s.growth);
          },
        },
        {
          geometry: blade(0.12, 0.08, { curl: -0.8, cup: 0.4, segs: 5 }),
          material: leafMaterial(0xf1e6ff, {
            emissive: 0x9c7cff,
            emissiveIntensity: 1.2,
            sheen: 1,
          }),
          perPlant: 18,
          shadow: false,
          pose: (o, k, s, r) => {
            const flower = Math.floor(k / 6);
            const a = flower * 2.1;
            const p = (k % 6) * ((Math.PI * 2) / 6);
            o.position.set(Math.sin(a) * 0.1, 0.44 + flower * 0.05, Math.cos(a) * 0.1 + 0.02);
            o.rotation.set(-0.6 + (1 - s.bloom) * -1, p, 0, "YXZ");
            return Math.max(0.2 * s.growth, s.bloom) * (0.8 + r(k) * 0.3);
          },
        },
      ];
    }
  }
}

// ---- the renderer --------------------------------------------------------------------------------
class SpeciesView {
  readonly meshes: THREE.InstancedMesh[] = [];
  private curls: THREE.InstancedBufferAttribute[] = [];

  constructor(
    readonly id: SpeciesId,
    private parts: PartDef[],
  ) {
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, MAX * part.perPlant);
      mesh.count = 0;
      mesh.castShadow = part.shadow;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      if (id === "glassfern") {
        const attr = new THREE.InstancedBufferAttribute(new Float32Array(MAX * part.perPlant), 1);
        attr.setUsage(THREE.DynamicDrawUsage);
        part.geometry.setAttribute("aCurl", attr);
        this.curls.push(attr);
      }
      this.meshes.push(mesh);
    }
  }

  private dummy = new THREE.Object3D();
  private base = new THREE.Matrix4();
  private local = new THREE.Matrix4();

  update(plants: { plant: Plant; state: PoseState; matrix: THREE.Matrix4; seed: number }[]) {
    this.parts.forEach((part, pi) => {
      const mesh = this.meshes[pi] as THREE.InstancedMesh;
      let n = 0;
      for (const { state, matrix, seed } of plants) {
        const r = (k: number) => {
          const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
          return x - Math.floor(x);
        };
        for (let k = 0; k < part.perPlant; k++) {
          const d = this.dummy;
          d.position.set(0, 0, 0);
          d.rotation.set(0, 0, 0);
          const scale = part.pose(d, k, state, r);
          d.scale.setScalar(Math.max(0, scale));
          d.updateMatrix();
          this.local.copy(d.matrix);
          this.base.multiplyMatrices(matrix, this.local);
          mesh.setMatrixAt(n, this.base);
          if (this.id === "glassfern")
            (this.curls[pi] as THREE.InstancedBufferAttribute).setX(
              n,
              Math.max(0, 1 - state.growth / 0.8),
            );
          n++;
        }
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (this.id === "glassfern")
        (this.curls[pi] as THREE.InstancedBufferAttribute).needsUpdate = true;
    });
  }
}

interface Live {
  growth: number;
  bloomT: number;
  seed: number;
}

const smooth01 = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class GardenView {
  readonly group = new THREE.Group();
  private views = new Map<SpeciesId, SpeciesView>();
  private live = new Map<number, Live>();
  private soil: THREE.InstancedMesh;
  private matrix = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);
  private time = 0;
  private colour = new THREE.Color();
  /** The first two leaves, shown until the species' own shoots take over. */
  private sprout: THREE.InstancedMesh;

  constructor(private ground: (x: number, z: number) => number) {
    for (const id of SPECIES_ORDER) {
      const v = new SpeciesView(id, speciesParts(id));
      this.views.set(id, v);
      this.group.add(...v.meshes);
    }
    const disc = new THREE.CircleGeometry(0.42, 24);
    disc.rotateX(-Math.PI / 2);
    const fade = document.createElement("canvas");
    fade.width = fade.height = 64;
    const g = fade.getContext("2d");
    if (g) {
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "#fff");
      grad.addColorStop(0.55, "#bbb");
      grad.addColorStop(1, "#000");
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
    this.soil = new THREE.InstancedMesh(
      disc,
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.95,
        alphaMap: new THREE.CanvasTexture(fade),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
      MAX * 7,
    );
    this.soil.count = 0;
    this.soil.receiveShadow = true;
    this.soil.frustumCulled = false;
    this.group.add(this.soil);
    const stem = new THREE.CylinderGeometry(0.006, 0.009, 0.09, 5);
    stem.translate(0, 0.045, 0);
    const leaf = new THREE.SphereGeometry(1, 8, 4);
    leaf.scale(0.034, 0.007, 0.017);
    const left = leaf.clone().translate(0.031, 0.09, 0);
    const right = leaf.clone().translate(-0.031, 0.092, 0);
    const parts = [stem, left, right].map((g) => g.toNonIndexed());
    for (const g of parts) g.deleteAttribute("uv");
    this.sprout = new THREE.InstancedMesh(
      mergeGeometries(parts) ?? stem,
      new THREE.MeshStandardMaterial({
        color: 0x9be6a8,
        roughness: 0.55,
        emissive: 0x123f22,
        emissiveIntensity: 0.5,
      }),
      MAX * 7,
    );
    this.sprout.count = 0;
    this.sprout.castShadow = true;
    this.sprout.frustumCulled = false;
    this.group.add(this.sprout);
  }

  update(plants: readonly Plant[], dt: number, sunAzimuth: number) {
    this.time += dt;
    const bySpecies = new Map<
      SpeciesId,
      { plant: Plant; state: PoseState; matrix: THREE.Matrix4; seed: number }[]
    >();
    let s = 0;
    let sprouts = 0;
    for (const p of plants) {
      let l = this.live.get(p.id);
      if (!l) {
        l = { growth: 0, bloomT: 0, seed: (p.id * 7.13 + p.x * 3.1 + p.z * 1.7) % 97 };
        this.live.set(p.id, l);
      }
      l.growth += (p.growth - l.growth) * Math.min(1, dt * 1.5 + (dt === 0 ? 1 : 0));
      if (p.growth >= 1) l.bloomT = Math.min(1.6, l.bloomT + dt);
      // A bloom pops open with a small overshoot.
      const b = l.bloomT / 1.2;
      const bloom = b >= 1 ? 1 : b <= 0 ? 0 : 1 + Math.sin(b * Math.PI) * 0.18 * b - (1 - b) ** 2;
      const yaw = (l.seed * 0.618) % (Math.PI * 2);
      const y = this.ground(p.x, p.z);
      this.q.setFromAxisAngle(this.up, yaw);
      const size = 0.9 + ((l.seed * 0.37) % 1) * 0.25;
      const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(p.x, y, p.z),
        this.q,
        new THREE.Vector3(size, size, size),
      );
      const state: PoseState = {
        growth: Math.max(0.02, l.growth),
        bloom: Math.max(0, bloom),
        droop: p.water <= 0 && p.growth > 0.05 ? 1 : 0,
        time: this.time,
        sunYaw: -((sunAzimuth * Math.PI) / 180) - yaw + Math.PI,
      };
      const list = bySpecies.get(p.species) ?? [];
      list.push({ plant: p, state, matrix, seed: l.seed });
      bySpecies.set(p.species, list);
      // The soil disc: darker and a little glossy while wet.
      this.matrix.compose(
        new THREE.Vector3(p.x, y + 0.012, p.z),
        this.q,
        new THREE.Vector3(1, 1, 1),
      );
      this.soil.setMatrixAt(s, this.matrix);
      this.colour.setRGB(0.1, 0.098, 0.094).multiplyScalar(p.water > 0 ? 0.55 : 1.4);
      this.soil.setColorAt(s, this.colour);
      s++;
      if (l.growth < 0.3) {
        const k = (1 - smooth01(0.1, 0.3, l.growth)) * (1 + l.growth * 3) * 2.2;
        this.matrix.compose(new THREE.Vector3(p.x, y, p.z), this.q, new THREE.Vector3(k, k, k));
        this.sprout.setMatrixAt(sprouts++, this.matrix);
      }
    }
    for (const [id, v] of this.views) v.update(bySpecies.get(id) ?? []);
    this.soil.count = s;
    this.sprout.count = sprouts;
    this.sprout.instanceMatrix.needsUpdate = true;
    this.soil.instanceMatrix.needsUpdate = true;
    if (this.soil.instanceColor) this.soil.instanceColor.needsUpdate = true;
    for (const id of this.live.keys()) if (!plants.some((p) => p.id === id)) this.live.delete(id);
  }
}
