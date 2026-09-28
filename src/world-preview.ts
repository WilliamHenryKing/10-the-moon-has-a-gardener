import * as THREE from "three";
import { detectQuality } from "./engine/quality";
import { World } from "./engine/world";
import { PLACES } from "./world/terrain-gen";

// World preview (development only): the basin, sky and light from fixed cameras, with the Sun
// set by time. Driven by the URL or window.__WORLD__ so batch renders are repeatable.
//   cam=pad|overview|bowl|earth|ridge|ground|rim · t=seconds (Sun position) · play=1

const params = new URLSearchParams(location.search);
const canvas = document.createElement("canvas");
document.body.prepend(canvas);
const probe = document.createElement("canvas").getContext("webgl2");
const quality = detectQuality(probe);

interface Cam {
  eye: [number, number, number];
  look: [number, number, number];
  fov: number;
}
const b = PLACES.bowl;
const e = PLACES.earthside;
const g = PLACES.ridge;
const CAMS: Record<string, Cam> = {
  pad: { eye: [6, 2.2, 9], look: [-4, 1.2, -12], fov: 55 },
  overview: { eye: [0, 140, 210], look: [0, 0, 0], fov: 50 },
  bowl: { eye: [b.x + 40, 8, b.z - 30], look: [b.x, -6, b.z], fov: 55 },
  earth: { eye: [e.x, 12, e.z + 60], look: [e.x, 20, e.z - 200], fov: 50 },
  ridge: { eye: [g.x - 50, 6, g.z + 40], look: [g.x, 4, g.z], fov: 50 },
  ground: { eye: [3, 0.9, 3], look: [-2, 0.2, -3], fov: 50 },
  rim: { eye: [150, 4, 60], look: [230, 20, 70], fov: 55 },
};

let world: World | null = null;
let play = params.get("play") === "1";
let frames = 0;
const waiters: { n: number; done: () => void }[] = [];
const focus = new THREE.Vector3();

function apply(p: URLSearchParams) {
  if (!world) return;
  const cam = CAMS[p.get("cam") ?? "pad"] ?? (CAMS.pad as Cam);
  const c = world.stage.camera;
  c.fov = cam.fov;
  c.position.set(...cam.eye);
  // Keep the eye above the ground.
  c.position.y = Math.max(c.position.y, world.terrain.heightAt(c.position.x, c.position.z) + 0.6);
  c.lookAt(new THREE.Vector3(...cam.look));
  c.updateProjectionMatrix();
  focus.set(cam.look[0], 0, cam.look[2]);
  focus.y = world.terrain.heightAt(focus.x, focus.z);
  if (p.has("t")) world.time = Number(p.get("t"));
  play = p.get("play") === "1";
}

const api = {
  ready: false,
  set(p: Record<string, string>) {
    apply(new URLSearchParams(p));
    step(0);
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
      quality,
      three: THREE.REVISION,
    };
  },
};
(window as unknown as { __WORLD__: typeof api }).__WORLD__ = api;

function step(dt: number) {
  if (!world) return;
  world.update(dt, focus);
}

async function start() {
  world = await World.create(canvas, quality);
  const resize = () => world?.stage.resize(window.innerWidth, window.innerHeight);
  window.addEventListener("resize", resize);
  resize();
  apply(params);
  step(0);
  let last = performance.now();
  const hud = document.getElementById("hud");
  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    step(play ? dt : 0);
    world?.render();
    frames++;
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i];
      if (w && frames >= w.n) {
        waiters.splice(i, 1);
        w.done();
      }
    }
    if (hud && frames % 30 === 0 && world) {
      const info = world.stage.renderer.info.render;
      hud.textContent = `${quality} · t ${world.time.toFixed(0)} s · calls ${info.calls} · ${(1000 * dt).toFixed(1)} ms`;
    }
    if (frames > 4) api.ready = true;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
start();
