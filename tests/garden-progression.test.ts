import { expect, test } from "bun:test";
import {
  ARRIVAL,
  createGarden,
  DOME,
  drainEvents,
  type GardenEvent,
  medal,
  step,
} from "../src/game/garden";
import { Player } from "../src/game/player";
import { type Held, nextAction, perform, WATER_POINTS } from "../src/game/session";
import { SPECIES, type SpeciesId } from "../src/game/species";
import { PLACES } from "../src/world/terrain-gen";
import { findPlot, rulesTerrain } from "./garden-route";

test("a gardener earns every unlock and fills the dome by travelling, planting, watering and collecting the real caches", () => {
  const ground = rulesTerrain();
  const garden = createGarden();
  const gardener = new Player();
  const heading = Math.atan2(9, -19);
  gardener.place(
    -14 + Math.sin(heading) * 6.5,
    13 + Math.cos(heading) * 6.5,
    ground,
    heading + Math.PI,
  );
  const history: GardenEvent[] = [];
  const planted: { species: SpeciesId; x: number; z: number; fit: number }[] = [];
  const obstacles = [
    { x: -5, z: -6, r: 6 },
    { x: 6, z: -4.5, r: 1.6 },
    { x: -14, z: 13, r: 3.1 },
    { x: 3, z: 25, r: 1.8 },
    { x: PLACES.probe.x, z: PLACES.probe.z, r: 1.3 },
    { x: PLACES.earthside.x + 6, z: PLACES.earthside.z - 34, r: 0.8 },
    { x: PLACES.bowl.x + 14, z: PLACES.bowl.z - 4, r: 1.8 },
    { x: -7, z: 5, r: 1.5 },
  ];
  const tick = (x = 0, z = 0) => {
    gardener.update({ x, z, run: true, jump: false }, 0.1, ground, obstacles);
    step(garden, 0.1);
    history.push(...drainEvents(garden));
  };
  const wait = (seconds: number) => {
    for (let i = 0; i < Math.ceil(seconds * 10); i++) tick();
  };
  const go = (x: number, z: number) => {
    let arrived = false;
    for (let i = 0; i < 6000; i++) {
      const dx = x - gardener.x;
      const dz = z - gardener.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.05 && gardener.grounded) {
        arrived = true;
        break;
      }
      const scale = Math.min(1, distance / 1.2) / Math.max(distance, 1e-9);
      tick(dx * scale, dz * scale);
    }
    if (!arrived) throw new Error(`route blocked to ${x},${z} at ${gardener.x},${gardener.z}`);
    wait(0.5);
  };
  const face = (x: number, z: number, ahead = 1.25) => {
    go(x, z + ahead + 2.2);
    go(x, z + ahead);
  };
  const act = (held: Held, expected: string) => {
    expect(gardener.grounded).toBe(true);
    const action = nextAction(garden, ground, gardener.x, gardener.z, gardener.yaw, held);
    if (action.kind !== expected)
      throw new Error(`expected ${expected}, saw ${action.kind} at ${gardener.x},${gardener.z}`);
    expect(perform(garden, ground, action)).toBe(true);
    history.push(...drainEvents(garden));
    wait(action.kind === "plant" ? 1.2 : 0.9);
  };
  const fillCan = () => {
    const choices = WATER_POINTS.map((p) => ({
      ...p,
      distance: Math.hypot(p.x - gardener.x, p.z - gardener.z),
    }));
    const nearest = choices.sort((a, b) => a.distance - b.distance)[0];
    if (!nearest) throw new Error("no water point");
    go(nearest.x + 2.4, nearest.z);
    // Opening the drill takes precedence over refilling when it has just unlocked.
    const action = nextAction(garden, ground, gardener.x, gardener.z, gardener.yaw, "mooncress");
    if (action.kind === "pickup") act("mooncress", "pickup");
    act("mooncress", "refill");
  };
  const sow = (species: SpeciesId, cx: number, cz: number) => {
    if (garden.can === 0) fillCan();
    const plot = findPlot(garden, ground, species, cx, cz);
    face(plot.x, plot.z);
    act(species, "plant");
    const crop = garden.plants.at(-1);
    if (!crop || crop.species !== species) throw new Error("seed not planted");
    expect(crop.fit).toBeGreaterThanOrEqual(0.8);
    planted.push({ species, x: crop.x, z: crop.z, fit: crop.fit });
    if (crop.water <= 0.6) act(species, "water");
    else expect(crop.water).toBe(1);
  };
  const tend = () => {
    for (const crop of garden.plants) {
      if (crop.water > 0.25) continue;
      if (garden.can === 0) fillCan();
      face(crop.x, crop.z);
      if (crop.bloomed && crop.harvestIn <= 0 && SPECIES[crop.species].seeds > 0)
        act(crop.species, "harvest");
      act(crop.species, "water");
    }
  };
  const pickup = (id: string) => {
    const item = garden.pickups.find((p) => p.id === id);
    if (!item) throw new Error(`no ${id}`);
    if (item.taken) return;
    go(item.x, item.z + 2.4);
    act("mooncress", "pickup");
  };

  // Step out east of the base, with the same seeds and can the real gardener starts with.
  go(0, 12);
  go(18, 12);
  for (let i = 0; i < 6; i++) sow("mooncress", 18 + i * 3, -2);
  for (let i = 0; i < 3; i++) sow("sunleaf", 18 + i * 3, -8);
  while (garden.journal.size === 0) wait(1);
  tend();
  pickup("probe");
  for (let i = 0; i < 3; i++) sow("nightbell", PLACES.bowl.x + i * 3, PLACES.bowl.z);
  while (!garden.unlocked.has("caches") && garden.time < 24 * 60) {
    tend();
    wait(10);
  }
  expect(garden.unlocked.has("rover")).toBe(true);
  expect(garden.unlocked.has("caches")).toBe(true);
  if (garden.can < 2) fillCan();
  pickup("earthside");
  for (let i = 0; i < 2; i++) sow("glassfern", PLACES.earthside.x + i * 3, PLACES.earthside.z - 34);
  pickup("icedrill");
  for (let i = 0; i < 2; i++) sow("craterbloom", PLACES.bowl.x - i * 4, PLACES.bowl.z - 4);
  while (!garden.unlocked.has("supply") && garden.time < 26 * 60) {
    tend();
    wait(10);
  }
  expect(garden.unlocked.has("supply")).toBe(true);
  pickup("supply");
  for (let i = 0; i < 2; i++) {
    face(42 + i * 14, 12, 1.8);
    act("sprinkler", "place");
    sow("birch", 40 + i * 14, 12);
  }
  while ((garden.filledAt < 0 || garden.journal.size < 6) && garden.time < 32 * 60) {
    tend();
    wait(10);
  }
  expect(garden.oxygen).toBe(DOME);
  expect(garden.filledAt).toBeGreaterThan(0);
  expect(garden.filledAt).toBeLessThan(ARRIVAL + 6 * 60);
  expect(medal(garden)).not.toBe("bronze");
  expect(garden.journal.size).toBe(6);
  expect(garden.pickups.every((p) => p.taken)).toBe(true);
  expect(garden.sprinklers).toHaveLength(2);
  expect(garden.sprinklersCarried).toBe(1);
  expect(history.filter((e) => e.type === "milestone").map((e) => e.unlock)).toEqual([
    "rover",
    "caches",
    "supply",
    "jets",
    "full",
  ]);
  expect(history.filter((e) => e.type === "planted")).toHaveLength(18);
  expect(history.some((e) => e.type === "harvested")).toBe(true);
  expect(history.filter((e) => e.type === "arrived").length).toBeLessThanOrEqual(1);
  console.log(
    JSON.stringify({ filledAt: garden.filledAt, medal: medal(garden), plants: planted }, null, 2),
  );
}, 30_000);
