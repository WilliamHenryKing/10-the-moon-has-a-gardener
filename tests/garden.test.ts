import { describe, expect, test } from "bun:test";
import {
  ARRIVAL,
  CAN_SIZE,
  canPlant,
  createGarden,
  DOME,
  dig,
  fit,
  harvest,
  medal,
  oxygenShare,
  placePanel,
  plant,
  refill,
  step,
  survey,
  takePickup,
  WATER_TIME,
  water,
} from "../src/game/garden";
import {
  earthlight,
  type HeightQuery,
  ICE,
  iceWet,
  panelBlocks,
  sunShare,
} from "../src/game/light";
import { SPECIES, SPECIES_ORDER, type SpeciesId } from "../src/game/species";
import { Terrain } from "../src/world/terrain";
import { buildHeightfield, PLACES } from "../src/world/terrain-gen";

const flat: HeightQuery = {
  heightAt: () => 0,
  normalAt: (_x, _z, out) => Object.assign(out, { x: 0, y: 1, z: 0 }),
};
/** A wall 30 m high east of x = 10. */
const walled: HeightQuery = {
  heightAt: (x) => (x > 10 ? 30 : 0),
  normalAt: (_x, _z, out) => Object.assign(out, { x: 0, y: 1, z: 0 }),
};

describe("light", () => {
  test("open flat ground sees the Sun all day", () => {
    expect(sunShare(flat, 0, 0)).toBe(1);
  });

  test("a tall wall to one side takes part of the day away", () => {
    const share = sunShare(walled, 5, 0);
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.8);
  });

  test("a shade panel blocks the Sun only on its far side", () => {
    const sun = { x: 1, y: 0.15, z: 0 };
    const len = Math.hypot(sun.x, sun.y, sun.z);
    const s = { x: sun.x / len, y: sun.y / len, z: sun.z / len };
    // A panel 1.5 m east of the spot, facing east-west (its sheet spans north-south).
    const panel = { x: 1.5, z: 0, yaw: Math.PI / 2 };
    expect(panelBlocks(panel, flat, 0, 0.3, 0, s)).toBe(true);
    expect(panelBlocks(panel, flat, 3, 0.3, 0, s)).toBe(false);
    expect(panelBlocks(panel, flat, 0, 0.3, 4, s)).toBe(false);
  });

  test("panels cut a spot's sun share", () => {
    const open = sunShare(flat, 0, 0);
    const shaded = sunShare(flat, 0, 0, [
      { x: 1.2, z: 0, yaw: Math.PI / 2 },
      { x: -1.2, z: 0, yaw: Math.PI / 2 },
      { x: 0, z: 1.2, yaw: 0 },
      { x: 0, z: -1.2, yaw: 0 },
    ]);
    expect(shaded).toBeLessThan(open * 0.35);
  });

  test("ice wets the ground near it, not far away", () => {
    expect(iceWet(ICE.x, ICE.z)).toBe(1);
    expect(iceWet(ICE.x + 40, ICE.z)).toBe(0);
  });
});

describe("fit", () => {
  test("each species thrives in its own light", () => {
    expect(fit("sunleaf", { sun: 0.9, earth: 0, wet: 0 }).fit).toBe(1);
    expect(fit("sunleaf", { sun: 0.3, earth: 0, wet: 0 }).fit).toBe(0);
    expect(fit("nightbell", { sun: 0.1, earth: 0, wet: 0 }).fit).toBe(1);
    expect(fit("nightbell", { sun: 0.9, earth: 0, wet: 0 }).reason).toBe("too sunny");
    expect(fit("mooncress", { sun: 0.5, earth: 0, wet: 0 }).fit).toBe(1);
    expect(fit("glassfern", { sun: 0.5, earth: 0, wet: 0 }).fit).toBe(0);
    expect(fit("craterbloom", { sun: 0.1, earth: 0, wet: 1 }).fit).toBe(1);
    expect(fit("craterbloom", { sun: 0.1, earth: 0, wet: 0 }).reason).toBe("ground too dry");
  });

  test("fit falls away gently just outside the range", () => {
    const f = fit("sunleaf", { sun: 0.66, earth: 0, wet: 0 }).fit;
    expect(f).toBeGreaterThan(0.5);
    expect(f).toBeLessThan(1);
  });
});

describe("garden actions", () => {
  test("planting spends a seed; spacing, steep ground and the base are refused", () => {
    const g = createGarden();
    expect(plant(g, flat, "mooncress", 30, 30)).not.toBeNull();
    expect(g.seeds.mooncress).toBe(5);
    expect(canPlant(g, flat, "mooncress", 30.4, 30)).toBe("too close");
    expect(canPlant(g, flat, "mooncress", 0, 0)).toBe("base");
    expect(canPlant(g, flat, "glassfern", 50, 50)).toBe("no seeds");
    const steep: HeightQuery = {
      heightAt: () => 0,
      normalAt: (_x, _z, o) => Object.assign(o, { x: 0.7, y: 0.7, z: 0 }),
    };
    expect(canPlant(g, steep, "mooncress", 60, 60)).toBe("too steep");
  });

  test("plants grow only with water, bloom, breathe and can be harvested", () => {
    const g = createGarden();
    const p = plant(g, flat, "sunleaf", 40, 40);
    if (!p) throw new Error("not planted");
    step(g, 30);
    expect(p.growth).toBe(0);
    expect(water(g, p)).toBe(true);
    expect(g.can).toBe(CAN_SIZE - 1);
    for (let t = 0; t < SPECIES.sunleaf.grow + 1; t += 1) step(g, 1);
    expect(p.growth).toBe(1);
    expect(g.journal.has("sunleaf")).toBe(true);
    const o = g.oxygen;
    step(g, 10);
    expect(g.oxygen).toBeGreaterThan(o);
    const seeds = g.seeds.sunleaf;
    expect(harvest(g, p)).toBe(true);
    expect(g.seeds.sunleaf).toBe(seeds + SPECIES.sunleaf.seeds);
    expect(harvest(g, p)).toBe(false);
  });

  test("water runs out and the can refills", () => {
    const g = createGarden();
    const p = plant(g, flat, "mooncress", 40, -40);
    if (!p) throw new Error("not planted");
    water(g, p);
    step(g, WATER_TIME + 1);
    expect(p.water).toBe(0);
    expect(refill(g)).toBe(true);
    expect(g.can).toBe(CAN_SIZE);
  });

  test("a young plant can be dug up for its seed", () => {
    const g = createGarden();
    const p = plant(g, flat, "mooncress", -40, 40);
    if (!p) throw new Error("not planted");
    expect(dig(g, p)).toBe(true);
    expect(g.seeds.mooncress).toBe(6);
    expect(g.plants).toHaveLength(0);
  });

  test("caches open only after their milestone", () => {
    const g = createGarden();
    expect(takePickup(g, "earthside")).toBe(false);
    expect(takePickup(g, "probe")).toBe(true);
    expect(g.seeds.nightbell).toBe(3);
    expect(g.panelsCarried).toBe(2);
    g.oxygen = DOME * 0.41;
    step(g, 0.01);
    expect(takePickup(g, "earthside")).toBe(true);
  });

  test("a placed panel re-reads the light of nearby plants", () => {
    const g = createGarden();
    g.panelsCarried = 1;
    const p = plant(g, flat, "mooncress", 50, 0);
    if (!p) throw new Error("not planted");
    expect(p.sun).toBe(1);
    placePanel(g, flat, { x: 51, z: 0, yaw: Math.PI / 2 });
    expect(p.sun).toBeLessThan(1);
  });

  test("filling the dome before the Perennial lands earns gold", () => {
    const g = createGarden();
    g.oxygen = DOME;
    step(g, 0.1);
    expect(medal(g)).toBe("gold");
    const late = createGarden();
    late.time = ARRIVAL + 30;
    late.oxygen = DOME;
    step(late, 0.1);
    expect(medal(late)).toBe("silver");
  });
});

// ---- the real basin ----------------------------------------------------------------------------
const terrain = new Terrain(buildHeightfield());

/** The nearest spot on a spiral around (cx, cz) where the species would thrive. */
function findSpot(g: ReturnType<typeof createGarden>, species: SpeciesId, cx: number, cz: number) {
  for (let r = 2; r < 160; r += 1.5)
    for (let a = 0; a < Math.PI * 2; a += 0.5 / Math.max(1, r / 4)) {
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (canPlant(g, terrain, species, x, z)) continue;
      if (fit(species, survey(g, terrain, x, z)).fit > 0.85) return { x, z, r };
    }
  return null;
}

describe("the basin", () => {
  test("every species has somewhere to grow", () => {
    const g = createGarden();
    for (const s of SPECIES_ORDER) g.seeds[s] = 1;
    g.sprinklers.push({ x: 60, z: 20 });
    for (const s of SPECIES_ORDER) expect(findSpot(g, s, 0, 0)).not.toBeNull();
  });

  test("Earth stands in view from the Earthside hill's north face", () => {
    const e = PLACES.earthside;
    let best = 0;
    for (let dz = -60; dz < -10; dz += 2) best = Math.max(best, earthlight(terrain, e.x, e.z + dz));
    expect(best).toBeGreaterThan(0.5);
  });

  test("a steady gardener fills the dome in 9 to 17 minutes", () => {
    const g = createGarden();
    let clock = 0;
    const pos = { x: 3.5, z: 7 };
    // Walking costs time: about 2 m/s, plus a few seconds per action.
    const go = (x: number, z: number) => {
      const d = Math.hypot(x - pos.x, z - pos.z);
      const dt = d / 2 + 2;
      pos.x = x;
      pos.z = z;
      advance(dt);
    };
    const advance = (dt: number) => {
      for (let t = 0; t < dt; t += 1) step(g, Math.min(1, dt - t));
      clock += dt;
    };
    const tend = () => {
      for (const p of g.plants) {
        if (p.growth >= 1 && p.harvestIn === 0 && SPECIES[p.species].seeds > 0) {
          go(p.x, p.z);
          harvest(g, p);
        }
        if (p.water < 0.2) {
          if (g.can === 0) {
            go(0, 6);
            refill(g);
          }
          go(p.x, p.z);
          water(g, p);
        }
      }
    };
    const sow = () => {
      const home: Record<SpeciesId, [number, number]> = {
        mooncress: [0, 0],
        sunleaf: [0, 0],
        nightbell: [PLACES.bowl.x, PLACES.bowl.z],
        glassfern: [PLACES.earthside.x, PLACES.earthside.z - 34],
        craterbloom: [PLACES.bowl.x, PLACES.bowl.z],
        birch: [0, 0],
        orchid: [0, 0],
      };
      for (const s of SPECIES_ORDER) {
        while (g.seeds[s] > 0) {
          const [cx, cz] = home[s];
          const spot = findSpot(g, s, cx, cz);
          if (!spot) break;
          go(spot.x, spot.z);
          const p = plant(g, terrain, s, spot.x, spot.z);
          if (!p) break;
          if (g.can === 0) {
            go(0, 6);
            refill(g);
            go(p.x, p.z);
          }
          water(g, p);
        }
      }
    };
    while (g.filledAt < 0 && clock < 40 * 60) {
      for (const k of g.pickups)
        if (
          !k.taken &&
          (!k.needs || g.unlocked.has(k.needs)) &&
          (k.id !== "probe" || g.journal.size > 0)
        ) {
          go(k.x, k.z);
          takePickup(g, k.id);
          if (k.sprinklers) {
            for (let i = 0; i < (k.sprinklers ?? 0); i++)
              g.sprinklers.push({ x: 40 + i * 9, z: 30 });
            g.sprinklersCarried = 0;
          }
        }
      sow();
      tend();
      advance(10);
    }
    const minutes = g.filledAt / 60;
    console.log(
      `dome full at ${minutes.toFixed(1)} min with ${g.plants.length} plants; share ${oxygenShare(g)}`,
    );
    expect(minutes).toBeGreaterThan(9);
    expect(minutes).toBeLessThan(17);
  });
});
