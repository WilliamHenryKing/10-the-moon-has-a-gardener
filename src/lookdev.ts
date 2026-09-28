import * as THREE from "three";
import { detectQuality } from "./engine/quality";
import { World } from "./engine/world";
import type { Plant } from "./game/garden";
import { SPECIES_ORDER } from "./game/species";
import { Gardener, type Motion, stillMotion } from "./scene/gardener/gardener";
import { GardenView } from "./scene/plants/garden-view";
import { sunAzimuth } from "./world/sky-model";

// Look-dev harness (docs/visual, Visual Quality Directive §3.3), development only: the gardener on
// the landing pad in the game's own world, light and post chain, from fixed cameras, with the
// gait, a jump pose or a kneel set by parameter. Driven by the URL or window.__LOOKDEV__.
//   cam=full|face|side|back|low · angle (deg) · speed (m/s) · phase · air=1 · kneel · t (Sun, s)

type Params = Record<string, string>;
const params: Params = Object.fromEntries(new URLSearchParams(location.search).entries());
const num = (k: string, d: number) => (params[k] !== undefined ? Number(params[k]) : d);

const canvas = document.createElement("canvas");
document.body.prepend(canvas);
const quality = detectQuality(document.createElement("canvas").getContext("webgl2"));
const CAMS: Record<
  string,
  { eye: [number, number, number]; look: [number, number, number]; fov: number }
> = {
  full: { eye: [1.6, 1.55, -3.4], look: [0, 1.0, 0], fov: 38 },
  face: { eye: [0.35, 1.72, -1.05], look: [0, 1.62, 0], fov: 32 },
  side: { eye: [4.2, 1.1, 0], look: [0, 0.95, 0], fov: 30 },
  back: { eye: [-1.2, 2.4, 4.6], look: [0, 1.1, -0.4], fov: 45 },
  low: { eye: [1.2, 0.35, -2.2], look: [0, 0.6, 0], fov: 40 },
  /** The plant rows: every species at four stages (plants=1). */
  plants: { eye: [0, 2.4, -7.5], look: [0, 0.4, -1.5], fov: 40 },
  plantsClose: { eye: [-1.5, 1.2, -3.2], look: [-1.5, 0.35, -0.8], fov: 40 },
};
let garden: GardenView | null = null;
const rows: Plant[] = [];

let world: World | null = null;
let gardener: Gardener | null = null;
const motion: Motion = stillMotion();
let angle = 0;
let frames = 0;
let dirty = true;
const waiters: { n: number; done: () => void }[] = [];
const origin = new THREE.Vector3(2, 0, 3);

function apply(p: Params) {
  if (Object.keys(p).length) {
    for (const k of Object.keys(params)) delete params[k];
    Object.assign(params, p);
  }
  if (!world || !gardener) return;
  const cam = CAMS[params.cam ?? "full"] ?? (CAMS.full as (typeof CAMS)["full"]);
  angle = (num("angle", 0) * Math.PI) / 180;
  const c = world.stage.camera;
  c.fov = cam.fov;
  const turn = (v: [number, number, number]) =>
    new THREE.Vector3(...v).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI).add(origin);
  c.position.copy(turn(cam.eye));
  c.lookAt(turn(cam.look));
  c.updateProjectionMatrix();
  motion.speed = num("speed", 0);
  motion.grounded = params.air !== "1";
  motion.kneel = num("kneel", 0);
  gardener.phase = num("phase", gardener.phase);
  if (params.t !== undefined) world.time = num("t", 0);
  dirty = true;
}

const api = {
  ready: false,
  set(p: Params) {
    apply(p);
  },
  /** Advance the animation by dt without real time passing (films). */
  step(dt: number) {
    gardener?.update(motion, dt, false);
  },
  settle(n = 6) {
    return new Promise<void>((done) => waiters.push({ n: frames + n, done }));
  },
  info() {
    const gl = world?.stage.renderer.getContext();
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      gpu: gl
        ? String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
        : "",
      three: THREE.REVISION,
      quality,
    };
  },
};
(window as unknown as { __LOOKDEV__: typeof api }).__LOOKDEV__ = api;

async function start() {
  world = await World.create(canvas, quality);
  gardener = new Gardener(quality);
  await gardener.ready;
  const g = gardener;
  g.ground = (x, z) => (world as World).terrain.heightAt(x, z);
  world.stage.scene.add(g.root);
  origin.y = world.terrain.heightAt(origin.x, origin.z);
  if (params.plants === "1") {
    g.root.visible = false;
    const w = world;
    garden = new GardenView((x, z) => w.terrain.heightAt(x, z));
    w.stage.scene.add(garden.group);
    const stages = [0.15, 0.4, 0.75, 1];
    SPECIES_ORDER.forEach((species, i) => {
      stages.forEach((growth, j) => {
        // In the camera's frame (the look-dev turns everything by π about the origin).
        const x = origin.x - (i - 3) * 1.3;
        const z = origin.z + 1.4 - j * 1.6 + 3;
        rows.push({
          id: rows.length + 1,
          species,
          x,
          z,
          growth,
          water: 1,
          sun: 1,
          earth: 1,
          wet: 1,
          fit: 1,
          harvestIn: 0,
          bloomed: growth >= 1,
        });
      });
    });
    garden.update(rows, 0, 0);
    for (let k = 0; k < 3; k++) garden.update(rows, 1, sunAzimuth(w.time));
  }
  const resize = () => world?.stage.resize(window.innerWidth, window.innerHeight);
  window.addEventListener("resize", resize);
  resize();
  apply({});
  const tick = () => {
    if (!world || !gardener) return;
    gardener.root.position.copy(origin);
    gardener.root.rotation.y = Math.PI + angle;
    if (dirty) gardener.update(motion, 0, false);
    dirty = false;
    garden?.update(rows, 0, sunAzimuth(world.time));
    world.update(0, origin);
    world.render();
    frames++;
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i];
      if (w && frames >= w.n) {
        waiters.splice(i, 1);
        w.done();
      }
    }
    if (frames > 4) api.ready = true;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
start();
