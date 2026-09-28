// Renders a hillshade of the generated basin (low sun from the east) for a quick look.
//   bun scripts/preview-terrain.ts <out.pgm>
import { writeFileSync } from "node:fs";
import { buildHeightfield } from "../src/world/terrain-gen";

const t0 = performance.now();
const hf = buildHeightfield();
console.log(`heightfield ${hf.n}² in ${Math.round(performance.now() - t0)} ms`);
const { n, step, heights } = hf;
const out = new Uint8Array(n * n);
let lo = Infinity;
let hi = -Infinity;
for (const h of heights) {
  lo = Math.min(lo, h);
  hi = Math.max(hi, h);
}
const sun: [number, number, number] = [0.9, 0.35, -0.25];
const len = Math.hypot(...sun);
for (let j = 1; j < n - 1; j++)
  for (let i = 1; i < n - 1; i++) {
    const dx =
      ((heights[j * n + i + 1] as number) - (heights[j * n + i - 1] as number)) / (2 * step);
    const dz =
      ((heights[(j + 1) * n + i] as number) - (heights[(j - 1) * n + i] as number)) / (2 * step);
    const nl = Math.hypot(dx, 1, dz);
    const shade = Math.max(0, (-dx * sun[0] + sun[1] - dz * sun[2]) / (nl * len));
    const tone = ((heights[j * n + i] as number) - lo) / (hi - lo);
    out[j * n + i] = Math.round(Math.min(255, shade * 200 + tone * 55));
  }
writeFileSync(
  process.argv[2] ?? "terrain.pgm",
  Buffer.concat([Buffer.from(`P5 ${n} ${n} 255\n`), out]),
);
console.log(`range ${lo.toFixed(1)} … ${hi.toFixed(1)} m`);
