// Where each species can grow in the generated basin: sun share, Earthlight and wet ground on a
// grid, as an image (red: sun share, green: Earthlight, blue: wet) and a count per species.
//   bun scripts/light-map.ts <out.ppm> [step=6]
import { writeFileSync } from "node:fs";
import { createGarden, fit, survey } from "../src/game/garden";
import { SPECIES_ORDER } from "../src/game/species";
import { Terrain } from "../src/world/terrain";
import { buildHeightfield } from "../src/world/terrain-gen";

const terrain = new Terrain(buildHeightfield());
const step = Number(process.argv[3] ?? 6);
const g = createGarden();
const n = Math.floor(400 / step);
const img = new Uint8Array(n * n * 3);
const counts: Record<string, number> = {};
const t0 = performance.now();
for (let j = 0; j < n; j++)
  for (let i = 0; i < n; i++) {
    const x = -200 + i * step;
    const z = -200 + j * step;
    if (Math.hypot(x, z) > 200) continue;
    const s = survey(g, terrain, x, z);
    img.set(
      [Math.round(s.sun * 255), Math.round(s.earth * 255), Math.round(s.wet * 255)],
      (j * n + i) * 3,
    );
    for (const sp of SPECIES_ORDER) if (fit(sp, s).fit > 0.8) counts[sp] = (counts[sp] ?? 0) + 1;
  }
writeFileSync(
  process.argv[2] ?? "light.ppm",
  Buffer.concat([Buffer.from(`P6 ${n} ${n} 255\n`), img]),
);
console.log(JSON.stringify({ ms: Math.round(performance.now() - t0), cells: n * n, counts }));
