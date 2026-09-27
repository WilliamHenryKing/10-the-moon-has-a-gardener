// Downloads the licence-verified source assets for pre-production (D12) into
// assets-src/sourced/ (git-ignored) and records size and SHA-256 in its manifest.json.
// The register of record is docs/ASSET-SOURCING.md. Usage: node tools/sourcing/fetch-sources.mjs
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const NASA = "NASA (public domain; NASA media usage guidelines: no insignia, no implied endorsement)";
const NASA_EO = "https://eoimages.gsfc.nasa.gov/images/imagerecords";
const NASA_3D = "https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models";
export const SOURCES = [
  {
    id: "earth-bluemarble-ng-jan-21600",
    file: "earth/world.topo.bathy.200401.3x21600x10800.jpg",
    url: `${NASA_EO}/73000/73580/world.topo.bathy.200401.3x21600x10800.jpg`,
    licence: NASA,
    credit: "NASA Earth Observatory, Blue Marble: Next Generation (Reto Stöckli)",
  },
  {
    // The plain composite (no topography or bathymetry shading): oceans read as seen from space.
    id: "earth-bluemarble-ng-jan-plain-21600",
    file: "earth/world.200401.3x21600x10800.jpg",
    url: `${NASA_EO}/73000/73938/world.200401.3x21600x10800.jpg`,
    licence: NASA,
    credit: "NASA Earth Observatory, Blue Marble: Next Generation (Reto Stöckli)",
  },
  {
    id: "earth-clouds-8192",
    file: "earth/cloud_combined_8192.tif",
    url: `${NASA_EO}/57000/57747/cloud_combined_8192.tif`,
    licence: NASA,
    credit: "NASA Goddard Space Flight Center, Blue Marble clouds",
  },
  {
    id: "earth-black-marble-2016-3km",
    file: "earth/BlackMarble_2016_3km_gray_geo.tif",
    url: `${NASA_EO}/144000/144897/BlackMarble_2016_3km_gray_geo.tif`,
    licence: NASA,
    credit: "NASA Earth Observatory, Black Marble 2016 (Joshua Stevens, Suomi NPP VIIRS)",
  },
  {
    id: "nasa-astronaut",
    file: "nasa/Astronaut.glb",
    url: `${NASA_3D}/Astronaut/Astronaut.glb`,
    licence: NASA,
    credit: "NASA 3D Resources, Astronaut",
  },
  {
    id: "nasa-emu",
    file: "nasa/Extravehicular Mobility Unit.glb",
    url: `${NASA_3D}/Extravehicular%20Mobility%20Unit/Extravehicular%20Mobility%20Unit.glb`,
    licence: NASA,
    credit: "NASA 3D Resources, Extravehicular Mobility Unit",
  },
  {
    id: "nasa-habitat-demo-1",
    file: "nasa/Habitat Demonstration Unit (part 1).glb",
    url: `${NASA_3D}/Habitat%20Demonstration%20Unit/Habitat%20Demonstration%20Unit%20(part%201).glb`,
    licence: NASA,
    credit: "NASA 3D Resources, Habitat Demonstration Unit",
  },
  {
    id: "nasa-habitat-demo-2",
    file: "nasa/Habitat Demonstration Unit (part 2).glb",
    url: `${NASA_3D}/Habitat%20Demonstration%20Unit/Habitat%20Demonstration%20Unit%20(part%202).glb`,
    licence: NASA,
    credit: "NASA 3D Resources, Habitat Demonstration Unit",
  },
  // Quaternius Ultimate Space Kit (CC0 1.0; License.txt in the pack), public Google Drive folder
  // linked from https://quaternius.com/packs/ultimatespacekit.html.
  ...[
    ["quaternius-astronaut-finn", "Astronaut_FinnTheFrog.gltf", "10ATgJNePYwkF13BW5viSw0xAoX7dwjJv"],
    ["quaternius-rover-round", "Rover_Round.gltf", "1BgVJWTe89P5Uvgr8D_v36-uC1Ty9vQGF"],
    ["quaternius-rover-1", "Rover_1.gltf", "1oQqZiRr61zqPOKzKNBvIx4huQ5_xby_o"],
    ["quaternius-licence", "License.txt", "1WmpH3wsL_759gtn2JQTsz0v4eyG0bK-Z"],
  ].map(([id, name, drive]) => ({
    id,
    file: `quaternius/${name}`,
    url: `https://drive.google.com/uc?export=download&id=${drive}`,
    licence: "CC0 1.0 Universal (public domain dedication)",
    credit: "Quaternius, Ultimate Space Kit (credit not required)",
  })),
];

const root = path.resolve("assets-src/sourced");
const manifestFile = path.join(root, "manifest.json");
const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : {};
for (const source of SOURCES) {
  const file = path.join(root, source.file);
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    const response = await fetch(source.url);
    if (!response.ok) {
      console.log(`FAILED ${source.id}: HTTP ${response.status}`);
      continue;
    }
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  }
  const bytes = readFileSync(file);
  manifest[source.id] = {
    ...source,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    fetched: manifest[source.id]?.fetched ?? new Date().toISOString(),
  };
  console.log(`${source.id}: ${(bytes.length / 1e6).toFixed(1)} MB`);
}
writeFileSync(manifestFile, JSON.stringify(manifest, null, 1));
