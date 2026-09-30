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
import { Base, DOME } from "./scene/base";
import { Caches } from "./scene/caches";
import { Gardener, type Motion, stillMotion } from "./scene/gardener/gardener";
import { Intro } from "./scene/intro";
import { Lander } from "./scene/lander";
import { GardenView } from "./scene/plants/garden-view";
import { Target } from "./scene/target";
import { Arrival } from "./ui/Arrival";
import { Hud2 } from "./ui/Hud2";
import { hud, introActions } from "./ui/hud-store";
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
const params = new URLSearchParams(location.search);
/** Automated runs skip the arrival film unless they ask for it. */
const filmed = !params.has("e2e") || params.has("intro");
/** Where the gardener's lander sets down, west of the pad. */
const LANDER_AT = { x: -14, z: 13 };

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
  createRoot(hudRoot).render(
    <>
      <Hud2 />
      <Arrival />
    </>,
  );

  // The lander faces the dome; the gardener starts at the foot of its ladder, facing away from it.
  const lander = new Lander();
  const heading = Math.atan2(DOME.x - LANDER_AT.x, DOME.z - LANDER_AT.z);
  const site = { x: LANDER_AT.x, y: terrain.heightAt(LANDER_AT.x, LANDER_AT.z), z: LANDER_AT.z };
  stage.scene.add(lander.root);
  const intro = new Intro(lander, site, heading);
  const landerObstacle = { x: site.x, z: site.z, r: 3.1 };
  const player = new Player();
  player.place(
    site.x + Math.sin(heading) * 6.5,
    site.z + Math.cos(heading) * 6.5,
    terrain,
    heading + Math.PI,
  );
  const camera = new FollowCamera(stage.camera, terrain);
  // A three-quarter view to begin with, the lander in the edge of the frame.
  camera.yaw = player.yaw + 0.65;
  bindInput(canvas, () => intro.phase === "done");
  // Sound starts with the first gesture (browsers insist); M mutes.
  const wake = () => audio.unlock();
  hud.set({ muted: audio.muted });
  audio.subscribe((muted) => hud.set({ muted }));
  introActions.begin = () => {
    wake();
    if (intro.phase !== "title") return;
    intro.begin();
    hud.set({ intro: "descent" });
  };
  introActions.skip = () => intro.skip();
  introActions.mute = () => {
    wake();
    audio.toggleMute();
  };
  window.addEventListener("pointerdown", wake);
  window.addEventListener("keydown", (e) => {
    wake();
    if (e.code === "KeyM") audio.toggleMute();
    if (e.code === "Enter" && intro.phase === "title") introActions.begin();
    if (e.code === "Escape" && intro.phase === "descent") introActions.skip();
  });
  intro.onTouchdown = () => {
    for (let i = 0; i < 10; i++)
      dust.kick(new THREE.Vector3(site.x, site.y, site.z), 2.6, {
        x: Math.cos(i * 0.63) * 3,
        z: Math.sin(i * 0.63) * 3,
      });
    audio.play("place", { rate: 0.45, gain: 1 });
  };
  let controlsFor = 0;
  if (filmed) {
    hud.set({ intro: "title", hidden: true });
    gardener.root.visible = false;
    // Morning light from the east for the opening shot.
    world.time = 413;
  } else {
    intro.phase = "done";
    lander.root.visible = true;
    lander.root.position.set(site.x, site.y, site.z);
    lander.root.rotation.y = heading;
  }

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
    const playing = intro.phase === "done" || intro.phase === "arrive";
    if (!playing) {
      intent.moveX = intent.moveY = 0;
      intent.interact = intent.jump = false;
    }
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
      [...base.obstacles, ...caches.obstacles, landerObstacle],
    );
    play.update(dt, intent, player);
    if (intro.phase === "arrive" && !gardener.root.visible) {
      gardener.root.visible = true;
      hud.set({ intro: "play", hidden: false, controls: true });
      controlsFor = 18;
      play.start();
    }
    if (controlsFor > 0) {
      controlsFor -= dt;
      if (controlsFor <= 0) hud.set({ controls: false });
    }

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
    if (intro.phase !== "done") {
      intro.update(dt);
      if (intro.phase === "arrive") {
        const eye = stage.camera.position.clone();
        const look = stage.camera
          .getWorldDirection(new THREE.Vector3())
          .multiplyScalar(10)
          .add(eye);
        intro.finish(eye, look, dt);
      }
      stage.camera.position.copy(intro.eye);
      stage.camera.lookAt(intro.target);
    }
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
      if (!filmed) play.start();
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
