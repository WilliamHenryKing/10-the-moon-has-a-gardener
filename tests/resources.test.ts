import { expect, test } from "bun:test";
import * as THREE from "three";
import { Ground } from "../src/engine/ground";
import { Assets, disposeObject, workerResult } from "../src/engine/resources";
import type { Terrain } from "../src/world/terrain";

test("ground teardown releases visited LODs even after their meshes switch away", () => {
  const terrain = {
    half: 50,
    heightAt: () => 0,
    normalAt: (_x: number, _z: number, out: { x: number; y: number; z: number }) =>
      Object.assign(out, { x: 0, y: 1, z: 0 }),
  } as unknown as Terrain;
  const material = new THREE.MeshBasicMaterial();
  let materialDisposals = 0;
  material.addEventListener("dispose", () => materialDisposals++);
  const ground = new Ground(terrain, material, 1);
  const parent = new THREE.Group();
  parent.add(ground.group);
  const visited = new Map<THREE.BufferGeometry, number>();
  const record = () =>
    ground.group.traverse((object) => {
      if (object instanceof THREE.Mesh && !visited.has(object.geometry)) {
        const geometry = object.geometry as THREE.BufferGeometry;
        visited.set(geometry, 0);
        geometry.addEventListener("dispose", () =>
          visited.set(geometry, (visited.get(geometry) ?? 0) + 1),
        );
      }
    });
  record();
  const initialCount = visited.size;
  for (const x of [0, 75, 140, 350]) {
    ground.update(new THREE.Vector3(x, 2, 0));
    record();
  }
  expect(visited.size).toBeGreaterThan(initialCount);
  ground.dispose();
  ground.dispose();
  ground.update(new THREE.Vector3());
  expect([...visited.values()].every((count) => count === 1)).toBe(true);
  expect(materialDisposals).toBe(1);
  expect(parent.children).toHaveLength(0);
  expect(ground.group.children).toHaveLength(0);
});

test("teardown releases shared geometry, shader textures and materials once", () => {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  const texture = new THREE.Texture();
  const material = new THREE.ShaderMaterial({ uniforms: { map: { value: texture } } });
  group.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  const disposed = { geometry: 0, material: 0, texture: 0 };
  geometry.addEventListener("dispose", () => disposed.geometry++);
  material.addEventListener("dispose", () => disposed.material++);
  texture.addEventListener("dispose", () => disposed.texture++);
  disposeObject(group);
  disposeObject(group);
  expect(disposed).toEqual({ geometry: 1, material: 1, texture: 1 });
  expect(group.children).toHaveLength(0);
});

test("canceled asset owner rejects late ownership and is idempotent", () => {
  const parent = new AbortController();
  const assets = new Assets(parent.signal);
  let disposed = 0;
  assets.own({ dispose: () => disposed++ });
  parent.abort();
  assets.dispose();
  expect(assets.signal.aborted).toBe(true);
  expect(disposed).toBe(1);
  assets.own({ dispose: () => disposed++ });
  expect(disposed).toBe(2);
});

test("worker cancellation terminates and detaches every completion handler", async () => {
  let terminated = 0;
  const fake = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage() {},
    terminate() {
      terminated++;
    },
  };
  const cancel = new AbortController();
  const result = workerResult(fake as unknown as Worker, null, cancel.signal);
  cancel.abort();
  await expect(result).rejects.toThrow();
  expect(terminated).toBe(1);
  expect(fake.onmessage).toBeNull();
  expect(fake.onerror).toBeNull();
  expect(fake.onmessageerror).toBeNull();
});
