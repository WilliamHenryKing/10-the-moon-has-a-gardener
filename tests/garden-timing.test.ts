import { describe, expect, test } from "bun:test";
import {
  ARRIVAL,
  createGarden,
  DOME,
  dig,
  drainEvents,
  harvest,
  medal,
  placeSprinkler,
  plant,
  production,
  step,
  water,
} from "../src/game/garden";
import type { HeightQuery } from "../src/game/light";

const flat: HeightQuery = {
  heightAt: () => 0,
  normalAt: (_x, _z, out) => Object.assign(out, { x: 0, y: 1, z: 0 }),
};

function sunflower() {
  const garden = createGarden();
  const crop = plant(garden, flat, "sunleaf", 40, 40);
  if (!crop || !water(garden, crop)) throw new Error("starter crop unavailable");
  drainEvents(garden);
  return { garden, crop };
}

describe("elapsed garden time", () => {
  test("a watered seed grows, blooms and dries within one long step, with exact oxygen", () => {
    const { garden, crop } = sunflower();
    step(garden, 300);
    expect(crop.growth).toBe(1);
    expect(crop.water).toBe(0);
    // Mature at 48 s, bloom at 80 s, dry at 150 s. Dry blooms retain their authored 20% trickle.
    const oxygen = 1.1 * ((80 - 48) * 0.3 + (150 - 80) + (300 - 150) * 0.2);
    expect(garden.oxygen).toBeCloseTo(oxygen, 10);
    expect(production(garden)).toBeCloseTo(1.1 * 0.2, 10);
    expect(drainEvents(garden).map((e) => e.type)).toEqual(["bloomed", "thirsty"]);
  });

  test("fine frames and a long step agree across growth and water boundaries", () => {
    const coarse = sunflower();
    const fine = sunflower();
    step(coarse.garden, 300);
    for (let i = 0; i < 18_000; i++) step(fine.garden, 1 / 60);
    expect(fine.crop.growth).toBe(coarse.crop.growth);
    expect(fine.crop.water).toBe(coarse.crop.water);
    expect(fine.garden.oxygen).toBeCloseTo(coarse.garden.oxygen, 8);
    expect(drainEvents(fine.garden).map((e) => e.type)).toEqual(["bloomed", "thirsty"]);
  });

  test("a sprinkler continuously supplies water even across a step longer than a can lasts", () => {
    const { garden, crop } = sunflower();
    garden.sprinklersCarried = 1;
    expect(placeSprinkler(garden, flat, 42, 40)).toBe(true);
    drainEvents(garden);
    step(garden, 400);
    expect(crop.water).toBe(1);
    expect(crop.growth).toBe(1);
    expect(garden.oxygen).toBeCloseTo(1.1 * ((80 - 48) * 0.3 + (400 - 80)), 10);
    expect(production(garden)).toBeCloseTo(1.1, 10);
    expect(drainEvents(garden).map((e) => e.type)).toEqual(["bloomed"]);
  });

  test("the first species bloom belongs to the earlier flower, rather than array order", () => {
    const garden = createGarden();
    const later = plant(garden, flat, "sunleaf", 40, 40);
    const earlier = plant(garden, flat, "sunleaf", 44, 40);
    if (!earlier || !later) throw new Error("crops unavailable");
    water(garden, earlier);
    step(garden, 40);
    water(garden, later);
    drainEvents(garden);
    step(garden, 100);
    const blooms = drainEvents(garden).filter((e) => e.type === "bloomed");
    expect(blooms.map((e) => [e.plant.id, e.first])).toEqual([
      [earlier.id, true],
      [later.id, false],
    ]);
    expect([...garden.journal]).toEqual(["sunleaf"]);
  });

  test("arrival and all five earned unlocks occur once, in time order, at the true fill time", () => {
    const { garden } = sunflower();
    step(garden, 12_000);
    const events = drainEvents(garden);
    const oxygenAtDry = 1.1 * ((80 - 48) * 0.3 + (150 - 80));
    expect(garden.filledAt).toBeCloseTo(150 + (DOME - oxygenAtDry) / (1.1 * 0.2), 8);
    expect(garden.oxygen).toBe(DOME);
    expect(medal(garden)).toBe("bronze");
    expect(events.map((e) => e.type)).toEqual([
      "bloomed",
      "thirsty",
      "arrived",
      "milestone",
      "milestone",
      "milestone",
      "milestone",
      "milestone",
    ]);
    expect(events.filter((e) => e.type === "milestone").map((e) => e.unlock)).toEqual([
      "rover",
      "caches",
      "supply",
      "jets",
      "full",
    ]);
    step(garden, ARRIVAL);
    expect(drainEvents(garden)).toEqual([]);
    const fine = sunflower();
    for (let i = 0; i < 12_000; i++) step(fine.garden, 1);
    expect(fine.garden.filledAt).toBeCloseTo(garden.filledAt, 7);
    expect(medal(fine.garden)).toBe(medal(garden));
  });

  test("zero, backward and invalid elapsed time cannot change the garden or emit events", () => {
    const { garden, crop } = sunflower();
    for (const dt of [0, -1, Number.NaN, Infinity]) step(garden, dt);
    expect(garden.time).toBe(0);
    expect(garden.oxygen).toBe(0);
    expect(crop.growth).toBe(0);
    expect(crop.water).toBe(1);
    expect(drainEvents(garden)).toEqual([]);
  });
});

describe("plant ownership and seed conservation", () => {
  test("digging the same young plant twice cannot refund a second seed", () => {
    const garden = createGarden();
    const crop = plant(garden, flat, "mooncress", 40, 40);
    if (!crop) throw new Error("crop unavailable");
    expect(dig(garden, crop)).toBe(true);
    expect(dig(garden, crop)).toBe(false);
    expect(garden.seeds.mooncress).toBe(6);
    expect(garden.plants).toEqual([]);
    expect(drainEvents(garden).filter((e) => e.type === "dug")).toHaveLength(1);
  });

  test("stale plant actions from a previous garden cannot spend water or create seeds", () => {
    const previous = sunflower();
    step(previous.garden, 90);
    const replay = createGarden();
    const fresh = plant(replay, flat, "sunleaf", 40, 40);
    if (!fresh) throw new Error("replay crop unavailable");
    expect(fresh.id).toBe(previous.crop.id);
    drainEvents(replay);
    expect(water(replay, previous.crop)).toBe(false);
    expect(harvest(replay, previous.crop)).toBe(false);
    expect(dig(replay, previous.crop)).toBe(false);
    expect(replay.can).toBe(6);
    expect(replay.seeds.sunleaf).toBe(2);
    expect(fresh.water).toBe(0);
    expect(replay.plants).toEqual([fresh]);
    expect(drainEvents(replay)).toEqual([]);
  });
});
