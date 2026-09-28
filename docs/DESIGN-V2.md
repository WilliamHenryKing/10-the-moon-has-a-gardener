# THE MOON HAS A GARDENER: v2 design

William, 28 September 2026: the lunar game must become "the most polished, most professional, most immersive and put-together game" of the collection. It should be a free-form, open-world third-person game about planting various species. It needs a strong incentive to win and a reward for the astronaut, and aliens in the background doing their thing. It must reach the fidelity of ODD TIDE and LEAF IT TO ME, and be optimized for performance.

v1 was a single 4×4 puzzle bed. v2 is a redesign that keeps only the idea at its heart: **light and shade decide what grows.**

## The promise

You are the Moon's first gardener. The colony ship *Perennial* is on its way with twelve people, and the new dome on the crater floor holds no air for them yet. Grow a garden that breathes the dome full before Earth is full in the sky. The basin is not as empty as the survey said: something lives here, and it is watching what you plant.

## Pillars

1. **Go anywhere.** Lope and bound in one-sixth gravity across a crater basin about 400 m wide, or drive the farm rover. The camera is a calm third-person follow you can orbit. Footprints and tyre tracks stay in the regolith.
2. **Growth you caused.** Every plant is one you placed. Each species wants a particular share of the slow lunar day in sunlight or in shade, and water from the ice. Plants grow visibly while you work, and the grey basin turns green where you have been.
3. **A goal you can feel, and a real reward.**
   - The dome's oxygen gauge fills from your plants. Each quarter unlocks a tool: the rover, then the jet boost and mirrors, then sprinklers and tree saplings.
   - The rover and tools change how you play, not just a number.
   - The ending is the payoff. The *Perennial* lands, the colonists walk into a dome full of your garden, and the gardener takes off the helmet inside it: the first breath on the Moon.
   - Medal tiers (the dome full before the ship arrives, or after) give a reason to replay.
4. **A world alive without you.**
   - **Lanternfolk** drift in a slow procession along the crater rim, pulsing with light, and come down at dusk to hover over your blooms.
   - **Grazers**, boulders on legs, crop crystal lichen on the crater floor and step around your plots.
   - Far off on a ridge, something stacks glowing cairns, one more each time you look away.
   - At the end they bring you their own seed.
5. **Crafted, not generated.** Cinematic arrival, diegetic HUD on the suit's wrist and visor, sound through the helmet, a photo mode, and quality tiers that keep a mid-range laptop smooth.

## The loop

Explore → find seeds (points of interest, gifts) → choose ground (sunlit plain, shadowed crater, Earth-facing slope, beside the ice) → plant and water → shape the light with shade panels and mirrors while the Sun creeps round the horizon → plants grow through seedling, young, mature and bloom, and breathe oxygen into the dome along the pipeline → a milestone unlocks a tool or species → further ground becomes reachable.

The Sun circles low near the south pole: one compressed lunar day is about 8 minutes. As shadows sweep the basin, a plot's light share depends on where it sits and what stands between it and the Sun. The v1 rule survives as each species' daylight range.

## Species

| Species | Wants | Where | Character |
| --- | --- | --- | --- |
| Mooncress | half sun | anywhere | starter; fast, low yield; low cushions of silver-green |
| Sunleaf | full sun | open plains | broad bronze fans that track the Sun |
| Nightbell | shade | crater shadow, behind panels | glowing blue bells at dusk; lanternfolk come to them |
| Glassfern | Earthlight | the Earth-facing slope | translucent fronds that catch Earthshine |
| Craterbloom | wet ground | beside the ice | tall stalk, a burst of petals; high yield |
| Silver birch | sun and water | late unlock | a real tree, slow and iconic; the biggest yield |
| Selene orchid | the gift | the dome | the lanternfolk's seed, planted in the finale |

## Places

- **Landing site:** habitat dome, oxygen tank, tool shed, pipeline.
- **Mare plain:** sunlit, open, first plots.
- **Shackleton's Bowl:** a crater with a permanently shaded floor and water ice.
- **Earthside slope:** faces Earth, lit by Earthshine.
- **Crystal field:** grazers and lichen.
- **The ridge:** the cairns, the lanternfolk's path, the best view of Earth.
- **Points of interest:** a crashed survey probe (seed cache), an ancient arch (the orchid's origin), the ice drill.

## Controls

| Input | Keyboard and mouse | Touch | Gamepad |
| --- | --- | --- | --- |
| Move | WASD / arrows | left stick (virtual) | left stick |
| Look | drag / mouse | right drag | right stick |
| Bound / jet boost | Space (hold) | jump button | A |
| Interact (plant, water, pick up, drive) | E | action button | X |
| Seed pouch | 1–7 / wheel | pouch button | bumpers |
| Journal and map | Tab | map button | view |
| Photo mode | P | camera button | Y |
| Mute | M | speaker | — |

## Guide and intro

- **Intro:** the lander descends through Earthrise, dust blooms on touchdown, the hatch opens, the gardener steps down and the title rises. It is skippable and replays from the pause menu.
- **Guide:** Mission Control on the radio (text, in the visor) teaches by doing. Each line waits until you have done the action: move here, plant here, water it, set a panel, watch it grow. There are no tutorial walls. A journal holds every species' needs as you learn them.

## Technical plan

- **Engine:** three.js 0.186 WebGL2, same stack as the collection. Custom character controller on the heightfield with low gravity (1.62 m/s²); rock colliders; an arcade rover on four suspension raycasts.
- **Terrain:** a 400 m basin generated in a worker from crater stamps with real morphology (bowl, rim, ejecta, size-frequency spread), plus fBm. It is chunked with LOD and uses a scanned regolith material, grey-graded, triplanar on slopes. A far ring of mountains sits on the horizon. Footprints and tracks are drawn into a trail map.
- **Sky:** black; a procedural star field with the Milky Way band; the Sun as a small hard disc with glare; Earth rendered live from NASA Blue Marble, clouds and Black Marble, so its phase always matches the Sun (see `tools/earth/`).
- **Light:**
  - The Sun is a directional light with cascaded shadows. It is hard-edged: there is no air to soften it.
  - Earthshine is a faint blue fill from Earth's direction.
  - There is no fog and no haze.
  - Exposure is high-dynamic: the Moon's sunlit ground is bright and its shadows nearly black, so the fill carries what the eye needs.
- **Characters:** the gardener is sculpted and skinned in-house on the pipeline that built BEARLY PREPARED's bear. The suit has soft fabric with bellows at the joints, a hard upper torso, a life-support pack that doubles as the seed pack, a gold visor that reflects the garden and Earth, and gloves and boots. Animation is procedural: the lunar lope, floaty bounds, kneel-and-plant, and a look-around idle.
- **Plants and aliens:** procedural geometry and small shaders, with growth driven by the simulation. The lanternfolk are translucent emissive shells; the grazers are sculpted rock with legs.
- **Rules:** pure TypeScript in `src/game/`, unit-tested: light share per plot through the day (sun path and shadow casters), growth, oxygen, milestones.
- **Performance:**
  - Tiers from the first commit: high (cascaded shadows, GTAO, MSAA), medium and low.
  - A startup benchmark and dynamic resolution.
  - Instancing and LOD everywhere.
  - Budget: 60 fps on a mid-range laptop at medium, the RTX 2060 at high with headroom.

## Milestones

1. **World:** terrain, sky, Earth, light, the gardener (sculpt, suit, lope), camera, collision, quality tiers.
2. **Garden:** plots, planting, the seven species, light share, water, oxygen, milestones, HUD.
3. **Life:** lanternfolk, grazers, cairns; points of interest; the rover.
4. **Story:** intro, guide, ending, sound, photo mode, polish.
5. **Evidence and release:** bookmarks, captures, films, scorecard, README, deploy.
