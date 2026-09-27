# THE MOON HAS A GARDENER — asset sourcing and pre-production (D12)

**Direction (William, 27 September 2026):** "for the lunar farm game, I want it to be third person. So we need to design the astronaut suit and rover and everything. Farm equipment and even a Earth render. Try to find stuff for free online and improve it." Recorded as D12 in `../../../docs/visual/DECISIONS.md`. The seed's light-and-shade growing rule stays as the farming mechanic; the game's design documents are written at the project's turn. Everything here is pre-production (D11): candidates to evaluate and improve, not approved art.

## Licence rules

Accepted: CC0; public domain; NASA media (not copyrighted, but no NASA insignia or logos, and nothing that implies NASA endorsement); CC-BY with credit. CC-BY-SA only after asking William. Refused: NC, ND, editorial-only, "free for personal use", and anything without a verifiable licence. Every source below has its URL, licence, credit, size and SHA-256 in `assets-src/sourced/manifest.json` (the files themselves are git-ignored; `node tools/sourcing/fetch-sources.mjs` re-fetches and verifies them).

## Acquired (27 September 2026)

| Source | What | Licence | Size | Intended use |
|---|---|---|---|---|
| NASA Earth Observatory, Blue Marble: Next Generation, January 2004 with topography and bathymetry, 21600×10800 | Earth's surface colour | NASA / public domain | 29.7 MB | Earth render: day side |
| NASA GSFC, Blue Marble clouds, 8192 | cloud cover | NASA / public domain | 35.9 MB | Earth render: cloud layer and its shadows |
| NASA Earth Observatory, Black Marble 2016, 3 km grey | city lights | NASA / public domain | 6.8 MB | Earth render: night side |
| NASA 3D Resources, *Astronaut* (`github.com/nasa/NASA-3D-Resources`) | suited figure | NASA / public domain | 0.8 MB | proportions and suit reference |
| NASA 3D Resources, *Extravehicular Mobility Unit* | EVA suit | NASA / public domain | 3.4 MB | detail reference for the hero suit (static; no rig) |
| NASA 3D Resources, *Habitat Demonstration Unit* (two parts) | surface habitat | NASA / public domain | 1.2 MB | base-module reference |
| Quaternius, Ultimate Space Kit: *Astronaut Finn the Frog* | rigged character: 8.6k triangles, 43 joints, 18 clips (Idle, Walk, Run, Jump, Jump_Idle, Jump_Land, Duck, HitReact, Wave, Yes, No, Punch, Death and gun variants) | CC0 1.0 | 1.7 MB | locomotion source for the third-person controller, retargeted onto our own suit |
| Quaternius, Ultimate Space Kit: *Rover_Round*, *Rover_1* | stylised rovers, ~7k triangles | CC0 1.0 | 0.8 MB | scale and layout blockouts for the farm rover |

Evaluation renders (eight views and a turntable film each, studio lighting) are produced as the `sourced` family: `docs/visual/studio/sourced.jpg` and `assets-src/studio/turntables/sourced-*.mp4` (`node tools/sourcing/index-sourced.mjs`, then the studio renderer with `--only sourced`).

## Refused or reference-only

- Smithsonian 3D scan of Neil Armstrong's Apollo 11 A7-L suit (3d.si.edu): its licence could not be confirmed (the page blocks automated reading and the Open Access API returns no record) — reference only until confirmed.
- Commercial suit and rover models (TurboSquid, RenderHub, CGTrader, 3DModels.org) and "free" sites without an open licence: refused.

## Still to fetch

- NASA SVS CGI Moon Kit (`svs.gsfc.nasa.gov/4720`): LROC colour map (`lroc_color_poles_4k/8k.tif`) and LOLA displacement (`ldem_16.tif`), public domain — the server did not answer on 27 September; retry.
- Quaternius Ultimate Space Kit, Environment and Items folders (geodesic dome, habitat pods, solar panels, rocks, crates) and the other three astronauts; Quaternius Modular Sci-Fi MegaKit (CC0) for base interiors.
- Poly Haven (CC0) materials for suit fabric, rubber, anodised metal and regolith.

## Improvement plan

- **The gardener (player, third person).** Our own suit at human proportions, stylised but tactile: soft orthofabric with seams and bellows at the joints, a hard upper torso, a life-support backpack that doubles as a seed and water pack, a gold-tinted visor that reflects the garden and Earth, gloves sized for planting, a fictional mission patch (no NASA insignia). Built as studio families (helmet, torso and pack, arms, gloves, legs, boots), skinned to a humanoid skeleton; the Quaternius clips retargeted (three.js `SkeletonUtils.retargetClip`) for locomotion, then authored gardening clips: kneel, plant, water, lift a shade panel, harvest, carry, look up at Earth.
- **The farm rover.** A bespoke utility rover rather than an Apollo replica: open chassis, mesh wheels with visible suspension travel, a planter bed and tool rack, fold-out solar wings, a small crane arm for moving shade panels. The Quaternius rovers set scale; the hero model is built in the studio and rigged for wheels, suspension and arm.
- **Farm equipment.** Hydroponic racks and grow trays, a regolith sifter, grow-light masts, the shade panels (existing studio family), a water-ice drill and tank, a seed dispenser, harvest crates, an inflatable greenhouse dome, cable runs and markers.
- **Earth — first renderer done (27 September).** `tools/earth/earth.html` + `render-earth.mjs` render transparent 4096² plates from the plain Blue Marble (January), clouds and Black Marble at 8192×4096: cloud shadows offset toward the sun, a GGX sun glint on open water, clouds lit with a twilight edge, city lights on the night side dimmed under cloud, limb haze and a glow shell. Fifteen plates (Africa–Europe, Americas, Asia–Pacific × full, gibbous, half, crescent, thin crescent) in `assets-src/renders/earth/` (git-ignored); contact sheet `docs/visual/studio/earth.jpg`. Next: an in-sky version for the game (live phase from the sun direction), and a closer look at the glint and terminator colour at crescent phases.
- **Earth (plan).** A physically lit Earth sphere from the three NASA maps — day colour, clouds with their own shadows, city lights on the night side, a thin atmosphere rim and sun glint on the oceans — shown at the phase the sun gives it from the Moon; rendered live in the sky, with baked 4K plates for posters and the loader.
- **Terrain.** Regolith materials and far-field relief from the CGI Moon Kit.
