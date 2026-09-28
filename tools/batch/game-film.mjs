// Films the game on the real GPU, stepping time deterministically through window.__GAME__:
// place the gardener, set the Sun, hold keys on a timeline, save every frame, then a GIF and a
// strip for review.
//   node tools/batch/game-film.mjs <out-dir> <script.json>
// script: { "place": [x, z, yaw], "sun": seconds, "seconds": 6, "fps": 24,
//           "keys": [{ "at": 0, "down": ["KeyW", "ShiftLeft"] }, { "at": 3, "up": ["ShiftLeft"] }] }
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";

const { chromium } = await import(
  "file:///C:/Users/William King/AppData/Local/npm-cache/_npx/81fb41e6b6793dc6/node_modules/playwright/index.mjs"
);
const MAGICK = "C:/Users/William King/.codex/tools/visual/ImageMagick-7.1.2-31/magick.exe";
const [out, scriptPath] = process.argv.slice(2);
const script = JSON.parse(readFileSync(scriptPath, "utf8"));
const fps = script.fps ?? 24;
const frames = Math.round(script.seconds * fps);
mkdirSync(`${out}/frames`, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=d3d11", "--enable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.goto(`${process.env.FILM_URL ?? "http://127.0.0.1:4520"}/?e2e`);
await page.waitForFunction(() => window.__GAME__?.ready, null, { timeout: 180000 });
await page.addStyleTag({ content: "#arrival{display:none!important}" });
await page.evaluate(async (s) => {
  const g = window.__GAME__;
  g.freeze(true);
  if (s.place) g.place(...s.place);
  if (s.sun !== undefined) g.setSunTime(s.sun);
  for (let i = 0; i < 20; i++) await g.step(1 / 30);
}, script);
await page
  .locator("canvas")
  .first()
  .click({ position: { x: 5, y: 5 }, force: true })
  .catch(() => {});
const timeline = [...(script.keys ?? [])].sort((a, b) => a.at - b.at);
let k = 0;
for (let i = 0; i < frames; i++) {
  const t = i / fps;
  while (k < timeline.length && timeline[k].at <= t) {
    for (const key of timeline[k].down ?? []) await page.keyboard.down(key);
    for (const key of timeline[k].up ?? []) await page.keyboard.up(key);
    k++;
  }
  await page.evaluate((dt) => window.__GAME__.step(dt), 1 / fps);
  await page.screenshot({ path: `${out}/frames/f_${String(i).padStart(4, "0")}.png` });
}
const state = await page.evaluate(() => window.__GAME__.state());
await browser.close();
execFileSync(MAGICK, [
  "-delay",
  String(Math.round(100 / fps)),
  "-loop",
  "0",
  `${out}/frames/f_*.png`,
  "-resize",
  "640x",
  "-layers",
  "Optimize",
  `${out}/film.gif`,
]);
const picks = Array.from(
  { length: 8 },
  (_, i) => `${out}/frames/f_${String(Math.round((i * (frames - 1)) / 7)).padStart(4, "0")}.png`,
);
execFileSync(MAGICK, [
  "montage",
  ...picks,
  "-tile",
  "4x",
  "-geometry",
  "480x+2+2",
  "-background",
  "#111",
  `${out}/strip.jpg`,
]);
console.log(JSON.stringify({ frames, state, errors: errors.slice(0, 5) }));
