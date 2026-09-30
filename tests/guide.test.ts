import { expect, test } from "bun:test";
import {
  createGarden,
  drainEvents,
  harvest,
  plant,
  step,
  takePickup,
  water,
} from "../src/game/garden";
import { Guide } from "../src/game/guide";

const flat = {
  heightAt: () => 0,
  normalAt: (_x: number, _z: number, out: { x: number; y: number; z: number }) =>
    Object.assign(out, { x: 0, y: 1, z: 0 }),
};

test("the current guide waits for the actual plant, water, bloom, harvest and cache actions", () => {
  const garden = createGarden();
  const guide = new Guide(() => {});
  const events = () => {
    for (const e of drainEvents(garden)) guide.event(e, garden);
  };
  guide.start();
  const first = guide.instruction(garden);
  guide.update(1000, garden);
  expect(guide.instruction(garden)).toBe(first);
  expect(first).toContain("plant");
  const crop = plant(garden, flat, "sunleaf", 40, 40);
  if (!crop) throw new Error("crop unavailable");
  events();
  expect(guide.instruction(garden)).toContain("water it");
  guide.update(1000, garden);
  expect(guide.instruction(garden)).toContain("water it");
  water(garden, crop);
  events();
  expect(guide.instruction(garden)).toContain("first bloom");
  step(garden, 90);
  events();
  expect(guide.instruction(garden)).toContain("harvest");
  expect(harvest(garden, crop)).toBe(true);
  events();
  expect(guide.instruction(garden)).toContain("survey probe");
  expect(takePickup(garden, "probe")).toBe(true);
  events();
  expect(guide.instruction(garden)).toContain("Nightbell");
  step(garden, 40_000);
  events();
  expect(garden.unlocked.has("full")).toBe(true);
  const complete = guide.instruction(garden);
  expect(complete).toContain("Your garden keeps growing");
  expect(complete).not.toContain("clear to land");
  guide.update(1000, garden);
  expect(guide.instruction(garden)).toBe(complete);
});
