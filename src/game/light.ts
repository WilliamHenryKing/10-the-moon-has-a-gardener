import { DAY_SECONDS, earthDirection, sunDirection } from "../world/sky-model";
import { PLACES } from "../world/terrain-gen";

// How much light a spot gets across the lunar day, worked out the same way the ground's shadows
// are drawn:
// - March from the spot toward the Sun over the heightfield, keeping the steepest horizon, and
//   compare it with the Sun's height.
// - Do that for SAMPLES Sun positions spread over the day.
// - Shade panels block the Sun where the ray toward it passes through them.
// Earthlight and wet ground are tested separately. Pure functions over a height query.

export const SAMPLES = 32;

export interface HeightQuery {
  heightAt(x: number, z: number): number;
  normalAt(
    x: number,
    z: number,
    out: { x: number; y: number; z: number },
  ): { x: number; y: number; z: number };
}

/** A shade panel: a vertical sheet, `width` wide and `height` tall, facing along its yaw. */
export interface Panel {
  x: number;
  z: number;
  /** Rotation about Y (radians); the sheet spans along (cos yaw, -sin yaw). */
  yaw: number;
}
export const PANEL_WIDTH = 2.4;
export const PANEL_HEIGHT = 2;

/** Height above the ground the plant's leaves sit at, for the light test. */
const LEAF = 0.3;

/** Steepest angle (tangent) of the terrain seen from p toward a horizontal direction. */
export function horizon(
  ground: HeightQuery,
  x: number,
  z: number,
  h0: number,
  dx: number,
  dz: number,
  reach = 520,
) {
  let best = -Infinity;
  let dist = 0;
  let step = 0.6;
  while (dist < reach) {
    dist += step;
    step *= 1.075;
    const h = ground.heightAt(x + dx * dist, z + dz * dist);
    const t = (h - h0) / dist;
    if (t > best) best = t;
  }
  return best;
}

/** Whether a panel stands between the spot and the Sun (direction s, unit). */
export function panelBlocks(
  p: Panel,
  ground: HeightQuery,
  x: number,
  y: number,
  z: number,
  s: { x: number; y: number; z: number },
) {
  // The panel's plane: through its centre, normal (sin yaw, 0, cos yaw).
  const nx = Math.sin(p.yaw);
  const nz = Math.cos(p.yaw);
  const denom = s.x * nx + s.z * nz;
  if (Math.abs(denom) < 1e-4) return false;
  const t = ((p.x - x) * nx + (p.z - z) * nz) / denom;
  if (t <= 0 || t > 12) return false;
  const hx = x + s.x * t;
  const hz = z + s.z * t;
  const hy = y + s.y * t;
  const along = (hx - p.x) * Math.cos(p.yaw) - (hz - p.z) * Math.sin(p.yaw);
  if (Math.abs(along) > PANEL_WIDTH / 2) return false;
  const base = ground.heightAt(p.x, p.z);
  return hy >= base - 0.05 && hy <= base + PANEL_HEIGHT;
}

/** Share of the lunar day the spot is in direct sunlight, 0 … 1. */
export function sunShare(ground: HeightQuery, x: number, z: number, panels: readonly Panel[] = []) {
  const y = ground.heightAt(x, z) + LEAF;
  let lit = 0;
  const s = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < SAMPLES; i++) {
    sunDirection(((i + 0.5) / SAMPLES) * DAY_SECONDS, s);
    const hl = Math.hypot(s.x, s.z);
    const sunTan = s.y / hl;
    // Far enough to take in the hills beyond the basin (when the ground query reaches them).
    if (horizon(ground, x, z, y, s.x / hl, s.z / hl, 6000) >= sunTan) continue;
    if (panels.some((p) => panelBlocks(p, ground, x, y, z, s))) continue;
    lit++;
  }
  return lit / SAMPLES;
}

/** Earth in view and the ground turned toward it: 0 … 1. */
export function earthlight(ground: HeightQuery, x: number, z: number) {
  const e = earthDirection();
  const hl = Math.hypot(e.x, e.z);
  const y = ground.heightAt(x, z) + LEAF;
  if (horizon(ground, x, z, y, e.x / hl, e.z / hl) >= e.y / hl) return 0;
  const n = ground.normalAt(x, z, { x: 0, y: 1, z: 0 });
  // How squarely the slope faces Earth (the flat floor faces it only a little).
  const facing = n.x * e.x + n.y * e.y + n.z * e.z;
  return Math.max(0, Math.min(1, (facing - 0.26) / 0.1));
}

/** The ice in the bowl, and how wet the ground is from it: 0 … 1. */
export const ICE = { x: PLACES.bowl.x, z: PLACES.bowl.z, r: 9 };

export function iceWet(x: number, z: number) {
  const d = Math.hypot(x - ICE.x, z - ICE.z);
  return Math.max(0, Math.min(1, (ICE.r + 9 - d) / 6));
}
