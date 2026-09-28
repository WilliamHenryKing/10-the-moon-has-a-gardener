// Renders world-preview shots on the real GPU (development server on 4520).
//   node tools/batch/world-shots.mjs <out-dir> <shots.json>
// shots.json: [{ "name": "pad-noon", "params": { "cam": "pad", "t": "0" } }, …]
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const { chromium } = await import(
  "file:///C:/Users/William King/AppData/Local/npm-cache/_npx/81fb41e6b6793dc6/node_modules/playwright/index.mjs"
);
const MAGICK = "C:/Users/William King/.codex/tools/visual/ImageMagick-7.1.2-31/magick.exe";
const [out, shotsPath] = process.argv.slice(2);
const shots = JSON.parse(readFileSync(shotsPath, "utf8"));
mkdirSync(out, { recursive: true });
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
await page.goto(`${process.env.WORLD_URL ?? "http://127.0.0.1:4520"}/world.html`);
await page.waitForFunction(() => window.__WORLD__?.ready, null, { timeout: 180000 });
const info = await page.evaluate(() => window.__WORLD__.info());
for (const s of shots) {
  await page.evaluate((p) => window.__WORLD__.set(p), s.params);
  await page.evaluate(() => window.__WORLD__.settle(8));
  await page.screenshot({ path: `${out}/${s.name}.png` });
}
await browser.close();
execFileSync(MAGICK, [
  "montage",
  ...shots.map((s) => `${out}/${s.name}.png`),
  "-tile",
  "3x",
  "-geometry",
  "620x+2+2",
  "-background",
  "#111",
  `${out}/sheet.jpg`,
]);
writeFileSync(`${out}/summary.json`, JSON.stringify({ info, errors }, null, 2));
console.log(JSON.stringify({ info, errors: errors.slice(0, 5) }));
