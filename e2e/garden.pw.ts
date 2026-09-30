import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { evidence, ready, shot, step } from "./support";

test("keyboard gardening earns the tools, full dome, first breath and replay", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  await page.locator("canvas").click({ position: { x: 500, y: 350 } });
  await page.evaluate(() => window.__GAME__.freeze(true));
  const state = () => page.evaluate(() => window.__GAME__.state());
  const place = async (x: number, z: number, yaw = 0) => {
    await page.evaluate(([x, z, yaw]) => window.__GAME__.place(x ?? 0, z ?? 0, yaw), [x, z, yaw]);
    await step(page, 0.2);
  };
  const act = async (expected: string) => {
    expect((await state()).action).toBe(expected);
    await page.keyboard.press("KeyE");
    await step(page, 1.5);
  };
  const fillCan = async () => {
    await place(8.4, -4.5);
    if ((await state()).can < 6) await act("refill");
  };
  const sow = async (slot: number, x: number, z: number) => {
    if ((await state()).can === 0) await fillCan();
    await place(x, z + 1.25);
    await page.keyboard.press(`Digit${slot}`);
    await step(page, 0.1);
    const count = (await state()).plants;
    await act("plant");
    expect((await state()).plants).toBe(count + 1);
    if ((await state()).action === "water") await act("water");
  };
  const pickup = async (id: string) => {
    const item = await page.evaluate(
      (id) => window.__GAME__.garden().pickups.find((p) => p.id === id),
      id,
    );
    if (!item || item.taken) return;
    await place(item.x, item.z + 2.4);
    await act("pickup");
  };
  const tend = async () => {
    const crops = await page.evaluate(() =>
      window.__GAME__.garden().plants.filter((p) => p.water <= 0.4),
    );
    for (const crop of crops) {
      if ((await state()).can === 0) await fillCan();
      await place(crop.x, crop.z + 1.25);
      if ((await state()).action === "harvest") await act("harvest");
      if ((await state()).action === "water") await act("water");
    }
  };
  const until = async (unlock: string) => {
    for (let i = 0; i < 40 && !(await state()).unlocked.includes(unlock); i++) {
      await tend();
      await step(page, 30, 60);
    }
    expect((await state()).unlocked).toContain(unlock);
  };

  for (let i = 0; i < 6; i++) await sow(1, 18 + i * 3, -2);
  for (let i = 0; i < 3; i++) await sow(2, 18 + i * 3, -8);
  await shot(page, "starter-garden");
  await pickup("probe");
  for (let i = 0; i < 3; i++) await sow(3, -118 + i * 3, 58);
  await until("caches");

  // These are actual E/W presses; fixture travel only shortens the route between work sites.
  await place(5.8, 25);
  await act("drive");
  expect((await state()).driving).toBe(true);
  const parked = (await state()).rover;
  await page.keyboard.down("KeyW");
  await step(page, 1.4);
  await page.keyboard.up("KeyW");
  await step(page, 0.2);
  const moved = (await state()).rover;
  expect(Math.hypot(moved.x - parked.x, moved.z - parked.z)).toBeGreaterThan(0.5);
  await act("leave");
  expect((await state()).driving).toBe(false);

  await pickup("earthside");
  await sow(4, 8, -150);
  await sow(4, 11, -150);
  await pickup("icedrill");
  await sow(5, -118, 54);
  await sow(5, -122, 54);
  await until("supply");
  await pickup("supply");
  for (let i = 0; i < 2; i++) {
    await place(42 + i * 14, 13.8);
    await page.keyboard.press("Digit9");
    await step(page, 0.1);
    await act("place");
    await sow(6, 40 + i * 14, 12);
  }
  await until("jets");
  await place(32, 18);
  const floor = (await state()).y;
  await page.keyboard.down("Space");
  await step(page, 1.4);
  expect((await state()).thrusting).toBe(true);
  expect((await state()).y).toBeGreaterThan(floor + 1);
  await page.keyboard.up("Space");
  await step(page, 0.1);
  await shot(page, "earned-jets");

  await until("full");
  const earned = await page.evaluate(() => {
    const g = window.__GAME__.garden();
    return {
      time: g.time,
      filledAt: g.filledAt,
      oxygen: g.oxygen,
      plants: g.plants.length,
      journal: [...g.journal],
      unlocked: [...g.unlocked],
      pickups: g.pickups.map((p) => ({ id: p.id, taken: p.taken })),
      sprinklers: g.sprinklers.length,
    };
  });
  expect(earned.plants).toBe(18);
  expect(earned.oxygen).toBe(2600);
  expect(earned.filledAt).toBeLessThan(1080);
  expect(earned.sprinklers).toBe(2);
  expect(earned.pickups.filter((p) => p.id !== "gift").every((p) => p.taken)).toBe(true);
  expect(earned.unlocked).toEqual(["rover", "caches", "supply", "jets", "full"]);
  writeFileSync(`${evidence}/earned-garden.json`, JSON.stringify(earned, null, 2));
  await page.evaluate(() => {
    window.__GAME__.view();
    window.__GAME__.freeze(false);
  });
  await shot(page, "dome-earned");
  await expect
    .poll(() => page.evaluate(() => window.__GAME__.finale()), { timeout: 12_000 })
    .toBe("landing");
  await page.waitForTimeout(1800);
  await shot(page, "perennial-arrival");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const heading = page.getByRole("heading", { name: "The first breath on the Moon" });
  await expect(heading).toBeFocused({ timeout: 30_000 });
  const medalTime = (await state()).time;
  await page.waitForTimeout(400);
  expect((await state()).time).toBe(medalTime);
  await shot(page, "earned-ending");
  await page.getByRole("button", { name: "Keep gardening", exact: true }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.getByText("The Perennial has landed", { exact: true })).toBeVisible();
  expect((await state()).driving).toBe(false);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(400);
  await page.keyboard.up("KeyW");
  expect((await state()).speed).toBeGreaterThan(0.1);
  // Keep gardening really continues the earned garden: late trees and the scene gift survive.
  for (let i = 0; i < 6; i++) {
    await tend();
    await step(page, 40, 30);
  }
  expect(await page.evaluate(() => [...window.__GAME__.garden().journal])).toEqual(
    expect.arrayContaining([
      "mooncress",
      "sunleaf",
      "nightbell",
      "glassfern",
      "craterbloom",
      "birch",
    ]),
  );
  expect(
    await page.evaluate(() => window.__GAME__.garden().pickups.some((p) => p.id === "gift")),
  ).toBe(true);
  await pickup("gift");
  await sow(7, 60, 24);
  await step(page, 25, 10);
  expect(await page.evaluate(() => window.__GAME__.garden().journal.has("orchid"))).toBe(true);
  expect(await page.evaluate(() => window.__GAME__.finale())).toBe("waiting");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  const continued = await page.evaluate(() => ({
    journal: [...window.__GAME__.garden().journal],
    plants: window.__GAME__.garden().plants.length,
    gift: window.__GAME__.garden().pickups.find((p) => p.id === "gift"),
    finale: window.__GAME__.finale(),
  }));
  writeFileSync(`${evidence}/continued-garden.json`, JSON.stringify(continued, null, 2));
  await shot(page, "earned-orchid");
  // Replay is a real document reload with fresh inventories, not a patched garden state.
  await page.reload();
  await page.waitForFunction(() => window.__GAME__?.ready, null, { timeout: 120_000 });
  expect((await state()).plants).toBe(0);
  expect((await state()).oxygen).toBe(0);
  await shot(page, "garden-replayed");
  expect(errors).toEqual([]);
});
