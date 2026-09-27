# THE MOON HAS A GARDENER — v1 brief for a cloud build session

You are building this project's v1 in one focused session. Ship a small, polished, complete experience — not a prototype and not a sprawling one. Read this brief once, write a plan of 5–10 lines, then build. Stop when the definition of done is met.

## The idea

**10 — THE MOON HAS A GARDENER.** Expand this seed into a complete spatial gardening puzzle. Establish a small set of plant needs, a consistent light/shade rule, understandable controls for the moon and shade panels, a sequence of garden challenges and an ending. Make growth a visible consequence of the player's decisions. Keep the garden intimate and the rules readable. Prove one plant responding to an intentional light cycle before planning many species.

**Direction change from William (27 September 2026, D12):** this is a **third-person** lunar farm. The player is a visible astronaut gardener in a designed suit, with a small farm rover and farm equipment, and Earth hangs in the sky. Keep the light-and-shade growing rule as the farming mechanic. Earth plates rendered from NASA Blue Marble data are in `public/earth/` if present (public domain; credit NASA Earth Observatory).

## Four additional games — now included

These entered the brief as smaller seeds and are now included in the full commission. The next agent must develop proper artwork, rules, progression, feedback and endings for each before producing it. They are not optional substitutes for the six games above.

| Idea | The playable hook | What it might grow into |
| --- | --- | --- |
| **The Moon Has a Gardener** | Rotate a small garden moon and position shade panels to give different plants the light cycles they need | A quiet spatial puzzle game with a visibly changing little ecosystem |
| **Unscheduled Maintenance** | A telescope's mirrors have drifted; repair its optical path to reveal an impossible new constellation | A compact space-observatory puzzle and an especially strong lighting showcase |
| **A Very Small Detour** | Rotate hinged trail sections on a pocket map; the actual miniature landscape changes with the map | An adventure-puzzle companion to FOLDFIELD, if kept visually distinct |
| **Campfire Confidential** | Rearrange a campsite's objects so their shadows tell a requested story on a tent wall | A small shadow-composition game with cosy light and humorous solutions |

Campfire Confidential could be a particularly strong short experiment: one lamp, a few recognisable camping objects and a tent. It has a small asset requirement and a visual rule that uses genuine 3D. Test whether the shadow solutions are readable and allow some freedom rather than demanding one exact pixel arrangement.

Art direction: **THE MOON HAS A GARDENER:** a jewel-like lunar garden, recognisable plant silhouettes and dramatic but useful light/shadow.

## Definition of done (v1)

1. One focused scene delivering the idea above, with a complete loop: start → core interaction → a visible result or ending → replay. A short first-time hint teaches the controls in place.
2. Arrival loader: keep the veil in `index.html` and `src/loader.ts`; restyle the veil to the art direction and call `worldReady()` after the first rendered frame.
3. Desktop (1440×900) and phone (390×844) layouts; mouse, touch and keyboard; honour `prefers-reduced-motion`; visible focus and labelled controls.
4. `bun run check` passes: strict `tsc`, Biome, `bun test`, production build into `dist/`.
5. Unit tests of the game rules (pure TypeScript, no DOM) replace `tests/scaffold.test.ts`.
6. `README.md`: one status paragraph, how to play, and credits for any asset used.
No extra modes, settings screens, accounts, leaderboards, backends, analytics or network calls.

## Technical rules

- The stack is installed and pinned: Vite, React, strict TypeScript, three.js 0.186 (direct, no React Three Fiber), GSAP, Tailwind v4, Biome, Bun. Add a dependency only if essential, pinned exactly.
- `bun run dev` serves the real app (`index.html` → `src/main.tsx`); `bun run build` builds it into `dist/`. `development/` is old tooling: leave it alone.
- Single responsibility: `src/game/` pure rules and state (tested), `src/scene/` three.js scene, camera, lights and meshes, `src/ui/` React HUD and panels, `src/main.tsx` wiring. Files under ~300 lines.
- Visuals: author forms procedurally in code (geometry, instancing, small shaders where they clearly help), AgX or ACES tone mapping, one key light plus hemisphere or environment light, soft shadows where cheap, a cohesive palette and strong silhouettes. Type: a system font stack. External assets only if CC0 or public domain, with the source in README.
- Performance: 60 fps on a mid laptop; cap devicePixelRatio at 2.
- Do not change `wrangler.jsonc`, deploy or publish anything.

## Working method

- There is no GPU here. Do not loop on screenshots: at most two headless checks (desktop, phone) if Chromium is available (software WebGL is fine).
- Commit in small, clear steps. Finish with a message: what was built, how to play, known gaps.
