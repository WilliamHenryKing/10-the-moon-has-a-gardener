import { describe, expect, test } from "bun:test";
import { BOUNDARY, GRAVITY, JET_FUEL, Player } from "../src/game/player";
import { RoverBody } from "../src/game/rover";

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

describe("body resets and solid collisions", () => {
  test("placing a body after a held jet jump clears its flight, turn and landing state", () => {
    const p = new Player();
    p.place(0, 0, flat);
    p.jets = true;
    for (let i = 0; i < 30; i++) p.update({ x: 1, z: 0, run: true, jump: true }, 1 / 60, flat);
    expect(p.thrusting).toBe(true);
    expect(p.fuel).toBeLessThan(JET_FUEL);
    p.landing = -3;
    p.place(10, 10, flat);
    expect([p.vx, p.vy, p.vz, p.turn, p.landing]).toEqual([0, 0, 0, 0, 0]);
    expect(p.fuel).toBe(JET_FUEL);
    expect(p.thrusting).toBe(false);
    p.update({ x: 0, z: 0, run: false, jump: true }, 1 / 60, flat);
    expect(p.grounded).toBe(false);
    expect(p.thrusting).toBe(true);
  });

  test("releasing a suspended jump edge allows the next jump after landing", () => {
    const { p } = flight(false);
    expect(p.grounded).toBe(true);
    p.releaseInput();
    p.update({ x: 0, z: 0, run: false, jump: true }, 1 / 60, flat);
    expect(p.grounded).toBe(false);
  });

  test("the basin wall removes the whole outward velocity while preserving tangent travel", () => {
    const p = new Player();
    p.place(BOUNDARY, 0, flat);
    p.vx = 2;
    p.vz = 1;
    p.update({ x: 1, z: 0, run: true, jump: false }, 0.1, flat);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(BOUNDARY, 10);
    expect((p.vx * p.x + p.vz * p.z) / BOUNDARY).toBeCloseTo(0, 10);
    expect(p.speed).toBeGreaterThan(0.5);
  });

  test("a solid obstacle appearing exactly at the gardener's centre still pushes them clear", () => {
    const p = new Player();
    p.place(0, 0, flat);
    p.update({ x: 0, z: 0, run: false, jump: false }, 1 / 60, flat, [{ x: 0, z: 0, r: 2 }]);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(2.32, 10);
    expect(p.y).toBe(0);
    expect(p.grounded).toBe(true);
  });

  test("a rover at an obstacle centre is moved clear and can reverse away normally", () => {
    const rover = new RoverBody();
    rover.place(0, 0, 0);
    const obstacles = [{ x: 0, z: 0, r: 2 }];
    rover.update({ throttle: 0, steer: 0 }, 1 / 60, flat, obstacles);
    expect(Math.hypot(rover.x, rover.z)).toBeCloseTo(3.5, 10);
    for (let i = 0; i < 120; i++) rover.update({ throttle: -1, steer: 0 }, 1 / 60, flat, obstacles);
    expect(rover.z).toBeGreaterThan(5);
    expect(rover.speed).toBeCloseTo(-2, 10);
  });
});
