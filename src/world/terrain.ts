import { workerResult } from "../engine/resources";
import type { Heightfield } from "./terrain-gen";

// The generated basin at runtime: height and slope queries for walking, placing and the camera.
// The heightfield is built in a worker at load (terrain.worker.ts).

export class Terrain {
  constructor(readonly field: Heightfield) {}

  static async load(signal?: AbortSignal): Promise<Terrain> {
    try {
      const worker = new Worker(new URL("./terrain.worker.ts", import.meta.url), {
        type: "module",
      });
      const field = await workerResult<Heightfield>(worker, null, signal);
      return new Terrain(field);
    } catch (error) {
      if (signal?.aborted) throw error;
      const { buildHeightfield } = await import("./terrain-gen");
      signal?.throwIfAborted();
      return new Terrain(buildHeightfield());
    }
  }

  get half() {
    return -this.field.origin;
  }

  private sample(i: number, j: number) {
    const { n, heights } = this.field;
    const ci = i < 0 ? 0 : i > n - 1 ? n - 1 : i;
    const cj = j < 0 ? 0 : j > n - 1 ? n - 1 : j;
    return heights[cj * n + ci] as number;
  }

  /** Ground height at a point (bilinear; clamped at the edge of the field). */
  heightAt(x: number, z: number) {
    const { step, origin } = this.field;
    const fx = (x - origin) / step;
    const fz = (z - origin) / step;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const a = this.sample(i, j);
    const b = this.sample(i + 1, j);
    const c = this.sample(i, j + 1);
    const d = this.sample(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  /** Surface normal (unit) at a point. */
  normalAt(x: number, z: number, out: { x: number; y: number; z: number }) {
    const e = this.field.step;
    const dx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    const dz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    const l = Math.sqrt(dx * dx + 1 + dz * dz);
    out.x = -dx / l;
    out.y = 1 / l;
    out.z = -dz / l;
    return out;
  }

  /** Slope angle in radians. */
  slopeAt(x: number, z: number) {
    const n = { x: 0, y: 1, z: 0 };
    this.normalAt(x, z, n);
    return Math.acos(Math.min(1, n.y));
  }

  /** First hit of a ray against the ground (coarse march then bisection), or null. */
  raycast(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    max: number,
  ): number | null {
    const step = this.field.step * 1.5;
    let prev = 0;
    for (let t = step; t <= max; t += step) {
      if (oy + dy * t < this.heightAt(ox + dx * t, oz + dz * t)) {
        let lo = prev;
        let hi = t;
        for (let k = 0; k < 10; k++) {
          const mid = (lo + hi) / 2;
          if (oy + dy * mid < this.heightAt(ox + dx * mid, oz + dz * mid)) hi = mid;
          else lo = mid;
        }
        return lo;
      }
      prev = t;
    }
    return null;
  }
}
