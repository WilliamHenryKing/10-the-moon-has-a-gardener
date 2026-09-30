import { expect, test } from "@playwright/test";
import { ready, shot, step } from "./support";

test("slow assets keep the arrival covered until a genuine first frame", async ({ page }) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/earth2/day.webp", async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/?e2e&intro", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(13_000);
  await expect(page.locator("#arrival")).toBeVisible();
  expect(await page.locator("#root").evaluate((node) => (node as HTMLElement).inert)).toBe(true);
  await shot(page, "slow-loading");
  release();
  await page.waitForFunction(() => window.__GAME__?.ready, null, { timeout: 120_000 });
  await expect(page.locator("#arrival")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Begin the descent", exact: true })).toBeEnabled();
});

test("first draw failure presents a focused recovery without uncovered UI", async ({ page }) => {
  await page.addInitScript(() => {
    const draw = WebGL2RenderingContext.prototype.drawElements;
    let fail = true;
    WebGL2RenderingContext.prototype.drawElements = function (...args) {
      if (fail) {
        fail = false;
        throw new Error("Injected first GPU draw failure");
      }
      return draw.apply(this, args);
    };
  });
  await page.goto("/?e2e&intro");
  await expect(page.getByRole("button", { name: "Reload", exact: true })).toBeFocused({
    timeout: 120_000,
  });
  await expect(page.locator("#root")).toBeEmpty();
  await shot(page, "first-frame-recovery");
});

test("live reduced motion cuts the descent and leaves useful controls", async ({ page }) => {
  await ready(page, "?e2e&intro");
  expect(await page.locator("canvas").evaluate((node) => (node as HTMLElement).inert)).toBe(true);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__GAME__.state().time)).toBe(0);
  await page.getByRole("button", { name: "Begin the descent", exact: true }).click();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__GAME__.state().time)).toBe(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByRole("button", { name: "Got it", exact: true })).toBeVisible({
    timeout: 2500,
  });
  await expect.poll(() => page.evaluate(() => window.__GAME__.state().intro)).toBe("done");
  expect(await page.locator("canvas").evaluate((node) => (node as HTMLElement).inert)).toBe(true);
  await shot(page, "live-calm-controls");
  await page.getByRole("button", { name: "Got it", exact: true }).click();
  await expect(page.locator("canvas")).toBeFocused();
  expect(await page.locator("canvas").evaluate((node) => (node as HTMLElement).inert)).toBe(false);
});

test("held keys, focus and a lost pointer settle before play resumes", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.__GAME__.freeze(true));
  const sound = page.getByRole("button", { name: /Sound (on|off)/ });
  const old = await sound.textContent();
  await page.keyboard.down("KeyM");
  await page.keyboard.down("KeyM");
  await page.keyboard.up("KeyM");
  await expect(sound).not.toHaveText(old ?? "");
  await page.keyboard.down("KeyW");
  await step(page, 0.8);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.keyboard.up("KeyW");
  await step(page, 1);
  expect(await page.evaluate(() => window.__GAME__.state().speed)).toBeLessThan(0.1);
  const at = await page.evaluate(() => window.__GAME__.state());
  await page.getByRole("button", { name: "Suit controls", exact: true }).click();
  const clock = await page.evaluate(() => window.__GAME__.state().time);
  await page.keyboard.press("ArrowDown");
  await step(page, 0.6);
  const after = await page.evaluate(() => window.__GAME__.state());
  expect(after.time).toBe(clock);
  expect(Math.hypot(after.x - at.x, after.z - at.z)).toBeLessThan(0.05);
  await page.getByRole("button", { name: "Got it", exact: true }).click();
  await expect(page.getByRole("button", { name: "Suit controls", exact: true })).toBeFocused();
  expect(await page.locator("canvas").evaluate((node) => (node as HTMLElement).inert)).toBe(false);
});

test("runtime failure closes audio and dismisses the native ending before recovery", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Original = window.AudioContext;
    window.__AUDIO__ = [];
    window.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options);
        window.__AUDIO__.push(this);
      }
    };
  });
  await ready(page);
  await page.locator("canvas").click({ position: { x: 5, y: 300 } });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => window.__GAME__.fill());
  await expect(page.getByRole("heading", { name: "The first breath on the Moon" })).toBeVisible({
    timeout: 30_000,
  });
  await page.evaluate(() => {
    const draw = WebGL2RenderingContext.prototype.drawElements;
    let fail = true;
    WebGL2RenderingContext.prototype.drawElements = function (...args) {
      if (fail) {
        fail = false;
        throw new Error("Injected runtime draw failure");
      }
      return draw.apply(this, args);
    };
  });
  await expect(page.getByRole("button", { name: "Reload", exact: true })).toBeFocused();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("#root")).toBeEmpty();
  expect(await page.evaluate(() => window.__AUDIO__.length)).toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.evaluate(() => window.__AUDIO__.every((context) => context.state === "closed")),
    )
    .toBe(true);
  await shot(page, "ending-runtime-recovery");
});
