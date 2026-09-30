import "./styles.css";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { AudioEngine } from "./audio/engine";
import { Dust } from "./engine/dust";
import { FollowCamera } from "./engine/follow-camera";
import { bindInput, readIntent } from "./engine/input";
import { detectQuality, FrameGovernor } from "./engine/quality";
import { World } from "./engine/world";
import { oxygenShare } from "./game/garden";
import type { HeightQuery } from "./game/light";
import { Play } from "./game/play";
import { Player } from "./game/player";
import { worldReady } from "./loader";
import { Base } from "./scene/base";
import { Caches } from "./scene/caches";
import { Gardener, type Motion, stillMotion } from "./scene/gardener/gardener";
import { GardenView } from "./scene/plants/garden-view";
import { Target } from "./scene/target";
import { Hud2 } from "./ui/Hud2";
import { sunAzimuth } from "./world/sky-model";

// THE MOON HAS A GARDENER (v2): wiring. One world, one gardener, one camera, one clock, one
// garden.

const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const root = document.getElementById("root") as HTMLElement;
const canvas = document.createElement("canvas");
canvas.className = "block h-full w-full touch-none";
canvas.setAttribute(
  "aria-label",
  "The lunar basin. Move with WASD or the arrow keys, Shift to lope, Space to jump, drag to look.",
);
root.appendChild(canvas);

const quality = detectQuality(document.createElement("canvas").getContext("webgl2"));

/** Automated evidence and films: step time deterministically (?e2e only). */
const test = {
  frozen: false,
  step: 0,
  frames: 0,
  /** A fixed camera (eye, target) for stills and films, instead of the follow camera. */
  view: null as null | { eye: THREE.Vector3; target: THREE.Vector3 },
};
const waiters: { n: number; done: () => void }[] = [];

async function start() {
  const world = await World.create(canvas, quality);
  const { stage, terrain } = world;
  const gardener = new Gardener(quality);
  await gardener.ready;
  gardener.ground = (x, z) => terrain.heightAt(x, z);
  stage.scene.add(gardener.root);
  const dust = new Dust((x, z) => terrain.heightAt(x, z));
  stage.scene.add(dust.points);
  stage.aoHidden.push(dust.points);

  // The rules see the basin and the real land beyond it (for the hills' evening shadow).
  const rulesGround: HeightQuery = {
    heightAt: world.heightAt,
    normalAt: (x, z, out) => terrain.normalAt(x, z, out),
  };
  const ground = (x: number, z: number) => terrain.heightAt(x, z);
  const audio = new AudioEngine();
  const play = new Play(rulesGround, (cue, opts) => audio.play(cue, opts));
  const base = new Base(ground);
  const caches = new Caches(ground, play.garden.pickups);
  const plants = new GardenView(ground);
  const target = new Target(ground);
  stage.scene.add(base.group, caches.group, plants.group, target.mesh);
  stage.aoHidden.push(target.mesh);
  caches.onTouchdown = (x, y, z) => {
    for (let i = 0; i < 6; i++)
      dust.kick(new THREE.Vector3(x, y, z), 2.2, { x: Math.cos(i) * 2, z: Math.sin(i) * 2 });
    camera.bump(0.6);
  };

  const hudRoot = document.createElement("div");
  root.appendChild(hudRoot);
  createRoot(hudRoot).render(<Hud2 />);

  const player = new Player();
  player.place(3.5, 7, terrain, 0.35);
  const camera = new FollowCamera(stage.camera, terrain);
  camera.yaw = player.yaw;
  bindInput(canvas, () => true);
  // Sound starts with the first gesture (browsers insist); M mutes.
  const wake = () => audio.unlock();
  window.addEventListener("pointerdown", wake);
  window.addEventListener("keydown", (e) => {
    wake();
    if (e.code === "KeyM") audio.toggleMute();
  });

  gardener.onFootfall = (at, strength) => {
    at.y = terrain.heightAt(at.x, at.z);
    dust.kick(at, strength, { x: player.vx * 0.3, z: player.vz * 0.3 });
    if (strength > 0.9) camera.bump(0.4);
    audio.play("step", { gain: 0.25 + 0.3 * Math.min(1, strength), rate: 0.9 });
  };

  const governor = new FrameGovernor(
    1 / 55,
    (s) => stage.setScale(s),
    () => stage.renderScale,
    () => {
      if (stage.ao.enabled) {
        stage.ao.enabled = false;
        return true;
      }
      return false;
    },
  );

  const resize = () => stage.resize(window.innerWidth, window.innerHeight);
  window.addEventListener("resize", resize);
  resize();

  const motion: Motion = stillMotion();
  const focus = new THREE.Vector3();
  let last = performance.now();
  let first = true;
  let dustLevel = 0.12;

  const frame = (now: number) => {
    const raw = Math.min(0.1, (now - last) / 1000);
    last = now;
    const dt = test.frozen ? test.step : raw;
    test.step = 0;

    const intent = readIntent();
    camera.drag(intent.lookX, intent.lookY);
    if (intent.zoom) camera.zoom(intent.zoom);
    const b = camera.basis();
    const wx = b.rx * intent.moveX + b.fx * intent.moveY;
    const wz = b.rz * intent.moveX + b.fz * intent.moveY;
    const kneeling = play.kneel > 0.05;
    player.update(
      {
        x: kneeling ? 0 : wx,
        z: kneeling ? 0 : wz,
        run: intent.run,
        jump: intent.jump && !kneeling,
      },
      dt,
      terrain,
      [...base.obstacles, ...caches.obstacles],
    );
    play.update(dt, intent, player);

    gardener.root.position.set(player.x, player.y, player.z);
    gardener.root.rotation.y = player.yaw;
    motion.speed = player.speed;
    motion.grounded = player.grounded;
    motion.vy = player.grounded ? player.landing : player.vy;
    motion.turn = player.turn;
    motion.kneel = play.kneel;
    const rel = Math.atan2(Math.sin(camera.yaw - player.yaw), Math.cos(camera.yaw - player.yaw));
    motion.lookYaw = -rel * 0.3;
    motion.lookPitch = -camera.pitch * 0.3;
    gardener.update(motion, dt, calm);
    // Regolith works into the suit as you walk.
    dustLevel = Math.min(0.85, dustLevel + player.speed * dt * 0.002);
    gardener.dust = dustLevel;

    focus.set(player.x, player.y, player.z);
    camera.update(dt, focus, player.yaw, player.speed > 0.2);
    if (test.view) {
      stage.camera.position.copy(test.view.eye);
      stage.camera.lookAt(test.view.target);
    }
    dust.update(dt, stage.renderer.getPixelRatio());
    const share = oxygenShare(play.garden);
    plants.update(play.garden.plants, dt, sunAzimuth(world.time));
    base.update(dt, share);
    caches.update(dt, play.garden.unlocked);
    target.update(dt, play.action);
    world.update(dt, focus);
    world.render();
    governor.sample(raw);

    test.frames++;
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i];
      if (w && test.frames >= w.n) {
        waiters.splice(i, 1);
        w.done();
      }
    }
    if (first) {
      first = false;
      requestAnimationFrame(() => worldReady());
      play.start();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  if (import.meta.env.DEV || new URLSearchParams(location.search).has("e2e")) {
    (window as unknown as Record<string, unknown>).__GAME__ = {
      ready: true,
      freeze(on = true) {
        test.frozen = on;
      },
      step(dt: number) {
        test.step = dt;
        return new Promise<void>((done) => waiters.push({ n: test.frames + 1, done }));
      },
      settle(n = 6) {
        return new Promise<void>((done) => waiters.push({ n: test.frames + n, done }));
      },
      place(x: number, z: number, yaw = 0) {
        player.place(x, z, terrain, yaw);
        camera.yaw = yaw;
      },
      setSunTime(t: number) {
        world.time = t;
      },
      /** Look from `eye` at `target` ([x, y, z] each); no arguments returns to the follow camera. */
      view(eye?: number[], target?: number[]) {
        test.view =
          eye && target
            ? {
                eye: new THREE.Vector3().fromArray(eye),
                target: new THREE.Vector3().fromArray(target),
              }
            : null;
      },
      state() {
        const g = play.garden;
        return {
          x: player.x,
          y: player.y,
          z: player.z,
          speed: player.speed,
          quality,
          scale: stage.renderScale,
          oxygen: oxygenShare(g),
          plants: g.plants.length,
          seeds: { ...g.seeds },
          can: g.can,
          action: play.action?.kind ?? null,
          sunClear: world.sunClear,
        };
      },
      /** The garden itself, for tests that set up a scene. */
      garden: () => play.garden,
    };
  }
}
start();
