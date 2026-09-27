// Adds the sourced models (assets-src/sourced/) to the studio index as the "sourced" family, so
// the studio renderer makes evaluation views and turntable films of them beside the studio
// families. Usage: node tools/sourcing/index-sourced.mjs, then
//   node tools/studio/kit/render.mjs --port 4710 --only sourced
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const MODELS = [
  ["nasa-astronaut", "nasa/Astronaut.glb"],
  ["nasa-emu", "nasa/Extravehicular Mobility Unit.glb"],
  ["nasa-habitat-demo-1", "nasa/Habitat Demonstration Unit (part 1).glb"],
  ["nasa-habitat-demo-2", "nasa/Habitat Demonstration Unit (part 2).glb"],
  ["quaternius-astronaut-finn", "quaternius/Astronaut_FinnTheFrog.gltf"],
  ["quaternius-rover-round", "quaternius/Rover_Round.gltf"],
  ["quaternius-rover-1", "quaternius/Rover_1.gltf"],
];
const indexFile = "assets-src/studio/index.json";
const index = JSON.parse(readFileSync(indexFile, "utf8"));
const items = index.items.filter((item) => item.family !== "sourced");
for (const [id, file] of MODELS) {
  if (!existsSync(`assets-src/sourced/${file}`)) continue;
  items.push({
    kind: "model",
    id: `sourced-${id}`,
    family: "sourced",
    file: `/assets-src/sourced/${file}`,
    hero: true,
    silhouette: false,
    elevation: 15,
  });
}
writeFileSync(indexFile, JSON.stringify({ ...index, items }, null, 1));
console.log(`sourced models indexed: ${items.filter((i) => i.family === "sourced").length}`);
