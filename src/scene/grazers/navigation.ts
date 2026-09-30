export interface GroundPoint {
  x: number;
  z: number;
}

export interface GrazerObstacle extends GroundPoint {
  r: number;
}

/** Includes the shell, browsing head and the furthest swinging foot. */
export const GRAZER_RADIUS = 2.4;
export const PLOT_RADIUS = 0.8;
type Ground = (x: number, z: number) => number;

export function clearGroundSegment(
  a: GroundPoint,
  b: GroundPoint,
  obstacles: readonly GrazerObstacle[],
  ground: Ground,
  radius = GRAZER_RADIUS,
) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length2 = dx * dx + dz * dz;
  for (const c of obstacles) {
    const t =
      length2 > 0 ? Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.z - a.z) * dz) / length2)) : 0;
    if (Math.hypot(a.x + dx * t - c.x, a.z + dz * t - c.z) < radius + c.r) return false;
  }
  // Check the whole stride, not only its endpoint: crater lips can be narrow.
  const steps = Math.max(1, Math.ceil(Math.sqrt(length2) / 0.7));
  let previous = ground(a.x, a.z);
  if (!Number.isFinite(previous)) return false;
  for (let i = 1; i <= steps; i++) {
    const y = ground(a.x + (dx * i) / steps, a.z + (dz * i) / steps);
    if (!Number.isFinite(y) || Math.abs(y - previous) > (Math.sqrt(length2) / steps) * 0.62 + 0.02)
      return false;
    previous = y;
  }
  return true;
}

/** A small local search, only when a straight browse route is obstructed. No work runs in a timer. */
export function grazerPath(
  from: GroundPoint,
  to: GroundPoint,
  obstacles: readonly GrazerObstacle[],
  ground: Ground,
): GroundPoint[] {
  if (clearGroundSegment(from, to, obstacles, ground)) return [{ ...to }];
  if (!clearGroundSegment(to, to, obstacles, ground)) return [];
  const cell = 1;
  const x0 = Math.floor(Math.min(from.x, to.x)) - 8;
  const z0 = Math.floor(Math.min(from.z, to.z)) - 8;
  const nx = Math.ceil(Math.max(from.x, to.x) - x0) + 9;
  const nz = Math.ceil(Math.max(from.z, to.z) - z0) + 9;
  // Authored browse routes fit in this window; an unreachable destination waits safely.
  if (nx > 56 || nz > 56) return [];
  const size = nx * nz;
  const cost = new Float64Array(size).fill(Infinity);
  const parent = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const heap: { id: number; score: number }[] = [];
  const point = (id: number): GroundPoint => ({
    x: x0 + (id % nx) * cell,
    z: z0 + Math.floor(id / nx) * cell,
  });
  const index = (p: GroundPoint) =>
    Math.round((p.z - z0) / cell) * nx + Math.round((p.x - x0) / cell);
  const start = index(from);
  const goal = index(to);
  if (
    !clearGroundSegment(from, point(start), obstacles, ground) ||
    !clearGroundSegment(point(goal), to, obstacles, ground)
  )
    return [];
  const push = (id: number, score: number) => {
    const entry = { id, score };
    let i = heap.length;
    heap.push(entry);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if ((heap[p]?.score ?? Infinity) <= score) break;
      heap[i] = heap[p] as { id: number; score: number };
      i = p;
    }
    heap[i] = entry;
  };
  const pop = () => {
    const first = heap[0];
    const last = heap.pop();
    if (heap.length && last) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if ((heap[child + 1]?.score ?? Infinity) < (heap[child]?.score ?? Infinity)) child++;
        if ((heap[child]?.score ?? Infinity) >= last.score) break;
        heap[i] = heap[child] as { id: number; score: number };
        i = child;
      }
      heap[i] = last;
    }
    return first?.id;
  };
  cost[start] = 0;
  push(start, 0);
  while (heap.length) {
    const id = pop();
    if (id === undefined || closed[id]) continue;
    if (id === goal) {
      const route: GroundPoint[] = [{ ...to }];
      for (let k = goal; k !== start && k >= 0; k = parent[k] as number) route.push(point(k));
      route.reverse();
      // Prune grid corners only when the entire swept body still clears them.
      const result: GroundPoint[] = [];
      let at = from;
      for (let i = 0; i < route.length; i++) {
        let last = i;
        while (
          last + 1 < route.length &&
          clearGroundSegment(at, route[last + 1] as GroundPoint, obstacles, ground)
        )
          last++;
        at = route[last] as GroundPoint;
        result.push(at);
        i = last;
      }
      return result;
    }
    closed[id] = 1;
    const a = point(id);
    const col = id % nx;
    const row = Math.floor(id / nx);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dz) || col + dx < 0 || col + dx >= nx || row + dz < 0 || row + dz >= nz)
          continue;
        const next = id + dz * nx + dx;
        if (closed[next] || !clearGroundSegment(a, point(next), obstacles, ground)) continue;
        const score = (cost[id] as number) + Math.hypot(dx, dz);
        if (score >= (cost[next] as number)) continue;
        cost[next] = score;
        parent[next] = id;
        const b = point(next);
        push(next, score + Math.hypot(to.x - b.x, to.z - b.z));
      }
  }
  return [];
}
