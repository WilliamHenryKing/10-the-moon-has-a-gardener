# THE MOON HAS A GARDENER

**Status: v1 playable.** This is a third-person light-and-shade puzzle on a small lunar farm. An astronaut gardener, their farm rover and six hand-authored gardens sit near the lunar south pole, with Earth over the northern rim. The run goes: title → six gardens → ending → replay. All rules are pure TypeScript with tests, and a solver proves that every garden can bloom within its panel budget. Everything is built procedurally in three.js except the Earth plate. Not deployed.

## How to play

At the lunar pole the Sun never climbs high. It circles the horizon once per lunar day, which the game samples as **8 hours** (east, north-east, north, …). Every **shade panel** and **rock** throws a shadow **two tiles long**, pointing straight away from the Sun.

Each plant needs a share of the day's light:

| Plant | Light it needs | Too much | Too little |
| --- | --- | --- | --- |
| Sunleaf (gold fan) | 6–8 hours | — | starves |
| Mooncress (teal fronds) | 3–5 hours | scorches | starves |
| Nightbell (violet bell, glows in shade) | 0–3 hours | scorches | — |

- **Stand or lift panels:** tap or click a soil tile. The rover carries a limited number, and its stack shows what's left.
- **Read the light:** the ring of 8 dots around each plant shows its 8 hours, gold where the Sun reaches it. The ring turns green when the plant will bloom, orange when it's too bright and lilac when it's too dark. The list at the top says the same in words.
- **Turn the Sun** with the slider or ◀ ▶ to preview any hour's shadows. Shaded tiles darken to blue.
- **Grow a day:** the Sun circles once and each plant grows hour by hour. A plant scorches the moment it has had too much light, and starves the moment the rest of the day can't give it enough. If every plant blooms, the next garden opens.
- **Keyboard:** Tab to the garden, then use the arrow keys to move the cursor (the gardener walks there) and Enter or Space to stand or lift a panel. `[` and `]` turn the Sun, and `G` grows a day. All buttons are reachable with Tab.
- If `prefers-reduced-motion` is set, the day plays quickly and the camera and walking snap into place instead of animating.

## Development

```sh
bun install --frozen-lockfile
bun run dev      # http://127.0.0.1:4520/
bun run check    # tsc, Biome, bun test, production build into dist/
```

Layout: `src/game/` holds the rules, gardens, solver and state reducer (pure and tested in `tests/`). `src/scene/` has the three.js stage, bed, plants, astronaut, rover, terrain, props and sky. `src/ui/` is the React HUD, and `src/main.tsx` wires them together. The arrival veil lives in `index.html` and `src/loader.ts`.

## Credits

- **Earth:** `public/earth/earth_americas_half.png`, rendered in pre-production (`tools/earth/`) from NASA Earth Observatory's *Blue Marble: Next Generation* (surface), NASA GSFC Blue Marble clouds and NASA *Black Marble 2016* (city lights). These are public domain; credit NASA Earth Observatory. Their use doesn't imply NASA endorsement.
- Everything else (terrain, plants, astronaut suit, rover, panels, props, stars and the Sun) is authored procedurally in code for this project.
- Type uses the system font stack.
