// Renders Earth plates for the lunar sky (tools/earth/earth.html) on the real GPU: three
// longitudes × five phases at 4096², transparent PNGs in assets-src/renders/earth/ (git-ignored)
// and a contact sheet in docs/visual/studio/earth.jpg.
// Usage (project root): node tools/earth/render-earth.mjs [--test] [--size 4096] [--port 4710]
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const test = argv.includes("--test");
const size = Number(opt("--size", test ? "1024" : "4096"));
const port = Number(opt("--port", "4710"));
const playwright =
  process.env.STUDIO_PLAYWRIGHT ??
  "C:/Users/William King/AppData/Local/npm-cache/_npx/81fb41e6b6793dc6/node_modules/playwright/index.mjs";
const magick =
  process.env.STUDIO_MAGICK ??
  "C:/Users/William King/.codex/tools/visual/ImageMagick-7.1.2-31/magick.exe";
const out = path.resolve("assets-src/renders/earth");
mkdirSync(out, { recursive: true });
mkdirSync("docs/visual/studio", { recursive: true });

const LONGITUDES = [
  ["africa-europe", 20],
  ["americas", -75],
  ["asia-pacific", 120],
];
const PHASES = [
  ["full", 8],
  ["gibbous", 50],
  ["half", 90],
  ["crescent", 130],
  ["thin-crescent", 158],
];
const plates = test
  ? [{ id: "test", lon: 20, phase: 50 }]
  : LONGITUDES.flatMap(([place, lon]) =>
      PHASES.map(([name, phase]) => ({ id: `${place}_${name}`, lon, phase })),
    );

const server = spawn(
  "bunx",
  ["--no-install", "vite", "--config", "tools/studio/kit/vite.studio.mjs"],
  {
    env: { ...process.env, STUDIO_PORT: String(port) },
    shell: true,
    stdio: "ignore",
  },
);
const url = `http://127.0.0.1:${port}/tools/earth/earth.html`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(url)).ok) break;
  } catch {}
  await sleep(1000);
}
const { chromium } = await import(pathToFileURL(playwright).href);
const browser = await chromium.launch({
  channel: "chrome",
  headless: false,
  args: ["--window-size=900,900"],
});
const written = [];
try {
  const page = await (
    await browser.newContext({ viewport: { width: 800, height: 800 } })
  ).newPage();
  page.on("pageerror", (e) => console.log(`page error: ${e.message}`));
  await page.goto(url);
  await page.waitForFunction(() => !!window.__EARTH__, null, { timeout: 120_000 });
  await page.evaluate(() => window.__EARTH__.ready);
  for (const plate of plates) {
    const dataUrl = await page.evaluate((p) => window.__EARTH__.render(p), { ...plate, size });
    const file = path.join(out, `earth_${plate.id}.png`);
    writeFileSync(file, Buffer.from(dataUrl.split(",")[1], "base64"));
    written.push(file);
    console.log(`${plate.id}: ${size}²`);
  }
} finally {
  await browser.close().catch(() => {});
  if (process.platform === "win32") {
    try {
      execFileSync("powershell", [
        "-NoProfile",
        "-Command",
        `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`,
      ]);
    } catch {}
  } else server.kill();
}
// Contact sheet on a night-sky ground: one row per longitude, phases left to right.
if (written.length)
  execFileSync(magick, [
    "montage",
    ...written,
    "-tile",
    `${test ? 1 : PHASES.length}x`,
    "-geometry",
    "480x480+6+6",
    "-background",
    "#05070b",
    path.resolve(test ? "docs/visual/studio/earth-test.jpg" : "docs/visual/studio/earth.jpg"),
  ]);
console.log(`${written.length} plates`);
