import { expect, test } from "@playwright/test";
import { ready, shot } from "./support";

for (const [name, viewport] of [
  ["portrait", { width: 390, height: 844 }],
  ["compact", { width: 320, height: 568 }],
  ["landscape", { width: 568, height: 320 }],
] as const) {
  test.describe(name, () => {
    test.use({ viewport, isMobile: true, hasTouch: true });
    test("arrival, touch gardening and ending controls stay reachable", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await ready(page, "?e2e&intro");
      const begin = page.getByRole("button", { name: "Begin the descent", exact: true });
      await page.waitForFunction(() => {
        const card = document.querySelector(".arrival-title");
        return card && Number(getComputedStyle(card).opacity) > 0.99;
      });
      await begin.scrollIntoViewIfNeeded();
      await expect(begin).toBeInViewport();
      await shot(page, `${name}-title`);
      await begin.tap();
      await page.getByRole("button", { name: "Skip", exact: true }).tap();
      const gotIt = page.getByRole("button", { name: "Got it", exact: true });
      await expect(gotIt).toBeVisible();
      await shot(page, `${name}-controls-top`);
      await gotIt.scrollIntoViewIfNeeded();
      await expect(gotIt).toBeInViewport();
      await gotIt.tap();
      const guide = page.getByLabel("Mission Control guide", { exact: true });
      await expect(guide).toBeVisible();
      expect(
        await guide.evaluate((element) => {
          const body = element.querySelector(".guide-body");
          if (!body) return false;
          const bounds = element.getBoundingClientRect();
          const copy = body.getBoundingClientRect();
          return copy.top >= bounds.top && copy.bottom <= bounds.bottom;
        }),
      ).toBe(true);
      await page.getByRole("button", { name: /^Act(?:\b|:)/ }).tap();
      await expect.poll(() => page.evaluate(() => window.__GAME__.state().plants)).toBe(1);
      await shot(page, `${name}-planted`);
      const sound = page.getByRole("button", { name: /Sound (on|off)/ });
      const beforeSound = await sound.textContent();
      await sound.scrollIntoViewIfNeeded();
      await sound.tap();
      await expect(sound).not.toHaveText(beforeSound ?? "");
      const help = page.getByRole("button", { name: "Suit controls", exact: true });
      await help.scrollIntoViewIfNeeded();
      await help.tap();
      await expect(gotIt).toBeVisible();
      await gotIt.scrollIntoViewIfNeeded();
      await gotIt.tap();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      );
      // This fixture isolates the ending's responsive controls; the complete rules route is separate.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.evaluate(() => window.__GAME__.fill());
      const heading = page.getByRole("heading", { name: "The first breath on the Moon" });
      await expect(heading).toBeFocused({ timeout: 30_000 });
      await expect(heading).toBeInViewport();
      await shot(page, `${name}-ending-top`);
      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: /Sound (on|off)/ })).toBeFocused();
      await expect(page.getByRole("button", { name: /Sound (on|off)/ })).toBeInViewport();
      await page.keyboard.press("Tab");
      const resume = page.getByRole("button", { name: "Keep gardening", exact: true });
      await expect(resume).toBeFocused();
      await expect(resume).toBeInViewport();
      await page.keyboard.press("Tab");
      const replay = page.getByRole("button", { name: "Play again", exact: true });
      await expect(replay).toBeFocused();
      await expect(replay).toBeInViewport();
      await resume.scrollIntoViewIfNeeded();
      await expect(resume).toBeInViewport();
      await shot(page, `${name}-ending-actions`);
      if (name === "compact") {
        await replay.tap();
        await page.waitForFunction(
          () => window.__GAME__?.ready && window.__GAME__.state().plants === 0,
        );
        await expect(
          page.getByRole("button", { name: "Begin the descent", exact: true }),
        ).toBeVisible();
        expect(errors).toEqual([]);
        return;
      }
      await resume.tap();
      await expect(page.locator("dialog[open]")).toHaveCount(0);
      await expect(page.getByText("The Perennial has landed", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: /^Act(?:\b|:)/ })).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}
