import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { groundHeight, HeightGrid } from "../src/engine/lunar";
import { canPlant, fit, type Garden, survey } from "../src/game/garden";
import type { HeightQuery } from "../src/game/light";
import type { SpeciesId } from "../src/game/species";
import { Terrain } from "../src/world/terrain";
import { buildHeightfield } from "../src/world/terrain-gen";

/** Use the shipped LOLA height assets as well as the authored basin, without a renderer. */
export function rulesTerrain(): HeightQuery {
  const terrain = new Terrain(buildHeightfield());
  const info = JSON.parse(
    readFileSync(new URL("../public/lunar/lunar.json", import.meta.url), "utf8"),
  ) as {
    grids: Record<
      "near" | "mid" | "far",
      {
        half: number;
        step: number;
        height: { n: number; offset: number; scale: number };
      }
    >;
  };
  const grids = {} as Record<"near" | "mid" | "far", HeightGrid>;
  for (const name of ["near", "mid", "far"] as const) {
    const compressed = readFileSync(new URL(`../public/lunar/${name}-h.bin.gz`, import.meta.url));
    const raw = gunzipSync(compressed);
    const deltas = new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
    const {
      half,
      step,
      height: { n, offset, scale },
    } = info.grids[name];
    const heights = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      let q = 0;
      for (let i = 0; i < n; i++) {
        q = (q + (deltas[j * n + i] as number)) & 0xffff;
        heights[j * n + i] = q / scale - offset;
      }
    }
    grids[name] = new HeightGrid(half, step, n, heights);
  }
  const lunar = {
    heightAt(x: number, z: number) {
      const wm = grids.mid.weight(x, z);
      let h = wm < 1 ? grids.far.sample(x, z) : 0;
      if (wm > 0) h += (grids.mid.sample(x, z) - h) * wm;
      const wn = grids.near.weight(x, z);
      if (wn > 0) h += (grids.near.sample(x, z) - h) * wn;
      return h;
    },
  };
  return {
    heightAt: groundHeight(terrain, lunar),
    normalAt: (x, z, out) => terrain.normalAt(x, z, out),
  };
}

/** A nearby, legal plot with real all-day light; it never modifies the garden. */
export function findPlot(
  g: Garden,
  ground: HeightQuery,
  species: SpeciesId,
  cx: number,
  cz: number,
) {
  for (let r = 0; r <= 36; r += 2) {
    const samples = Math.max(1, Math.ceil((Math.PI * 2 * r) / 2));
    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2;
      const x = cx + Math.sin(angle) * r;
      const z = cz + Math.cos(angle) * r;
      if (canPlant(g, ground, species, x, z)) continue;
      const spot = survey(g, ground, x, z);
      if (fit(species, spot).fit >= 0.85) return { x, z, ...spot };
    }
  }
  throw new Error(`No thriving ${species} plot within 36 m of ${cx}, ${cz}`);
}
