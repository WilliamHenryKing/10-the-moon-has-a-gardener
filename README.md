<p align="center"><img src="docs/readme/banner.svg" alt="THE MOON HAS A GARDENER: stand shade panels under a sun that never climbs, then grow a day." width="100%"></p>

<p align="center">
  <a href="https://10-the-moon-has-a-gardener.williamking.workers.dev"><img alt="Play it live" src="https://img.shields.io/badge/Play_it_live-%E2%96%B6-7fd08a?style=for-the-badge&labelColor=06080e"></a>
  <img alt="Three.js" src="https://img.shields.io/badge/Three.js-7fd08a?style=for-the-badge&logo=threedotjs&logoColor=06080e&labelColor=06080e">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-7fd08a?style=for-the-badge&logo=typescript&logoColor=06080e&labelColor=06080e">
  <img alt="React" src="https://img.shields.io/badge/React-7fd08a?style=for-the-badge&logo=react&logoColor=06080e&labelColor=06080e">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-7fd08a?style=for-the-badge&logo=vite&logoColor=06080e&labelColor=06080e">
  <img alt="Bun" src="https://img.shields.io/badge/Bun-7fd08a?style=for-the-badge&logo=bun&logoColor=06080e&labelColor=06080e">
</p>

**A light-and-shade garden at the lunar south pole.** The Sun never climbs here: it circles the horizon once a lunar day, throwing long shadows every way. Stand shade panels so each plant gets its share of light, then grow a day and watch.

<p align="center"><img src="docs/readme/preview.gif" alt="Turning the Sun, then growing a day in the first garden" width="800"></p>

## How to play

The lunar day is sampled as **8 hours**. Every shade panel and rock throws a shadow **two tiles long**, pointing straight away from the Sun. Each plant needs its share:

| Plant | Light it needs | Too much | Too little |
| --- | --- | --- | --- |
| Sunleaf (gold fan) | 6–8 hours | — | starves |
| Mooncress (teal fronds) | 3–5 hours | scorches | starves |
| Nightbell (violet bell, glows in shade) | 0–3 hours | scorches | — |

- **Stand or lift panels** on the soil tiles. The rover carries a limited number, and its stack shows what's left.
- **Read the light:** the ring of 8 dots around each plant is its day, gold where the Sun reaches it; green means it will bloom, orange too bright, lilac too dark.
- **Turn the Sun** with the slider or ◀ ▶ to preview any hour's shadows.
- **Grow a day:** the Sun circles once. A plant scorches the moment it has too much light and starves when the rest of the day can't give it enough. When everything blooms, the next garden opens.

| Input | Keys and gestures |
| --- | --- |
| Stand or lift a panel | Tap a soil tile, or arrow keys to walk the gardener and `Enter` / `Space` |
| Turn the Sun | Slider, ◀ ▶, or `[` `]` |
| Grow a day | `G` |
| Mute (remembered) | 🔊 or `M` |

## What's inside

- **Six hand-authored gardens**, from title to ending to replay.
- **A solver-backed puzzle design:** a solver proves every garden can bloom within its panel budget, and the rules are pure, tested TypeScript.
- **A third-person gardener** in an astronaut suit, with a farm rover that carries the panels.
- **Real Earth over the rim:** a plate rendered from NASA's Blue Marble, cloud and Black Marble imagery.
- **Legible light:** shaded tiles darken to blue, and every plant carries a ring that shows its whole day at a glance.
- **Sound:** a CC0 space score and ambience, with a cue for every panel, hour and bloom, plus a synth fallback if a browser can't decode a file.
- **Reduced motion respected:** the day plays quickly and the camera snaps rather than animates.

## Screenshots

| Desktop | Phone |
| --- | --- |
| <img src="docs/readme/desktop.png" alt="The lunar garden at mid-day on desktop" width="560"> | <img src="docs/readme/phone.png" alt="The same garden on a phone" width="220"> |

## Built with

Three.js for the lunar stage, plants, astronaut, rover, terrain and sky; React for the HUD; TypeScript throughout; Vite and Bun for the build.

- **Polar sun and two-tile shadows:** the whole light model is discrete and testable, so what you preview is exactly what grows.
- **A state reducer and solver** in `src/game/` keep the rules independent of the scene.

## Run it locally

```sh
bun install --frozen-lockfile
bun run dev      # http://127.0.0.1:4520/
bun run check    # tsc, Biome, bun test, production build into dist/
```

`src/game/` holds the rules, gardens, solver and reducer (tested in `tests/`), `src/scene/` the three.js stage, `src/ui/` the React HUD, and `src/main.tsx` wires them together.

## Credits

- **Earth:** `public/earth/earth_americas_half.png`, rendered from NASA Earth Observatory's *Blue Marble: Next Generation* (surface), NASA GSFC Blue Marble clouds and NASA *Black Marble 2016* (city lights). Public domain; credit NASA Earth Observatory. Use does not imply NASA endorsement.
- Everything else (terrain, plants, suit, rover, panels, props, stars, Sun) is authored procedurally in code. Type uses the system font stack.

Audio, all **CC0** (18 files, about 1.6 MB in `public/audio/`):

| File(s) | Use | Source | Author | Licence |
| --- | --- | --- | --- | --- |
| `music-observing-the-star.ogg` | music loop | https://opengameart.org/content/another-space-background-track | yd | CC0 |
| `ambience-deep-space-array.ogg` | ambience loop | https://opengameart.org/content/deep-space-array | Tozan | CC0 |
| `panel-place-1/2`, `step-1/2` | panel set down, footsteps | Impact Sounds, https://kenney.nl/assets/impact-sounds | Kenney (kenney.nl) | CC0 |
| `panel-lift`, `denied`, `sun-tick`, `cursor`, `ui`, `grow`, `hour`, `bloom`, `wilt` | interaction and day cues | Interface Sounds, https://kenney.nl/assets/interface-sounds | Kenney (kenney.nl) | CC0 |
| `garden-blooms`, `ending`, `garden-fails` | result and ending jingles | Music Jingles, https://kenney.nl/assets/music-jingles | Kenney (kenney.nl) | CC0 |

---

<p align="center"><sub>Part of William King's portfolio collection.</sub></p>
