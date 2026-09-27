import { describe, expect, test } from "bun:test";
import { LEVELS } from "../src/game/levels";
import {
  casterSet,
  countLit,
  growthTrace,
  HOURS,
  isShaded,
  isSolved,
  lightMask,
  reportGarden,
  sunStep,
  tileLabel,
  togglePanel,
  verdictFor,
} from "../src/game/rules";
import type { Level } from "../src/game/types";

const bed: Level = {
  id: "t",
  name: "t",
  width: 5,
  depth: 5,
  panels: 3,
  plants: [{ x: 2, z: 2, species: "mooncress" }],
  rocks: [{ x: 0, z: 1 }], // off every line through the plant
  note: "",
};

describe("sun and shadow", () => {
  test("the Sun visits all eight compass points once per day", () => {
    const seen = new Set(Array.from({ length: HOURS }, (_, h) => sunStep(h).join()));
    expect(seen.size).toBe(8);
    expect(sunStep(0)).toEqual([1, 0]);
    expect(sunStep(8)).toEqual(sunStep(0));
  });

  test("a caster shades up to two tiles away from the Sun, and no further", () => {
    // Sun in the east (hour 0): a panel east of the plant shades it.
    expect(isShaded(casterSet(bed, [{ x: 3, z: 2 }]), { x: 2, z: 2 }, 0)).toBe(true);
    expect(isShaded(casterSet(bed, [{ x: 4, z: 2 }]), { x: 2, z: 2 }, 0)).toBe(true);
    expect(isShaded(casterSet(bed, [{ x: 5, z: 2 }]), { x: 2, z: 2 }, 0)).toBe(false);
    // The same panel does not shade when the Sun is in the west.
    expect(isShaded(casterSet(bed, [{ x: 3, z: 2 }]), { x: 2, z: 2 }, 4)).toBe(false);
  });

  test("diagonal Suns shade along the diagonal", () => {
    // Hour 1 is north-east: the Sun lies toward +x, -z.
    expect(isShaded(casterSet(bed, [{ x: 3, z: 1 }]), { x: 2, z: 2 }, 1)).toBe(true);
    expect(isShaded(casterSet(bed, [{ x: 3, z: 2 }]), { x: 2, z: 2 }, 1)).toBe(false);
  });

  test("rocks cast shadows like panels", () => {
    expect(isShaded(casterSet(bed, []), { x: 1, z: 1 }, 4)).toBe(true); // rock to the west
  });

  test("one panel beside a plant takes exactly one hour of light", () => {
    const mask = lightMask(bed, [{ x: 2, z: 1 }], { x: 2, z: 2 });
    expect(countLit(mask)).toBe(7);
    expect(mask[2]).toBe(false); // north Sun
  });
});

describe("plant needs", () => {
  test("verdicts follow each species' tolerance", () => {
    expect(verdictFor("sunleaf", 8)).toBe("bloom");
    expect(verdictFor("sunleaf", 5)).toBe("starved");
    expect(verdictFor("mooncress", 4)).toBe("bloom");
    expect(verdictFor("mooncress", 6)).toBe("scorched");
    expect(verdictFor("mooncress", 2)).toBe("starved");
    expect(verdictFor("nightbell", 0)).toBe("bloom");
    expect(verdictFor("nightbell", 4)).toBe("scorched");
  });

  test("a suited plant grows every hour to full size", () => {
    const trace = growthTrace("mooncress", [true, false, true, false, true, false, true, false]);
    expect(trace.map((t) => t.health)).toEqual(Array(8).fill("growing"));
    expect(trace[7]?.growth).toBe(1);
  });

  test("too much light scorches at the hour it exceeds the limit", () => {
    const trace = growthTrace("nightbell", Array(8).fill(true));
    expect(trace[2]?.health).toBe("growing");
    expect(trace[3]?.health).toBe("scorched");
    expect(trace[7]?.growth).toBe(trace[2]?.growth ?? -1);
  });

  test("too little light starves once the day can no longer make up for it", () => {
    const trace = growthTrace("sunleaf", [false, false, false, true, true, true, true, true]);
    expect(trace[1]?.health).toBe("growing");
    expect(trace[2]?.health).toBe("starved");
  });
});

describe("placing panels", () => {
  test("panels go on bare soil only, and within the rover's load", () => {
    expect(togglePanel(bed, [], { x: 2, z: 2 })).toBeNull(); // plant
    expect(togglePanel(bed, [], { x: 0, z: 1 })).toBeNull(); // rock
    expect(togglePanel(bed, [], { x: 9, z: 9 })).toBeNull(); // off the bed
    const three = [
      { x: 1, z: 0 },
      { x: 2, z: 0 },
      { x: 3, z: 0 },
    ];
    expect(togglePanel(bed, three, { x: 4, z: 4 })).toBeNull();
    expect(togglePanel(bed, three, { x: 2, z: 0 })).toHaveLength(2); // lift one back
    expect(togglePanel(bed, [], { x: 1, z: 1 })).toEqual([{ x: 1, z: 1 }]);
  });

  test("tile labels read column letter then row number", () => {
    expect(tileLabel({ x: 2, z: 0 })).toBe("C1");
  });
});

describe("gardens", () => {
  test("no garden is solved before the gardener arrives", () => {
    for (const level of LEVELS) expect(isSolved(level, [])).toBe(false);
  });

  test("every garden's plants and rocks fit the bed without overlap", () => {
    for (const level of LEVELS) {
      const cells = [...level.plants, ...level.rocks].map(tileLabel);
      expect(new Set(cells).size).toBe(cells.length);
      for (const c of [...level.plants, ...level.rocks]) {
        expect(c.x < level.width && c.z < level.depth && c.x >= 0 && c.z >= 0).toBe(true);
      }
    }
  });

  test("the first garden is a single plant, proving one light cycle", () => {
    expect(LEVELS[0]?.plants).toHaveLength(1);
    const report = reportGarden(LEVELS[0] as Level, []);
    expect(report[0]?.verdict).toBe("scorched");
  });
});
