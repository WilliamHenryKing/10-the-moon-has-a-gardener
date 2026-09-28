// Fetches the CC0 lunar surface scans from Poly Haven (2k JPG: colour, OpenGL normal, ARM),
// records them in assets.manifest.json, and writes 1k/2k WebP sets to public/textures/<set>/
// as <set>_diff.webp, <set>_nor.webp, <set>_arm.webp (colour in sRGB, the others linear).
//   node tools/sourcing/fetch-moon.mjs
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";

const MAGICK = "C:/Users/William King/.codex/tools/visual/ImageMagick-7.1.2-31/magick.exe";
const SETS = [
  { id: "moon_dusted_05", size: 1024 },
  { id: "moon_01", size: 1024 },
  { id: "moon_meteor_01", size: 1024 },
];
const MAPS = { diff: "Diffuse", nor: "nor_gl", arm: "arm" };
const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

const manifestPath = "assets.manifest.json";
const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
  : { schemaVersion: 1, project: "10-the-moon-has-a-gardener", assets: [] };

for (const set of SETS) {
  const files = await (
    await fetch(`https://api.polyhaven.com/files/${set.id}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    })
  ).json();
  const src = `assets-src/polyhaven/${set.id}`;
  const out = `public/textures/${set.id}`;
  mkdirSync(src, { recursive: true });
  mkdirSync(out, { recursive: true });
  const sources = [];
  const outputs = [];
  for (const [short, key] of Object.entries(MAPS)) {
    const url = files[key]["2k"].jpg.url;
    const file = `${src}/${url.split("/").pop()}`;
    if (!existsSync(file)) {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    }
    sources.push({ file: url.split("/").pop(), url, sha256: sha(file) });
    const target = `${out}/${set.id}_${short}.webp`;
    execFileSync(MAGICK, [
      file,
      "-resize",
      `${set.size}x${set.size}`,
      "-quality",
      short === "diff" ? "86" : "90",
      "-define",
      "webp:method=6",
      target,
    ]);
    outputs.push({ path: target, bytes: statSync(target).size, sha256: sha(target) });
    console.log(target, statSync(target).size);
  }
  manifest.assets = manifest.assets.filter((a) => a.id !== `polyhaven-${set.id}`);
  manifest.assets.push({
    id: `polyhaven-${set.id}`,
    title: set.id.replaceAll("_", " "),
    sourceUrl: `https://polyhaven.com/a/${set.id}`,
    author: "Poly Haven",
    license: "CC0 1.0",
    retrievalDate: new Date().toISOString().slice(0, 10),
    sources,
    processing: `2k JPG → ${set.size}² WebP (colour q86, normal and ARM q90); graded in the shader`,
    outputFiles: outputs,
  });
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log("manifest", manifest.assets.length, "entries");
