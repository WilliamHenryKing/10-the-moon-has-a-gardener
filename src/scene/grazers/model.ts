import * as THREE from "three";

/** Weathered, lopsided carapaces; albedo is linear and comparable to the lunar highlands. */
function rock(seed: number, width = 36, height = 22) {
  const geometry = new THREE.SphereGeometry(1, width, height);
  const positions = geometry.getAttribute("position");
  const colours = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const ridge =
      Math.sin(x * 5.2 + y * 3.1 + seed) * 0.1 + Math.cos(z * 7.3 - y * 4.8 + seed * 2) * 0.055;
    const pits = Math.sin(x * 19 + z * 11 + seed) * Math.cos(y * 17 - z * 9) * 0.018;
    const scale = 1 + ridge + pits;
    const crown = Math.exp(-((x + 0.26) ** 2 + (z + 0.18) ** 2) * 6) * Math.max(0, y) * 0.16;
    positions.setXYZ(
      i,
      x * 1.08 * scale * (1 + z * 0.09) + y * y * 0.045,
      (y > -0.4 ? y * 0.72 : -0.288 + (y + 0.4) * 0.36) * scale + crown,
      z * 1.34 * scale + x * y * 0.09,
    );
    const vein = Math.abs(Math.sin(y * 12 + x * 2.7 + z * 3 + seed));
    const albedo = 0.16 + (ridge + 0.16) * 0.2 + vein ** 18 * 0.035;
    colours[i * 3] = albedo * (1.02 + z * 0.025);
    colours[i * 3 + 1] = albedo;
    colours[i * 3 + 2] = albedo * (0.97 - z * 0.02);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function crystal() {
  const positions: number[] = [];
  const colours: number[] = [];
  const rings = [0, 0.52, 0.86, 1];
  const radii = [0.055, 0.095, 0.062, 0];
  const sides = 5;
  const point = (row: number, side: number) => {
    const a = (side / sides) * Math.PI * 2;
    const y = rings[row] as number;
    return [
      Math.cos(a) * (radii[row] as number) + y * 0.04,
      y,
      Math.sin(a) * (radii[row] as number),
    ];
  };
  for (let r = 0; r < rings.length - 1; r++)
    for (let i = 0; i < sides; i++) {
      const a = point(r, i);
      const b = point(r, i + 1);
      const c = point(r + 1, i);
      const d = point(r + 1, i + 1);
      const vertices = r === rings.length - 2 ? [a, c, b] : [a, c, b, b, c, d];
      for (const p of vertices) {
        positions.push(...p);
        const light = 0.66 + (i % 3) * 0.13;
        colours.push(0.28 * light, 0.55 * light, 0.6 * light);
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function stoneMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
  });
  // Close-up grains and shallow erosion, without textures or another draw pass.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec3 vGrazerRock;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\n vGrazerRock = position;",
    );
    shader.fragmentShader = `
      varying vec3 vGrazerRock;
      float grazerGrain(vec3 p) { return fract(sin(dot(p, vec3(27.17, 91.7, 12.41))) * 43758.5453); }
      ${shader.fragmentShader}`.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
        float grazerNear = 1.0 - smoothstep(12.0, 40.0, length(vViewPosition));
        float grazerGrainValue = grazerGrain(floor(vGrazerRock * 110.0));
        diffuseColor.rgb *= mix(1.0, 0.89 + grazerGrainValue * 0.22, grazerNear);`,
    );
  };
  material.customProgramCacheKey = () => "lunar-grazer-stone-grain-v1";
  return material;
}

export interface GrazerModel {
  root: THREE.Group;
  head: THREE.Group;
  jaw: THREE.Group;
}

/** All repeated articulated parts and lichen are batched across the herd. */
export class GrazerModels {
  readonly group = new THREE.Group();
  readonly bodies: GrazerModel[] = [];
  readonly links: THREE.InstancedMesh;
  readonly joints: THREE.InstancedMesh;
  readonly feet: THREE.InstancedMesh;
  readonly eyes: THREE.InstancedMesh;
  readonly crust: THREE.InstancedMesh;
  readonly lichen: THREE.InstancedMesh;
  readonly geometries = new Set<THREE.BufferGeometry>();
  readonly materials = new Set<THREE.Material>();
  private instances: THREE.InstancedMesh[] = [];
  private disposed = false;

  constructor(count: number, patches: number) {
    const stone = stoneMaterial();
    const membrane = new THREE.MeshStandardMaterial({
      color: 0x282d30,
      roughness: 0.78,
      metalness: 0.05,
    });
    const mineral = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.32,
      metalness: 0.12,
      emissive: 0x335652,
      emissiveIntensity: 0.18,
    });
    const eye = new THREE.MeshStandardMaterial({
      color: 0x8ebdb1,
      roughness: 0.25,
      emissive: 0x47675f,
      emissiveIntensity: 0.45,
    });
    for (const material of [stone, membrane, mineral, eye]) this.materials.add(material);
    const own = <T extends THREE.BufferGeometry>(geometry: T) => {
      this.geometries.add(geometry);
      return geometry;
    };
    const headGeo = own(rock(29, 24, 14));
    const footGeo = own(rock(12, 18, 10));
    footGeo.scale(0.24, 0.19, 0.29);
    footGeo.computeBoundingBox();
    footGeo.translate(0, -(footGeo.boundingBox?.min.y ?? 0), 0);
    footGeo.computeBoundingSphere();
    for (let i = 0; i < count; i++) {
      const root = new THREE.Group();
      root.name = `grazer-${i + 1}`;
      const shell = new THREE.Mesh(own(rock(7 + i * 5)), stone);
      shell.name = "weatheredCarapace";
      shell.scale.set(1 + (i % 2) * 0.09, 1 + (i % 3) * 0.035, 1 - (i % 2) * 0.06);
      const head = new THREE.Group();
      head.name = "browsingNeck";
      head.position.set(0, -0.36, 0.83);
      const face = new THREE.Mesh(headGeo, stone);
      face.scale.set(0.39, 0.53, 0.49);
      face.position.set(0, -0.05, 0.4);
      const jaw = new THREE.Group();
      jaw.name = "croppingJaw";
      jaw.position.set(0, -0.27, 0.7);
      const mandible = new THREE.Mesh(footGeo, stone);
      mandible.scale.set(1.25, 0.8, 1.08);
      jaw.add(mandible);
      head.add(face, jaw);
      root.add(shell, head);
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) object.castShadow = object.receiveShadow = true;
      });
      this.bodies.push({ root, head, jaw });
      this.group.add(root);
    }
    const batch = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      n: number,
      shadow = true,
    ) => {
      const mesh = new THREE.InstancedMesh(geometry, material, n);
      mesh.count = n;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      this.instances.push(mesh);
      this.group.add(mesh);
      return mesh;
    };
    // Tapered rock armour rides over the charcoal articulations.
    const links = own(new THREE.CylinderGeometry(0.75, 1, 1, 10));
    links.setAttribute(
      "color",
      new THREE.BufferAttribute(
        new Float32Array(links.getAttribute("position").count * 3).fill(0.19),
        3,
      ),
    );
    this.links = batch(links, stone, count * 8);
    this.joints = batch(own(new THREE.SphereGeometry(1, 12, 8)), membrane, count * 12);
    this.feet = batch(footGeo, stone, count * 4);
    this.eyes = batch(own(new THREE.IcosahedronGeometry(0.052, 1)), eye, count * 2, false);
    this.crust = batch(own(rock(11, 12, 8)), stone, patches, false);
    this.lichen = batch(own(crystal()), mineral, patches * 7, false);
    this.crust.name = "crystalLichenCrust";
    this.lichen.name = "crystalLichenTips";
  }

  commit() {
    for (const mesh of this.instances) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }

  diagnostics() {
    let triangles = 0;
    let calls = 0;
    let instances = 0;
    this.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const n = object instanceof THREE.InstancedMesh ? object.count : 1;
      if (object instanceof THREE.InstancedMesh) instances += n;
      triangles +=
        ((object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3) * n;
      if (n > 0) calls++;
    });
    return {
      drawCalls: calls,
      triangles,
      geometries: this.geometries.size,
      materials: this.materials.size,
      instances,
      textures: 0,
      disposed: this.disposed,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    this.group.clear();
    for (const mesh of this.instances) mesh.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.geometries.clear();
    this.materials.clear();
    this.bodies.length = this.instances.length = 0;
  }
}
