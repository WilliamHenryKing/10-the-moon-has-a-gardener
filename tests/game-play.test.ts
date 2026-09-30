import { describe, expect, test } from "bun:test";
import type { Intent } from "../src/engine/input";
import { takePickup } from "../src/game/garden";
import { Play } from "../src/game/play";
import { hud } from "../src/ui/hud-store";

const idle: Intent = {
  moveX: 0,
  moveY: 0,
  run: false,
  jump: false,
  interact: false,
  seedSlot: -1,
  seedStep: 0,
  lookX: 0,
  lookY: 0,
  zoom: 0,
};
const ground = {
  heightAt: () => 0,
  normalAt: (_x: number, _z: number, out: { x: number; y: number; z: number }) =>
    Object.assign(out, { x: 0, y: 1, z: 0 }),
};
const player = { x: 40, z: 40, yaw: 0, grounded: true };

describe("the live garden action edge", () => {
  test("a nonconsuming visual frame cannot act, select a seed, or swallow the next Act", () => {
    const play = new Play(ground, () => {});
    play.start();
    const press = { ...idle, interact: true, seedSlot: 1 };
    for (const dt of [0, -1, Number.NaN, Infinity]) play.update(dt, press, player);
    expect(play.selected).toBe("mooncress");
    expect(play.garden.plants).toEqual([]);
    expect(play.garden.time).toBe(0);
    play.update(0.1, press, player);
    expect(play.selected).toBe("sunleaf");
    expect(play.garden.plants.map((p) => p.species)).toEqual(["sunleaf"]);
    expect(play.garden.seeds.sunleaf).toBe(2);
  });

  test("holding Act never plants or waters again after the kneel finishes", () => {
    const play = new Play(ground, () => {});
    play.start();
    const held = { ...idle, interact: true };
    play.update(0.1, held, player);
    for (let i = 0; i < 40; i++) play.update(0.1, held, player);
    expect(play.garden.plants).toHaveLength(1);
    expect(play.garden.can).toBe(6);
    expect(play.garden.plants[0]?.water).toBe(0);
    play.update(0.1, idle, player);
    play.update(0.1, held, player);
    for (let i = 0; i < 20; i++) play.update(0.1, held, player);
    expect(play.garden.can).toBe(5);
    expect(play.garden.plants).toHaveLength(1);
  });

  test("a transition releases its old interaction edge for the next genuine press", () => {
    const play = new Play(ground, () => {});
    play.start();
    const held = { ...idle, interact: true };
    play.update(0.1, held, player);
    play.update(1.2, held, player);
    play.releaseInput();
    play.update(0.1, held, player);
    expect(play.garden.can).toBe(5);
    expect(play.garden.plants[0]?.water).toBeGreaterThan(0.99);
  });

  test("planting the last seed keeps that species known while its first bloom is still growing", () => {
    const play = new Play(ground, () => {});
    play.start();
    expect(hud.get().known).toContain("sunleaf");
    for (let i = 0; i < 3; i++) {
      const at = { ...player, x: 40 + i * 4 };
      play.update(0.1, { ...idle, seedSlot: 1, interact: true }, at);
      play.update(1.2, idle, at);
    }
    expect(play.garden.seeds.sunleaf).toBe(0);
    expect(play.garden.plants).toHaveLength(3);
    expect(play.garden.journal.has("sunleaf")).toBe(false);
    expect(hud.get().known).toContain("sunleaf");
    expect(hud.get().seeds.sunleaf).toBe(0);
    expect(hud.get().known).not.toContain("nightbell");
  });
});

describe("the world owns occupied footprints", () => {
  test("a seed under a solid object has a refused preview and cannot spend a seed", () => {
    const play = new Play(ground, () => {});
    play.start();
    play.placementBlocked = () => true;
    play.update(0.1, { ...idle, interact: true }, player);
    expect(play.action?.kind).toBe("cannot");
    if (play.action?.kind === "cannot") expect(play.action.refusal).toBe("occupied");
    expect(play.garden.plants).toEqual([]);
    expect(play.garden.seeds.mooncress).toBe(6);
    play.update(0.1, idle, player);
    play.placementBlocked = () => false;
    play.update(0.1, { ...idle, interact: true }, player);
    expect(play.garden.plants).toHaveLength(1);
    expect(play.garden.seeds.mooncress).toBe(5);
  });

  test("a held panel under a solid object has a refused preview and remains in the pouch", () => {
    const play = new Play(ground, () => {});
    expect(takePickup(play.garden, "probe")).toBe(true);
    play.start();
    play.placementBlocked = () => true;
    play.update(0.1, { ...idle, interact: true, seedSlot: 7 }, player);
    expect(play.action?.kind).toBe("cannot-place");
    if (play.action?.kind === "cannot-place") expect(play.action.refusal).toBe("occupied");
    expect(play.garden.panels).toEqual([]);
    expect(play.garden.panelsCarried).toBe(2);
    play.update(0.1, idle, player);
    play.placementBlocked = () => false;
    play.update(0.1, { ...idle, interact: true }, player);
    expect(play.garden.panels).toHaveLength(1);
    expect(play.garden.panelsCarried).toBe(1);
  });

  test("a footprint is checked again immediately before performing a previously legal placement", () => {
    const play = new Play(ground, () => {});
    play.start();
    let checks = 0;
    play.placementBlocked = () => ++checks > 1;
    play.update(0.1, { ...idle, interact: true }, player);
    expect(checks).toBe(2);
    expect(play.action?.kind).toBe("cannot");
    expect(play.garden.plants).toEqual([]);
    expect(play.garden.seeds.mooncress).toBe(6);
  });
});
