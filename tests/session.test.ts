import { describe, expect, test } from "bun:test";
import { CAN_SIZE, createGarden, plant, step } from "../src/game/garden";
import type { HeightQuery } from "../src/game/light";
import { ahead, describe as say, nextAction, nextSeed, perform, PLANT_AHEAD, WATER_POINTS } from "../src/game/session";
import { SPECIES_ORDER } from "../src/game/species";

const flat: HeightQuery = {
  heightAt: () => 0,
  normalAt: (_x, _z, out) => Object.assign(out, { x: 0, y: 1, z: 0 }),
};

describe("interact does the one sensible thing", () => {
  test("in the open it plants the chosen seed a step ahead", () => {
    const g = createGarden();
    g.pickups = [];
    const a = nextAction(g, flat, 40, 40, 0, "mooncress");
    expect(a.kind).toBe("plant");
    if (a.kind !== "plant") return;
    const f = ahead(0);
    expect(a.x).toBeCloseTo(40 + f.x * PLANT_AHEAD);
    expect(a.z).toBeCloseTo(40 + f.z * PLANT_AHEAD);
    expect(perform(g, flat, a)).toBe(true);
    expect(g.plants.length).toBe(1);
    expect(g.seeds.mooncress).toBe(5);
    expect(say(a).ok).toBe(true);
  });

  test("facing a young, dry plant it waters it; with an empty can it says so", () => {
    const g = createGarden();
    g.pickups = [];
    const p = plant(g, flat, "mooncress", 40, 38.75);
    expect(p).not.toBeNull();
    const a = nextAction(g, flat, 40, 40, 0, "mooncress");
    expect(a.kind).toBe("water");
    expect(perform(g, flat, a)).toBe(true);
    expect(g.can).toBe(CAN_SIZE - 1);
    // Watered: now pressing again tries to plant beside it (too close), not water again.
    expect(nextAction(g, flat, 40, 40, 0, "mooncress").kind).toBe("cannot");
    const dry = createGarden();
    dry.pickups = [];
    plant(dry, flat, "mooncress", 40, 38.75);
    dry.can = 0;
    const b = nextAction(dry, flat, 40, 40, 0, "mooncress");
    expect(b.kind).toBe("dry");
    expect(say(b).ok).toBe(false);
  });

  test("a bloom you face gives its seeds back", () => {
    const g = createGarden();
    g.pickups = [];
    const p = plant(g, flat, "mooncress", 40, 38.75);
    if (!p) throw new Error("not planted");
    p.water = 1;
    p.fit = 1;
    for (let t = 0; t < 400 && !p.bloomed; t += 1) {
      p.water = 1;
      step(g, 1);
    }
    expect(p.bloomed).toBe(true);
    const a = nextAction(g, flat, 40, 40, 0, "mooncress");
    expect(a.kind).toBe("harvest");
    const before = g.seeds.mooncress;
    expect(perform(g, flat, a)).toBe(true);
    expect(g.seeds.mooncress).toBeGreaterThan(before);
  });

  test("near a cache it opens it; near water with a part-empty can it refills", () => {
    const g = createGarden();
    const probe = g.pickups.find((k) => k.id === "probe");
    if (!probe) throw new Error("no probe");
    const a = nextAction(g, flat, probe.x + 1, probe.z, 0, "mooncress");
    expect(a.kind).toBe("pickup");
    expect(perform(g, flat, a)).toBe(true);
    expect(g.seeds.nightbell).toBeGreaterThan(0);
    const tank = WATER_POINTS[0];
    g.can = 2;
    const r = nextAction(g, flat, tank.x + 0.5, tank.z, 0, "mooncress");
    expect(r.kind).toBe("refill");
    expect(perform(g, flat, r)).toBe(true);
    expect(g.can).toBe(CAN_SIZE);
  });

  test("locked caches stay shut; the base and the rim refuse seeds", () => {
    const g = createGarden();
    const drill = g.pickups.find((k) => k.id === "icedrill");
    if (!drill) throw new Error("no drill");
    expect(nextAction(g, flat, drill.x, drill.z, 0, "mooncress").kind).not.toBe("pickup");
    g.pickups = [];
    const base = nextAction(g, flat, 0, 4, 0, "mooncress");
    expect(base.kind).toBe("cannot");
    if (base.kind === "cannot") expect(base.refusal).toBe("base");
    const rim = nextAction(g, flat, 0, 205, Math.PI, "mooncress");
    expect(rim.kind).toBe("cannot");
    if (rim.kind === "cannot") expect(rim.refusal).toBe("outside");
  });

  test("cycling the pouch skips empty species", () => {
    const g = createGarden();
    expect(nextSeed(g, "mooncress", SPECIES_ORDER)).toBe("sunleaf");
    expect(nextSeed(g, "sunleaf", SPECIES_ORDER)).toBe("mooncress");
    expect(nextSeed(g, "mooncress", SPECIES_ORDER, -1)).toBe("sunleaf");
  });
});
