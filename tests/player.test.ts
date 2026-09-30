import { describe, expect, test } from "bun:test";
import { GRAVITY, JET_FUEL, Player } from "../src/game/player";

const flat = {
  heightAt: () => 0,
  normalAt: (_x: number, _z: number, out: { x: number; y: number; z: number }) =>
    Object.assign(out, { x: 0, y: 1, z: 0 }),
};

function flight(jets: boolean) {
  const p = new Player();
  p.place(0, 0, flat);
  p.jets = jets;
  let top = 0;
  let airborne = 0;
  for (let i = 0; i < 1200; i++) {
    p.update({ x: 0, z: 0, run: false, jump: true }, 1 / 60, flat);
    top = Math.max(top, p.y);
    if (!p.grounded) airborne += 1 / 60;
    else if (airborne > 0) break;
  }
  return { top, airborne, p };
}

describe("one-sixth gravity", () => {
  test("a plain jump is long and floaty", () => {
    const { top, airborne } = flight(false);
    expect(GRAVITY).toBeCloseTo(1.62);
    expect(top).toBeGreaterThan(1.5);
    expect(airborne).toBeGreaterThan(2.5);
  });

  test("with the jets, holding jump climbs higher, and the fuel runs out", () => {
    const plain = flight(false);
    const jet = flight(true);
    expect(jet.top).toBeGreaterThan(plain.top * 2);
    expect(jet.p.fuel).toBeLessThan(JET_FUEL);
    // Back on the ground, the tank refills.
    for (let i = 0; i < 240; i++)
      jet.p.update({ x: 0, z: 0, run: false, jump: false }, 1 / 60, flat);
    expect(jet.p.fuel).toBeCloseTo(JET_FUEL);
  });
});
