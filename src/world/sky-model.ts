// Where the Sun and Earth are. Near the lunar south pole the Sun never climbs high: across one
// lunar day it circles the horizon, a few degrees up, so shadows are long and sweep all the way
// round. One compressed day lasts DAY_SECONDS. Earth never moves in the Moon's sky: it hangs low
// in the north, and its phase follows the Sun (full when the Sun is behind you, new when the Sun
// stands beside it). Pure functions; +X east, -Z north, +Y up.

export const DAY_SECONDS = 480;
/** Degrees above the horizon. */
export const SUN_ELEVATION = 9.5;
export const EARTH_ELEVATION = 12;
/** Degrees east of north. */
export const EARTH_AZIMUTH = 8;

export interface Dir {
  x: number;
  y: number;
  z: number;
}

const rad = Math.PI / 180;

/** Unit vector for an azimuth (degrees east of north) and elevation (degrees). */
export function fromAzEl(az: number, el: number, out: Dir = { x: 0, y: 0, z: 0 }): Dir {
  const a = az * rad;
  const e = el * rad;
  out.x = Math.sin(a) * Math.cos(e);
  out.y = Math.sin(e);
  out.z = -Math.cos(a) * Math.cos(e);
  return out;
}

/** The Sun's azimuth (degrees east of north) at a game time in seconds. */
export function sunAzimuth(t: number) {
  return ((((t / DAY_SECONDS) * 360 + 150) % 360) + 360) % 360;
}

/** The Sun's direction at a game time; a slight nod in height over the day. */
export function sunDirection(t: number, out?: Dir): Dir {
  const az = sunAzimuth(t);
  const el = SUN_ELEVATION + Math.sin(az * rad * 2 + 0.6) * 1.5;
  return fromAzEl(az, el, out);
}

export function earthDirection(out?: Dir): Dir {
  return fromAzEl(EARTH_AZIMUTH, EARTH_ELEVATION, out);
}
