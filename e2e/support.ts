import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";

import type { Garden } from "../src/game/garden";
import type { Grazers } from "../src/scene/grazers";

interface Game {
  ready: boolean;
  freeze(on?: boolean): void;
  clock(rate?: number): void;
  step(dt: number): Promise<void>;
  settle(frames?: number): Promise<void>;
  place(x: number, z: number, yaw?: number): void;
  view(eye?: number[], target?: number[]): void;
  setSunTime(time: number): void;
  garden(): Garden;
  fill(): void;
  finale(): string;
  grazers(): ReturnType<Grazers["snapshot"]>;
  grazerDiagnostics(): ReturnType<Grazers["diagnostics"]>;
  state(): {
    x: number;
    y: number;
    z: number;
    speed: number;
    yaw: number;
    grounded: boolean;
    thrusting: boolean;
    plants: number;
    oxygen: number;
    can: number;
    action: string | null;
    intro: string;
    finale: string;
    time: number;
    driving: boolean;
    unlocked: string[];
    selected: string;
    rover: { x: number; z: number };
  };
}
declare global {
  interface Window {
    __GAME__: Game;
    __AUDIO__: AudioContext[];
  }
}

export const evidence = resolve("../../.workspace/bug-pass-2026-09-30/10");
mkdirSync(evidence, { recursive: true });
export const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${evidence}/${name}.png` });

export async function ready(page: Page, query = "?e2e") {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__GAME__?.ready, null, { timeout: 120_000 });
  await expect(page.locator("#arrival")).toHaveCount(0);
  const gpu = await page.evaluate(() => {
    const gl = document.querySelector("canvas")?.getContext("webgl2");
    const debug = gl?.getExtension("WEBGL_debug_renderer_info");
    return debug && gl?.getParameter(debug.UNMASKED_RENDERER_WEBGL);
  });
  expect(gpu).toMatch(/NVIDIA|RTX/);
  expect(gpu).not.toMatch(/SwiftShader|llvmpipe/);
}

export async function step(page: Page, seconds: number, rate = 1) {
  await page.evaluate(
    async ({ seconds, rate }) => {
      const game = window.__GAME__;
      game.freeze(true);
      game.clock(rate);
      const count = Math.ceil(seconds / rate / 0.1);
      for (let i = 0; i < count; i++) await game.step(seconds / rate / count);
      game.clock(1);
    },
    { seconds, rate },
  );
}
