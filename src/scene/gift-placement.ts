import type { HeightQuery } from "../game/light";
import { BOUNDARY, type Obstacle } from "../game/player";

interface Point {
  x: number;
  z: number;
}

/** Enough room to stand beside the little gift, beyond the gardener's collision radius. */
export const GIFT_CLEARANCE = 0.8;

/**
 * A flower bed's average can lie inside the dome or a crater wall. Keep the gift nearby, on
 * ground the gardener can stand on, with deterministic fallbacks near the flowers themselves.
 * A null result leaves the Lanternfolk free to try again after a moving obstacle passes.
 */
export function giftSpot(
  requested: Point,
  blooms: readonly Point[],
  ground: HeightQuery,
  obstacles: readonly Obstacle[],
  terrainHalf: number,
): Point | null {
  const limit = Math.min(terrainHalf, BOUNDARY) - GIFT_CLEARANCE;
  if (!Number.isFinite(limit) || limit <= 0) return null;
  const normal = { x: 0, y: 1, z: 0 };
  const valid = (x: number, z: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x, z) > limit) return false;
    if (obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + GIFT_CLEARANCE)) return false;
    if (!Number.isFinite(ground.heightAt(x, z))) return false;
    ground.normalAt(x, z, normal);
    return Number.isFinite(normal.y) && normal.y >= 0.9;
  };
  for (const anchor of [requested, ...blooms]) {
    for (let radius = 0; radius <= 16; radius += 2) {
      const count = radius === 0 ? 1 : 16;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const x = anchor.x + Math.cos(angle) * radius;
        const z = anchor.z + Math.sin(angle) * radius;
        if (valid(x, z)) return { x, z };
      }
    }
  }
  return null;
}
