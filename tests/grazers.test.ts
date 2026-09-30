import { afterEach, describe, expect, test } from "bun:test";
import * as THREE from "three";
import { GRAZER_RADIUS, Grazers } from "../src/scene/grazers";
import { clearGroundSegment, grazerPath, PLOT_RADIUS } from "../src/scene/grazers/navigation";

const herds: Grazers[] = [];
const flat = () => 0;
const make = (ground: (x: number, z: number) => number = flat, count = 1) => {
  const herd = new Grazers(ground, count);
  herds.push(herd);
  return herd;
};
afterEach(() => {
  for (const herd of herds) herd.dispose();
  herds.length = 0;
});

describe("lunar grazer routes", () => {
  test("a blocked browse route goes around the whole body clearance, not through the plot", () => {
    const from = { x: 0, z: 0 };
    const to = { x: 12, z: 0 };
    const obstacles = [{ x: 6, z: 0, r: 1.2 }];
    expect(clearGroundSegment(from, to, obstacles, flat)).toBe(false);
    const path = grazerPath(from, to, obstacles, flat);
    expect(path.length).toBeGreaterThan(1);
    expect(path.at(-1)).toEqual(to);
    let previous = from;
    for (const point of path) {
      expect(clearGroundSegment(previous, point, obstacles, flat)).toBe(true);
      previous = point;
    }
    expect(path).toEqual(grazerPath(from, to, obstacles, flat));
  });

  test("a narrow crater lip and an occupied destination are refused", () => {
    const from = { x: 0, z: 0 };
    const to = { x: 8, z: 0 };
    const lip = (x: number) => (x > 3 && x < 4 ? 2 : 0);
    expect(clearGroundSegment(from, to, [], lip)).toBe(false);
    expect(grazerPath(from, to, [{ ...to, r: 0.8 }], flat)).toEqual([]);
    expect(clearGroundSegment(from, to, [], (x) => x * 0.2)).toBe(true);
  });
});

describe("boulders with planted feet", () => {
  test("walks and crops lichen while each stance foot stays fixed in world space", () => {
    const ground = (x: number, z: number) => x * 0.03 - z * 0.02;
    const herd = make(ground);
    const initial = herd.snapshot();
    let previous = initial.grazers[0];
    let sawSwing = false;
    let sawCrop = false;
    let minimumSupports = 4;
    let maximumSlip = 0;
    let maximumGroundError = 0;
    let minimumAirClearance = Infinity;
    let minimumLichen = 1;
    for (let i = 0; i < 1800; i++) {
      herd.update(1 / 30);
      const snapshot = herd.snapshot();
      minimumLichen = Math.min(minimumLichen, ...snapshot.lichen.map((patch) => patch.amount));
      const grazer = snapshot.grazers[0];
      if (!grazer || !previous) throw new Error("Missing grazer");
      minimumSupports = Math.min(
        minimumSupports,
        grazer.feet.filter((foot) => foot.planted).length,
      );
      sawCrop ||= grazer.state === "crop" && grazer.headPitch > 0.7;
      for (const [k, foot] of grazer.feet.entries()) {
        const old = previous.feet[k];
        if (foot.planted) {
          maximumGroundError = Math.max(
            maximumGroundError,
            Math.abs(foot.y - ground(foot.x, foot.z)),
          );
          if (old?.planted)
            maximumSlip = Math.max(maximumSlip, Math.hypot(foot.x - old.x, foot.z - old.z));
        } else {
          sawSwing = true;
          minimumAirClearance = Math.min(minimumAirClearance, foot.y - ground(foot.x, foot.z));
        }
      }
      previous = grazer;
    }
    expect(sawSwing).toBe(true);
    expect(sawCrop).toBe(true);
    expect(minimumSupports).toBeGreaterThanOrEqual(3);
    expect(maximumSlip).toBe(0);
    expect(maximumGroundError).toBeLessThan(1e-10);
    expect(minimumAirClearance).toBeGreaterThanOrEqual(-1e-10);
    expect(minimumLichen).toBeLessThan(0.9);
    expect(
      Math.hypot(
        (previous?.x ?? 0) - (initial.grazers[0]?.x ?? 0),
        (previous?.z ?? 0) - (initial.grazers[0]?.z ?? 0),
      ),
    ).toBeGreaterThan(1);
  });

  test("a planted plot and machinery stay clear throughout an actual browse cycle", () => {
    const herd = make();
    const patch = herd.snapshot().lichen[0];
    if (!patch) throw new Error("Missing lichen");
    const plants = [{ x: patch.x, z: patch.z, growth: 0.5 }];
    const obstacles = [{ x: -34, z: -5, r: 0.7 }];
    const before = structuredClone(plants);
    let clearance = Infinity;
    let sawCrop = false;
    for (let i = 0; i < 2400; i++) {
      herd.update(1 / 30, { plants, obstacles });
      const snapshot = herd.snapshot();
      const grazer = snapshot.grazers[0];
      if (!grazer) throw new Error("Missing grazer");
      sawCrop ||= grazer.state === "crop";
      for (const circle of [{ ...plants[0], r: PLOT_RADIUS }, ...obstacles]) {
        if (circle.x === undefined || circle.z === undefined) throw new Error("Missing circle");
        clearance = Math.min(
          clearance,
          Math.hypot(grazer.x - circle.x, grazer.z - circle.z) - GRAZER_RADIUS - circle.r,
        );
      }
    }
    expect(clearance).toBeGreaterThanOrEqual(-1e-9);
    expect(sawCrop).toBe(true);
    expect(plants).toEqual(before);
    expect(herd.snapshot().lichen[0]?.amount).toBe(1);
  });

  test("cropping reaches crystal tips above the floor, including after a detour", () => {
    const ground = (x: number, z: number) => x * 0.03 - z * 0.02;
    for (const obstacles of [[], [{ x: -35.2, z: -6.1, r: 0.6 }]]) {
      const herd = make(ground);
      const jaw = herd.group.getObjectByName("grazer-1")?.getObjectByName("croppingJaw")
        ?.children[0];
      const tips = herd.group.getObjectByName("crystalLichenTips");
      if (!(jaw instanceof THREE.Mesh) || !(tips instanceof THREE.InstancedMesh))
        throw new Error("Missing grazing meshes");
      const positions = jaw.geometry.getAttribute("position");
      const crystalPositions = tips.geometry.getAttribute("position");
      const crystalTip = new THREE.Vector3(0, -Infinity, 0);
      for (let k = 0; k < crystalPositions.count; k++)
        if (crystalPositions.getY(k) > crystalTip.y)
          crystalTip.fromBufferAttribute(crystalPositions, k);
      const matrix = new THREE.Matrix4();
      const vertex = new THREE.Vector3();
      const tip = new THREE.Vector3();
      let closest = Infinity;
      let clearance = Infinity;
      let samples = 0;
      let facingError = 0;
      for (let i = 0; i < 1100; i++) {
        herd.update(1 / 30, { obstacles });
        const snapshot = herd.snapshot();
        const grazer = snapshot.grazers[0];
        if (grazer?.state !== "crop" || grazer.headPitch < 0.7) continue;
        const patch = snapshot.lichen[grazer.target];
        if (!patch) throw new Error("Missing browsed lichen");
        samples++;
        const angle = Math.atan2(patch.x - grazer.x, patch.z - grazer.z) - grazer.yaw;
        facingError = Math.max(facingError, Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))));
        for (let k = 0; k < positions.count; k++) {
          vertex.fromBufferAttribute(positions, k).applyMatrix4(jaw.matrixWorld);
          clearance = Math.min(clearance, vertex.y - ground(vertex.x, vertex.z));
          for (let j = 0; j < 7; j++) {
            tips.getMatrixAt(grazer.target * 7 + j, matrix);
            tip.copy(crystalTip).applyMatrix4(matrix);
            closest = Math.min(closest, vertex.distanceTo(tip));
          }
        }
      }
      expect(samples).toBeGreaterThan(20);
      expect(closest).toBeLessThan(0.12);
      expect(clearance).toBeGreaterThan(0.03);
      expect(facingError).toBeLessThan(0.021);
    }
  });

  test("live calm lands a swinging foot and pauses time, browsing and locomotion", () => {
    const herd = make();
    for (let i = 0; i < 120 && herd.snapshot().grazers[0]?.feet.every((foot) => foot.planted); i++)
      herd.update(1 / 30);
    expect(herd.snapshot().grazers[0]?.feet.some((foot) => !foot.planted)).toBe(true);
    herd.setMotion(true);
    const calm = herd.snapshot();
    expect(calm.grazers[0]?.feet.every((foot) => foot.planted && foot.y === 0)).toBe(true);
    for (let i = 0; i < 90; i++) herd.update(1 / 30);
    expect(herd.snapshot()).toEqual(calm);
    herd.update(1 / 30, { calm: false });
    expect(herd.snapshot().time).toBeGreaterThan(calm.time);
  });

  test("the gardener stops the herd and replay restores its contacts and lichen", () => {
    const herd = make();
    const initial = herd.snapshot();
    for (let i = 0; i < 400; i++) herd.update(1 / 30);
    const at = herd.snapshot().grazers[0];
    if (!at) throw new Error("Missing grazer");
    for (let i = 0; i < 150; i++) herd.update(1 / 30, { player: { x: at.x + 3.8, z: at.z } });
    expect(herd.snapshot().grazers[0]?.state).toBe("watch");
    expect(herd.snapshot().grazers[0]?.x).toBe(at.x);
    expect(herd.snapshot().grazers[0]?.z).toBe(at.z);
    herd.reset();
    expect(herd.snapshot()).toEqual(initial);
    const copy = herd.snapshot();
    if (copy.grazers[0]) copy.grazers[0].x = 10000;
    expect(herd.snapshot()).toEqual(initial);
  });
});

describe("grazer resource and frame budgets", () => {
  test("all frames reuse authored geometry and buffers; collision reads allocate nothing", () => {
    const herd = make(flat, 3);
    const geometries = new Set<THREE.BufferGeometry>();
    const positions = new Map<
      THREE.BufferGeometry,
      THREE.BufferAttribute | THREE.InterleavedBufferAttribute
    >();
    herd.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      positions.set(object.geometry, object.geometry.getAttribute("position"));
      expect([...object.geometry.getAttribute("position").array].every(Number.isFinite)).toBe(true);
    });
    const circles = herd.obstacles;
    for (let i = 0; i < 120; i++) herd.update(1 / 30, { obstacles: circles });
    expect(herd.obstacles).toBe(circles);
    expect(circles[0]?.x).toBe(herd.snapshot().grazers[0]?.x);
    herd.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      expect(geometries.has(object.geometry)).toBe(true);
      expect(object.geometry.getAttribute("position")).toBe(positions.get(object.geometry));
    });
    const budget = herd.diagnostics();
    expect(budget.drawCalls).toBeLessThanOrEqual(15);
    expect(budget.triangles).toBeLessThan(35000);
    expect(budget.geometries).toBeLessThanOrEqual(10);
    expect(budget.materials).toBe(4);
    expect(budget.textures).toBe(0);
    expect(budget.instances).toBeGreaterThan(150);
  });

  test("disposal owns shared geometry, materials and instance buffers exactly once", () => {
    const herd = make();
    const parent = new THREE.Group();
    parent.add(herd.group);
    const geometryEvents = new Map<THREE.BufferGeometry, number>();
    const materialEvents = new Map<THREE.Material, number>();
    const instanceEvents = new Map<THREE.InstancedMesh, number>();
    herd.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const geometry = object.geometry;
      if (!geometryEvents.has(geometry)) {
        geometryEvents.set(geometry, 0);
        geometry.addEventListener("dispose", () =>
          geometryEvents.set(geometry, (geometryEvents.get(geometry) ?? 0) + 1),
        );
      }
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (materialEvents.has(material)) continue;
        materialEvents.set(material, 0);
        material.addEventListener("dispose", () =>
          materialEvents.set(material, (materialEvents.get(material) ?? 0) + 1),
        );
      }
      if (object instanceof THREE.InstancedMesh) {
        instanceEvents.set(object, 0);
        object.addEventListener("dispose", () =>
          instanceEvents.set(object, (instanceEvents.get(object) ?? 0) + 1),
        );
      }
    });
    herd.dispose();
    herd.dispose();
    herd.update(1, { calm: false });
    herd.reset();
    expect([...geometryEvents.values()].every((n) => n === 1)).toBe(true);
    expect([...materialEvents.values()].every((n) => n === 1)).toBe(true);
    expect([...instanceEvents.values()].every((n) => n === 1)).toBe(true);
    expect(parent.children).toHaveLength(0);
    expect(herd.obstacles).toHaveLength(0);
    expect(herd.snapshot().grazers).toHaveLength(0);
    expect(herd.diagnostics().disposed).toBe(true);
  });
});
