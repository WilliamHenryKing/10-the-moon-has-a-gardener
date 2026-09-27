import * as THREE from "three";
import { PALETTE } from "./palette";

/** Radial glow drawn once into a canvas; used for the Sun disc and its halo. */
function glowTexture(inner: string, outer: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.18, inner);
    grad.addColorStop(0.3, outer);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function stars(count: number): THREE.Points {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < count; i++) {
    const u = rnd() * 2 - 1;
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const y = Math.abs(u) * 0.95 + 0.02; // upper sky only
    pos.set([Math.cos(a) * r * 400, y * 400, Math.sin(a) * r * 400], i * 3);
    const b = 0.35 + rnd() ** 3 * 1.6;
    const warm = rnd();
    col.set([b * (0.85 + warm * 0.15), b * 0.9, b * (1.05 - warm * 0.2)], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 1.3,
    sizeAttenuation: false,
    vertexColors: true,
    depthWrite: false,
    fog: false,
  });
  return new THREE.Points(geo, mat);
}

export interface Sky {
  group: THREE.Group;
  setSun(dir: THREE.Vector3): void;
}

/**
 * Stars, the low polar Sun and Earth. Earth is a NASA Blue Marble plate (public domain,
 * NASA Earth Observatory) rendered in pre-production; it hangs over the northern horizon.
 */
export function createSky(): Sky {
  const group = new THREE.Group();
  group.add(stars(1800));

  const sun = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture("rgba(255,250,235,1)", "rgba(255,190,120,0.18)"),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  sun.scale.setScalar(70);
  group.add(sun);

  const earthMat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false });
  earthMat.opacity = 0;
  const earth = new THREE.Sprite(earthMat);
  earth.position.set(-70, 26, -330); // low over the northern rim: Earthrise
  earth.scale.setScalar(64);
  earth.renderOrder = -1;
  group.add(earth);
  new THREE.TextureLoader().load(
    `${import.meta.env.BASE_URL}earth/earth_americas_half.png`,
    (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      earthMat.map = t;
      earthMat.needsUpdate = true;
      earthMat.opacity = 1;
    },
  );

  return {
    group,
    setSun(dir) {
      sun.position.copy(dir).multiplyScalar(380);
      sun.position.y = Math.max(sun.position.y, 18);
    },
  };
}

export const SPACE = new THREE.Color(PALETTE.space);
