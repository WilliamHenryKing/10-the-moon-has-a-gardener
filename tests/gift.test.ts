import { expect, test } from "bun:test";
import { createGarden, plant, step, water } from "../src/game/garden";
import { BOUNDARY } from "../src/game/player";
import { nextAction, perform } from "../src/game/session";
import { GIFT_CLEARANCE, giftSpot } from "../src/scene/gift-placement";
import { Lanternfolk } from "../src/scene/lanternfolk";
import { rulesTerrain } from "./garden-route";

const flat = {
  heightAt: () => 0,
  normalAt: (_x: number, _z: number, out: { x: number; y: number; z: number }) =>
    Object.assign(out, { x: 0, y: 1, z: 0 }),
};
const blooms = [
  { x: 18, z: -2 },
  { x: 21, z: -2 },
  { x: 24, z: -2 },
];

test("a real thriving garden whose centroid lies inside the dome still gets collectable orchid seeds", () => {
  const ground = rulesTerrain();
  const garden = createGarden();
  for (const [x, z] of [
    [-5, -26],
    [12.32, 4],
    [-22.32, 4],
  ]) {
    const crop = plant(garden, ground, "mooncress", x ?? 0, z ?? 0);
    if (!crop) throw new Error("authored crop unavailable");
    expect(crop.fit).toBe(1);
    expect(water(garden, crop)).toBe(true);
  }
  step(garden, 150);
  const flowers = garden.plants.filter((p) => p.bloomed);
  expect(flowers).toHaveLength(3);
  const requested = {
    x: flowers.reduce((sum, p) => sum + p.x, 0) / flowers.length + 1.5,
    z: flowers.reduce((sum, p) => sum + p.z, 0) / flowers.length + 1.5,
  };
  expect(requested).toEqual({ x: -3.5, z: -4.5 });
  const obstacles = [
    { x: -5, z: -6, r: 6 },
    { x: 6, z: -4.5, r: 1.6 },
    { x: -14, z: 13, r: 3.1 },
    { x: 3, z: 25, r: 1.8 },
  ];
  const spot = giftSpot(requested, flowers, ground, obstacles, 262);
  if (!spot) throw new Error("gift unavailable");
  expect(spot).not.toEqual(requested);
  expect(giftSpot(requested, flowers, ground, obstacles, 262)).toEqual(spot);
  for (const obstacle of obstacles)
    expect(Math.hypot(spot.x - obstacle.x, spot.z - obstacle.z)).toBeGreaterThanOrEqual(
      obstacle.r + GIFT_CLEARANCE,
    );
  garden.pickups.push({
    id: "gift",
    ...spot,
    label: "Lanternfolk gift",
    seeds: { orchid: 2 },
    taken: false,
  });
  const action = nextAction(garden, ground, spot.x, spot.z, 0, "mooncress");
  expect(action.kind).toBe("pickup");
  expect(perform(garden, ground, action)).toBe(true);
  expect(garden.seeds.orchid).toBe(2);
  expect(perform(garden, ground, action)).toBe(false);
});

test("gift placement respects the playable basin and level ground, with a flower-near fallback", () => {
  const requested = { x: BOUNDARY + 40, z: 0 };
  const slope = {
    heightAt: () => 0,
    normalAt: (x: number, _z: number, out: { x: number; y: number; z: number }) =>
      Object.assign(out, { x: x > 60 ? 0.8 : 0, y: x > 60 ? 0.6 : 1, z: 0 }),
  };
  const spot = giftSpot(requested, [{ x: 30, z: 30 }], slope, [], 262);
  expect(spot).toEqual({ x: 30, z: 30 });
  expect(Math.hypot(spot?.x ?? 0, spot?.z ?? 0)).toBeLessThan(BOUNDARY - GIFT_CLEARANCE);
  expect(giftSpot({ x: 60, z: 60 }, [], flat, [], 40)).toBeNull();
});

test("fully blocked or steep gift candidates return null without modifying their inputs", () => {
  const requested = { x: 20, z: 0 };
  const obstacles = [{ x: 0, z: 0, r: BOUNDARY * 2 }];
  expect(giftSpot(requested, blooms, flat, obstacles, 262)).toBeNull();
  expect(requested).toEqual({ x: 20, z: 0 });
  expect(obstacles).toEqual([{ x: 0, z: 0, r: BOUNDARY * 2 }]);
  const steep = {
    heightAt: () => 0,
    normalAt: (_x: number, _z: number, out: { x: number; y: number; z: number }) =>
      Object.assign(out, { x: 0.8, y: 0.6, z: 0 }),
  };
  expect(giftSpot(requested, blooms, steep, [], 262)).toBeNull();
});

test("three blooms that appear during an existing dusk earn the gift exactly once", () => {
  const folk = new Lanternfolk(() => 0, 0);
  let gifts = 0;
  folk.onGift = () => {
    gifts++;
    return true;
  };
  folk.update(0.1, 0, []);
  folk.update(0.1, 0, blooms.slice(0, 2));
  expect(gifts).toBe(0);
  folk.update(0.1, 0, blooms);
  expect(gifts).toBe(1);
  for (let i = 0; i < 60; i++) folk.update(0.1, 0, blooms);
  folk.update(0.1, 1, blooms);
  folk.update(0.1, 0, blooms);
  expect(gifts).toBe(1);
});

test("a temporarily unplaceable gift retries while dusk remains and marks success only once", () => {
  const folk = new Lanternfolk(() => 0, 0);
  let obstacles = [{ x: 0, z: 0, r: BOUNDARY * 2 }];
  let attempts = 0;
  const placed: { x: number; z: number }[] = [];
  folk.onGift = (x, z) => {
    attempts++;
    const spot = giftSpot({ x, z }, blooms, flat, obstacles, 262);
    if (!spot) return false;
    placed.push(spot);
    return true;
  };
  folk.update(0.1, 0, blooms);
  expect(attempts).toBe(1);
  expect(placed).toEqual([]);
  obstacles = [];
  folk.update(0.1, 0, blooms);
  expect(attempts).toBe(2);
  expect(placed).toHaveLength(1);
  for (let i = 0; i < 30; i++) folk.update(0.1, 0, blooms);
  expect(attempts).toBe(2);
  expect(placed).toHaveLength(1);
});
