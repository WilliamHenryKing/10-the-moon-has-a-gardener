import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { evidence, ready, shot, step } from "./support";

test("grazers plant their feet, crop lichen, respect the gardener and settle with live calm", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  await page.evaluate(() => {
    const game = window.__GAME__;
    game.freeze(true);
    game.setSunTime(413);
    const grazer = game.grazers().grazers[0];
    if (grazer)
      game.view([grazer.x + 7, grazer.y + 3, grazer.z + 7], [grazer.x, grazer.y - 0.1, grazer.z]);
  });
  await step(page, 0.2);
  await shot(page, "grazer-three-quarter");
  const initial = await page.evaluate(() => window.__GAME__.grazerDiagnostics());
  const motion = await page.evaluate(async () => {
    const game = window.__GAME__;
    let previous = game.grazers();
    const started = previous.grazers.map(({ x, z }) => ({ x, z }));
    let slip = 0;
    let supports = 4;
    let sawSwing = false;
    let sawCrop = false;
    let cropped = false;
    for (let frame = 0; frame < 360; frame++) {
      await game.step(0.1);
      const current = game.grazers();
      for (const [i, grazer] of current.grazers.entries()) {
        supports = Math.min(supports, grazer.feet.filter((foot) => foot.planted).length);
        sawCrop ||= grazer.state === "crop";
        for (const [j, foot] of grazer.feet.entries()) {
          const old = previous.grazers[i]?.feet[j];
          sawSwing ||= !foot.planted;
          if (old?.planted && foot.planted)
            slip = Math.max(slip, Math.hypot(foot.x - old.x, foot.z - old.z));
        }
      }
      cropped ||= current.lichen.some((patch) => patch.amount < 0.9);
      previous = current;
    }
    return {
      slip,
      supports,
      sawSwing,
      sawCrop,
      cropped,
      moved: previous.grazers.map((g, i) =>
        Math.hypot(g.x - (started[i]?.x ?? 0), g.z - (started[i]?.z ?? 0)),
      ),
      snapshot: previous,
    };
  });
  expect(motion.sawSwing).toBe(true);
  expect(motion.sawCrop).toBe(true);
  expect(motion.cropped).toBe(true);
  expect(motion.supports).toBeGreaterThanOrEqual(3);
  expect(motion.slip).toBeLessThan(0.000001);
  expect(motion.moved.every((distance) => distance > 0.5)).toBe(true);
  expect(await page.evaluate(() => window.__GAME__.grazerDiagnostics())).toEqual(initial);
  await page.evaluate(() => {
    const game = window.__GAME__;
    const grazer = game.grazers().grazers[0];
    if (grazer)
      game.view([grazer.x - 6, grazer.y + 1.8, grazer.z + 4], [grazer.x, grazer.y, grazer.z]);
  });
  await step(page, 0.1);
  await shot(page, "grazer-side");
  const cropping = await page.evaluate(async () => {
    const game = window.__GAME__;
    for (let frame = 0; frame < 900; frame++) {
      await game.step(0.1);
      const grazer = game.grazers().grazers[0];
      if (grazer?.state === "crop" && grazer.headPitch > 0.7) {
        const sx = Math.sin(grazer.yaw);
        const cz = Math.cos(grazer.yaw);
        game.view(
          [grazer.x + 6 * cz + 4 * sx, grazer.y + 1.8, grazer.z - 6 * sx + 4 * cz],
          [grazer.x + 1.2 * sx, grazer.y - 0.4, grazer.z + 1.2 * cz],
        );
        await game.settle(2);
        return true;
      }
    }
    return false;
  });
  expect(cropping).toBe(true);
  await shot(page, "grazer-cropping");
  // The body is a solid footprint for both feet and a newly planted plot.
  await page.evaluate(() => {
    const game = window.__GAME__;
    const grazer = game.grazers().grazers[0];
    if (grazer) game.place(grazer.x, grazer.z + 3.2, 0);
    game.view();
  });
  await step(page, 0.6);
  expect(await page.evaluate(() => window.__GAME__.state().action)).toBe("cannot");
  await page.locator("canvas").focus();
  await page.keyboard.press("KeyE");
  await step(page, 0.2);
  expect(await page.evaluate(() => window.__GAME__.state().plants)).toBe(0);
  expect((await page.evaluate(() => window.__GAME__.grazers())).grazers[0]?.state).toBe("watch");
  await shot(page, "grazer-encounter");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await step(page, 0.1);
  const calm = await page.evaluate(() => window.__GAME__.grazers());
  await step(page, 2);
  expect(await page.evaluate(() => window.__GAME__.grazers())).toEqual(calm);
  expect(calm.grazers.every((g) => g.feet.every((foot) => foot.planted))).toBe(true);
  writeFileSync(
    `${evidence}/grazers.json`,
    JSON.stringify({ motion, diagnostics: initial, calm }, null, 2),
  );
  expect(errors).toEqual([]);
});

test("the low tier keeps a two-grazer herd", async ({ page }) => {
  await ready(page, "?e2e&quality=low");
  expect((await page.evaluate(() => window.__GAME__.grazers())).grazers).toHaveLength(2);
  await page.evaluate(() => {
    const game = window.__GAME__;
    const grazer = game.grazers().grazers[0];
    if (grazer)
      game.view([grazer.x + 7, grazer.y + 3, grazer.z + 7], [grazer.x, grazer.y, grazer.z]);
  });
  await page.waitForTimeout(500);
  await shot(page, "grazer-low-tier");
});
