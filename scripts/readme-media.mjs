// README media for v2, on the real GPU against the dev server (bun run dev, port 4520):
// desktop.png (1440x900), phone.png (390x844 at 2x) and preview.gif (720 px wide): the lander's
// descent, the garden in bloom as the Sun circles, and dusk with the lanternfolk down among the
// flowers. Time is stepped through the game's test hooks, so every run makes the same frames.
// Usage: node scripts/readme-media.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

const { chromium } = await import(
  "file:///C:/Users/William King/AppData/Local/npm-cache/_npx/81fb41e6b6793dc6/node_modules/playwright/index.mjs"
);
const MAGICK = "C:/Users/William King/.codex/tools/visual/ImageMagick-7.1.2-31/magick.exe";
const OUT = "docs/readme";
const FRAMES = `${OUT}/.frames`;
const URL = "http://127.0.0.1:4520/";
rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
});

/** A garden in bloom by the dome: every species, in loose clusters. */
function plantGarden() {
  const G = window.__GAME__;
  const g = G.garden();
  const species = [
    "mooncress",
    "sunleaf",
    "nightbell",
    "glassfern",
    "craterbloom",
    "birch",
    "orchid",
  ];
  let id = 900;
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let c = 0; c < 7; c++) {
    const cx = 13 + (c % 4) * 5.5;
    const cz = 14 + Math.floor(c / 4) * 6;
    for (let k = 0; k < 6; k++) {
      const a = rand() * Math.PI * 2;
      const r = 0.8 + rand() * 1.8;
      g.plants.push({
        id: id++,
        species: species[c],
        x: cx + Math.cos(a) * r,
        z: cz + Math.sin(a) * r,
        growth: 1,
        water: 1,
        sun: 0.8,
        earth: 1,
        wet: 1,
        fit: 1,
        harvestIn: 0,
        bloomed: true,
      });
      g.journal.add(species[c]);
    }
  }
  g.oxygen = 900;
}

async function open(options, query) {
  const page = await (await browser.newContext(options)).newPage();
  await page.goto(`${URL}?e2e${query}`);
  await page.waitForFunction(() => window.__GAME__?.ready === true, null, { timeout: 180000 });
  await page.evaluate(() => {
    document.getElementById("arrival")?.remove();
    window.__GAME__.freeze(true);
  });
  return page;
}

/** Step time; the dome's air is held a little over a third full so the ending never starts. */
const step = (page, n, dt = 0.05) =>
  page.evaluate(
    async ([n, dt]) => {
      for (let i = 0; i < n; i++) {
        window.__GAME__.garden().oxygen = 900;
        await window.__GAME__.step(dt);
      }
    },
    [n, dt],
  );

// Stills: the garden in bloom, mid-morning light from the south-west, the dome beyond.
for (const [name, options] of [
  ["desktop.png", { viewport: { width: 1440, height: 900 } }],
  [
    "phone.png",
    { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  ],
]) {
  const page = await open(options, "");
  await page.evaluate(plantGarden);
  await page.evaluate(() => {
    window.__GAME__.place(24, 30, 0.55);
    window.__GAME__.setSunTime(66.7);
  });
  await step(page, 60);
  // Let the opening radio lines type out and fade.
  await page.waitForTimeout(13000);
  await step(page, 2);
  await page.screenshot({ path: `${OUT}/${name}` });
  await page.context().close();
  console.log("still", name);
}

// The film.
let n = 0;
const shot = async (page) => {
  await page.screenshot({
    path: `${FRAMES}/f_${String(n++).padStart(3, "0")}.jpg`,
    type: "jpeg",
    quality: 92,
  });
};
{
  // 1. The descent, from the title card's Begin.
  const page = await open({ viewport: { width: 1280, height: 720 } }, "&intro");
  await page.waitForTimeout(2600);
  await page.getByRole("button", { name: "Begin the descent" }).click();
  for (let i = 0; i < 20; i++) {
    await step(page, 18);
    await shot(page);
  }
  await page.context().close();
}
{
  // 2. The garden in bloom while the Sun comes round; 3. dusk, and the lanternfolk come down.
  const page = await open({ viewport: { width: 1280, height: 720 } }, "");
  await page.evaluate(plantGarden);
  await page.evaluate(() => {
    const G = window.__GAME__;
    G.setSunTime(20);
    G.place(21, 31, 0.3);
    G.view([33, 6.5, 36], [19, 0.5, 18]);
  });
  await step(page, 4);
  for (let i = 0; i < 18; i++) {
    await step(page, 12, 0.5);
    await page.evaluate((k) => {
      const a = 0.9 + k * 0.02;
      window.__GAME__.view([19 + Math.sin(a) * 19, 6.5, 18 + Math.cos(a) * 19], [19, 0.5, 18]);
    }, i);
    await step(page, 1);
    await shot(page);
  }
  await page.evaluate(() => window.__GAME__.setSunTime(183));
  for (let i = 0; i < 18; i++) {
    await step(page, 16);
    await page.evaluate((k) => {
      const a = 1.26 + k * 0.012;
      window.__GAME__.view(
        [19 + Math.sin(a) * 22, 8 + k * 0.1, 18 + Math.cos(a) * 22],
        [19, 4, 18],
      );
    }, i);
    await step(page, 1);
    await shot(page);
  }
  await page.context().close();
}
await browser.close();

execFileSync(MAGICK, [
  "-delay",
  "16",
  "-loop",
  "0",
  `${FRAMES}/f_*.jpg`,
  "-resize",
  "720x",
  "-coalesce",
  "-fuzz",
  "6%",
  "-layers",
  "OptimizeTransparency",
  "-set",
  "dispose",
  "None",
  "+dither",
  "-colors",
  "160",
  `${OUT}/preview.gif`,
]);
for (const still of ["desktop.png", "phone.png"])
  execFileSync(MAGICK, [
    `${OUT}/${still}`,
    "-strip",
    "-define",
    "png:compression-level=9",
    `${OUT}/${still}`,
  ]);
const disposal = execFileSync(MAGICK, [
  "identify",
  "-format",
  "%D ",
  `${OUT}/preview.gif`,
]).toString();
const bad = disposal.split(" ").filter((d) => d === "Background" || d === "Previous").length;
rmSync(FRAMES, { recursive: true, force: true });
console.log(`frames ${n} | gif disposal ok: ${bad === 0}`);
