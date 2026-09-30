import "./styles.css";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { AudioEngine } from "./audio/engine";
import { Dust } from "./engine/dust";
import { FollowCamera } from "./engine/follow-camera";
import {
  bindInput,
  isEditingTarget,
  nativeKeyTarget,
  readIntent,
  suppressRepeatedActivation,
} from "./engine/input";
import { detectQuality, FrameGovernor } from "./engine/quality";
import { World } from "./engine/world";
import { DOME as DOME_UNITS, medal, oxygenShare } from "./game/garden";
import type { HeightQuery } from "./game/light";
import { Play } from "./game/play";
import { Player } from "./game/player";
import { RoverBody } from "./game/rover";
import { SPECIES } from "./game/species";
import { worldFailed, worldReady } from "./loader";
import { Base, DOME, LANDING } from "./scene/base";
import { Caches, glow } from "./scene/caches";
import { Cairns } from "./scene/cairns";
import { FarmRover } from "./scene/farm-rover";
import { Finale } from "./scene/finale";
import { Gardener, type Motion, stillMotion } from "./scene/gardener/gardener";
import { giftSpot } from "./scene/gift-placement";
import { Grazers } from "./scene/grazers";
import { Intro } from "./scene/intro";
import { KitView } from "./scene/kit";
import { Lander } from "./scene/lander";
import { Lanternfolk } from "./scene/lanternfolk";
import { Perennial } from "./scene/perennial";
import { GardenView } from "./scene/plants/garden-view";
import { Target } from "./scene/target";
import { Arrival } from "./ui/Arrival";
import { Ending } from "./ui/Ending";
import { Hud2 } from "./ui/Hud2";
import { hud, introActions, say } from "./ui/hud-store";
import { sunAzimuth } from "./world/sky-model";

// THE MOON HAS A GARDENER (v2): wiring. One world, one gardener, one camera, one clock, one
// garden.

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let calm = motionQuery.matches;
const root = document.getElementById("root") as HTMLElement;
root.inert = true;
const runtime = new AbortController();
let disposed = false;
let ready = false;
let frameId = 0;
const cleanups: (() => void)[] = [];
function dispose() {
  if (disposed) return;
  disposed = true;
  ready = false;
  cancelAnimationFrame(frameId);
  runtime.abort();
  for (const cleanup of cleanups.reverse()) {
    try {
      cleanup();
    } catch {
      /* continue releasing the remaining owners */
    }
  }
  for (const key of Object.keys(introActions) as (keyof typeof introActions)[])
    introActions[key] = () => {};
  delete (window as unknown as Record<string, unknown>).__GAME__;
  for (const waiter of waiters.splice(0)) waiter.done();
  hud.reset();
  root.replaceChildren();
}
function fail() {
  if (disposed) return;
  dispose();
  worldFailed();
}
import.meta.hot?.dispose(dispose);
window.addEventListener(
  "pagehide",
  (event) => {
    if (!event.persisted) dispose();
  },
  { signal: runtime.signal },
);
const canvas = document.createElement("canvas");
canvas.tabIndex = 0;
canvas.inert = true;
canvas.className = "block h-full w-full touch-none";
canvas.setAttribute(
  "aria-label",
  "The lunar basin. Move with WASD or the arrow keys, Shift to lope, Space to jump, drag to look.",
);
root.appendChild(canvas);

const probe = document.createElement("canvas").getContext("webgl2");
const quality = detectQuality(probe);
probe?.getExtension("WEBGL_lose_context")?.loseContext();
canvas.addEventListener(
  "webglcontextlost",
  (event) => {
    event.preventDefault();
    fail();
  },
  { signal: runtime.signal },
);
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
  gardenRate: 1,
  /** A fixed camera (eye, target) for stills and films, instead of the follow camera. */
  view: null as null | { eye: THREE.Vector3; target: THREE.Vector3 },
};
const waiters: { n: number; done: () => void }[] = [];

async function start() {
  const world = await World.create(canvas, quality, runtime.signal);
  if (disposed || runtime.signal.aborted) {
    world.dispose();
    return;
  }
  cleanups.push(() => world.dispose());
  runtime.signal.throwIfAborted();
  const { stage, terrain } = world;
  const gardener = new Gardener(quality, runtime.signal);
  stage.scene.add(gardener.root);
  await gardener.ready;
  runtime.signal.throwIfAborted();
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
  cleanups.push(() => audio.dispose());
  const play = new Play(rulesGround, (cue, opts) => audio.play(cue, opts));
  const base = new Base(ground);
  const caches = new Caches(ground, play.garden.pickups);
  const plants = new GardenView(ground);
  const target = new Target(ground);
  const kit = new KitView(ground);
  stage.scene.add(base.group, caches.group, plants.group, target.mesh, kit.group);
  const grazers = new Grazers(ground, quality === "low" ? 2 : 3);
  stage.scene.add(grazers.group);
  cleanups.push(() => grazers.dispose());
  // Life in the basin: the lanternfolk on the rim, the builder on the ridge.
  const folk = new Lanternfolk(ground, quality === "low" ? 4 : 7);
  const cairns = new Cairns(ground, 120, -138);
  stage.scene.add(folk.group, cairns.group);
  stage.aoHidden.push(folk.group);
  folk.onGift = (x, z) => {
    const blooms = play.garden.plants.filter((plant) => plant.bloomed);
    const point = giftSpot(
      { x, z },
      blooms,
      rulesGround,
      [
        ...solidFootprints(),
        ...play.garden.plants.map((plant) => ({ x: plant.x, z: plant.z, r: 0.6 })),
      ],
      terrain.half,
    );
    if (!point) return false;
    const gift = {
      id: "gift",
      ...point,
      label: "Lanternfolk gift",
      seeds: { orchid: 2 },
      taken: false,
    };
    play.garden.pickups.push(gift);
    caches.add(gift);
    say(
      "Mission Control",
      "Gardener, they left something by your garden. The suit reads it as a seed. Go and see.",
      12,
    );
    return true;
  };
  stage.aoHidden.push(target.mesh);
  caches.onTouchdown = (x, y, z) => {
    for (let i = 0; i < 6; i++)
      dust.kick(new THREE.Vector3(x, y, z), 2.2, { x: Math.cos(i) * 2, z: Math.sin(i) * 2 });
    camera.bump(0.6);
  };

  const hudRoot = document.createElement("div");
  root.appendChild(hudRoot);
  const ui = createRoot(hudRoot);
  cleanups.push(() => ui.unmount());
  hud.set({ ready: false, reduced: calm });
  ui.render(
    <>
      <Hud2 />
      <Arrival />
      <Ending />
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
  camera.calm = calm;
  // A three-quarter view to begin with, the lander in the edge of the frame.
  camera.yaw = player.yaw + 0.65;
  const canPlay = () =>
    ready &&
    !document.hidden &&
    intro.phase === "done" &&
    !hud.get().controls &&
    !finale.cinematic &&
    finale.phase !== "medal";
  const input = bindInput(canvas, canPlay);
  cleanups.push(input.dispose);
  const resetInput = () => {
    input.reset();
    player.releaseInput();
    play.releaseInput();
  };
  // Sound starts with the first gesture (browsers insist); M mutes.
  const wake = () => {
    if (ready && !disposed) audio.unlock();
  };
  hud.set({ muted: audio.muted });
  cleanups.push(audio.subscribe((muted) => hud.set({ muted })));
  introActions.begin = () => {
    wake();
    if (!ready || intro.phase !== "title") return;
    resetInput();
    intro.begin();
    if (calm) intro.skip();
    hud.set({ intro: "descent" });
  };
  introActions.skip = () => {
    resetInput();
    intro.skip();
  };
  introActions.mute = () => {
    wake();
    audio.toggleMute();
  };
  introActions.controls = (open) => {
    if (!ready || intro.phase !== "done" || finale.cinematic || finale.phase === "medal") return;
    resetInput();
    hud.set({ controls: open });
    canvas.inert = !canPlay();
  };
  window.addEventListener("pointerdown", wake, { signal: runtime.signal });
  window.addEventListener(
    "keydown",
    (e) => {
      if (suppressRepeatedActivation(e)) {
        e.preventDefault();
        return;
      }
      wake();
      if (!ready || e.repeat || e.altKey || e.ctrlKey || e.metaKey || isEditingTarget(e.target))
        return;
      if (e.code === "KeyM") audio.toggleMute();
      if (e.code === "Enter" && intro.phase === "title" && !nativeKeyTarget(e.target)) {
        e.preventDefault();
        introActions.begin();
      }
      if (e.code === "Escape" && intro.phase === "descent") introActions.skip();
    },
    { signal: runtime.signal },
  );
  intro.onTouchdown = () => {
    for (let i = 0; i < 10; i++)
      dust.kick(new THREE.Vector3(site.x, site.y, site.z), 2.6, {
        x: Math.cos(i * 0.63) * 3,
        z: Math.sin(i * 0.63) * 3,
      });
    audio.play("place", { rate: 0.45, gain: 1 });
  };

  // The farm rover, parked by the pad; drivable once its fuel cell is charged (25%).
  const roverBody = new RoverBody();
  roverBody.place(3, 25, 0.35);
  const rover = new FarmRover(ground);
  stage.scene.add(rover.root);
  rover.update(roverBody, 0);
  let driving = false;
  let walkingDistance = camera.distance;
  play.onDrive = (enter) => {
    driving = enter;
    if (enter) {
      walkingDistance = camera.distance;
      camera.distance = 7.5;
    } else {
      roverBody.place(roverBody.x, roverBody.z, roverBody.yaw);
      // Step down on the driver's side.
      const c = Math.cos(roverBody.yaw);
      const s = Math.sin(roverBody.yaw);
      player.place(roverBody.x - 1.8 * c, roverBody.z + 1.8 * s, terrain, roverBody.yaw);
      camera.distance = walkingDistance;
    }
  };
  // Suit jets: two small flames under the pack while they fire.
  const jetFlames = [-1, 1].map((s) => {
    const f = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glow(),
        color: new THREE.Color(1.8, 1.9, 2.4),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    f.position.set(s * 0.11, 0.98, 0.33);
    f.scale.set(0.22, 0.55, 1);
    f.visible = false;
    gardener.root.add(f);
    return f;
  });

  // The ending: the Perennial on the landing ring, its colonists, the walk to the airlock.
  const toPad = Math.atan2(-DOME.x, -DOME.z);
  const door = new THREE.Vector3(DOME.x + Math.sin(toPad) * 7.4, 0, DOME.z + Math.cos(toPad) * 7.4);
  door.y = terrain.heightAt(door.x, door.z);
  const ship = new Perennial(ground, door);
  stage.scene.add(ship.root, ...ship.people);
  const padAt = new THREE.Vector3(LANDING.x, terrain.heightAt(LANDING.x, LANDING.z), LANDING.z);
  const finale = new Finale(ship, padAt, { ...DOME, y: terrain.heightAt(DOME.x, DOME.z) }, door);
  const shipObstacle = { x: padAt.x, z: padAt.z, r: 5.8 };
  const solidFootprints = () => [
    ...grazers.obstacles,
    ...base.obstacles,
    ...caches.obstacles,
    landerObstacle,
    { x: roverBody.x, z: roverBody.z, r: 1.8 },
    ...(finale.phase === "idle" ? [] : [shipObstacle]),
  ];
  play.placementBlocked = (action) => {
    const clearance =
      action.kind === "plant" ? Math.max(0.8, SPECIES[action.species].space / 2) : 0.8;
    return solidFootprints().some(
      (obstacle) =>
        Math.hypot(action.x - obstacle.x, action.z - obstacle.z) < obstacle.r + clearance,
    );
  };
  let callIn = -1;
  play.onEvent = (e) => {
    if (e.type === "milestone" && e.unlock === "full") {
      if (finale.phase === "idle") callIn = 6;
      else finale.full();
    }
    if (e.type === "arrived") finale.call();
  };
  const fader = document.createElement("div");
  fader.style.cssText =
    "position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:25";
  root.appendChild(fader);
  finale.onPhase = (p) => {
    resetInput();
    if (p === "waiting" || p === "walk" || p === "breath" || p === "medal")
      hud.set({ shipLanded: true });
    if (driving && (p === "landing" || p === "walk" || p === "breath")) play.onDrive?.(false);
    const g = play.garden;
    if (p === "landing" || p === "walk" || p === "breath")
      hud.set({ hidden: true, controls: false });
    if (p === "waiting") hud.set({ hidden: false });
    if (p === "breath") {
      player.place(finale.stand.x, finale.stand.z, terrain, finale.stand.yaw);
      gardener.root.visible = true;
    }
    if (p === "medal") {
      const m = medal(g) ?? "bronze";
      hud.set({
        ending: {
          medal: m,
          minutes: (g.filledAt >= 0 ? g.filledAt : g.time) / 60,
          plants: g.plants.length,
          species: g.journal.size,
        },
      });
      audio.play("ending");
    }
  };
  introActions.resume = () => {
    if (finale.phase !== "medal") return;
    resetInput();
    finale.resume();
    hud.set({ ending: null, hidden: false });
    canvas.inert = !canPlay();
    gardener.helmetOff = 0;
    finale.lift = 0;
    // Back outside, by the airlock, facing the pad.
    player.place(
      door.x + Math.sin(toPad) * 2.5,
      door.z + Math.cos(toPad) * 2.5,
      terrain,
      toPad + Math.PI,
    );
    camera.yaw = player.yaw;
  };
  introActions.replay = () => location.reload();
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
  window.addEventListener("resize", resize, { signal: runtime.signal });
  resize();

  const motion: Motion = stillMotion();
  const focus = new THREE.Vector3();
  let last = performance.now();
  let first = true;
  let dustLevel = 0.12;
  let lastIntro = intro.phase;
  let lastRail = "";
  const syncMotion = () => {
    calm = motionQuery.matches;
    hud.set({ reduced: calm });
    if (calm && intro.phase === "descent") intro.skip();
    camera.calm = calm;
  };
  motionQuery.addEventListener("change", syncMotion, { signal: runtime.signal });
  document.addEventListener(
    "visibilitychange",
    () => {
      resetInput();
      last = performance.now();
    },
    { signal: runtime.signal },
  );
  window.addEventListener("blur", resetInput, { signal: runtime.signal });

  const tick = (now: number) => {
    if (motionQuery.matches !== calm) syncMotion();
    const raw = Math.min(0.1, (now - last) / 1000);
    last = now;
    const dt = document.hidden ? 0 : test.frozen ? test.step : raw;
    test.step = 0;

    const intent = readIntent(dt > 0, dt);
    if (callIn > 0 && !hud.get().controls) {
      callIn -= dt;
      if (callIn <= 0) finale.call();
    }
    const playing =
      (intro.phase === "done" || intro.phase === "arrive") &&
      !finale.cinematic &&
      !hud.get().controls &&
      finale.phase !== "medal";
    if (!playing) {
      intent.moveX = intent.moveY = 0;
      intent.interact = intent.jump = intent.run = false;
      intent.seedSlot = -1;
      intent.seedStep = 0;
      intent.lookX = intent.lookY = intent.zoom = 0;
    }
    camera.drag(intent.lookX, intent.lookY);
    if (intent.zoom) camera.zoom(intent.zoom);
    const b = camera.basis();
    const wx = b.rx * intent.moveX + b.fx * intent.moveY;
    const wz = b.rz * intent.moveX + b.fz * intent.moveY;
    const kneeling = play.kneel > 0.05;
    const blockers = [
      ...grazers.obstacles,
      ...base.obstacles,
      ...caches.obstacles,
      landerObstacle,
      ...(finale.phase === "idle" ? [] : [shipObstacle]),
    ];
    player.jets = play.garden.unlocked.has("jets");
    if (driving && playing) {
      roverBody.update({ throttle: intent.moveY, steer: intent.moveX }, dt, terrain, blockers);
      rover.update(roverBody, dt);
      // The gardener rides in the driving seat.
      const seat = rover.seatAt();
      player.x = seat.x;
      player.z = seat.z;
      player.y = seat.y - 0.62;
      player.yaw = roverBody.yaw;
    } else if (playing)
      player.update(
        {
          x: kneeling ? 0 : wx,
          z: kneeling ? 0 : wz,
          run: intent.run,
          jump: intent.jump && !kneeling,
        },
        dt,
        terrain,
        [...blockers, { x: roverBody.x, z: roverBody.z, r: 1.8 }],
      );
    play.rover.driving = driving;
    play.rover.near = !driving && Math.hypot(player.x - roverBody.x, player.z - roverBody.z) < 3.4;
    play.update(playing ? dt * test.gardenRate : 0, intent, player);
    if (intro.phase === "arrive" && !gardener.root.visible) {
      gardener.root.visible = true;
    }

    gardener.root.position.set(player.x, player.y, player.z);
    gardener.root.rotation.y = player.yaw;
    motion.speed = playing && !driving ? player.speed : 0;
    motion.grounded = driving || player.grounded;
    motion.vy = player.grounded ? player.landing : player.vy;
    motion.turn = player.turn;
    motion.kneel = driving ? 0.85 : play.kneel;
    for (const f of jetFlames) {
      f.visible = player.thrusting;
      f.scale.set(0.2 + Math.random() * 0.06, 0.45 + Math.random() * 0.25, 1);
    }
    motion.lift = finale.lift;
    if (finale.cinematic) gardener.helmetOff = finale.helmet;
    const rel = Math.atan2(Math.sin(camera.yaw - player.yaw), Math.cos(camera.yaw - player.yaw));
    motion.lookYaw = -rel * 0.3;
    motion.lookPitch = -camera.pitch * 0.3;
    gardener.update(motion, dt, calm);
    // Regolith works into the suit as you walk.
    dustLevel = Math.min(0.85, dustLevel + player.speed * dt * 0.002);
    gardener.dust = dustLevel;

    const shortLandscape =
      window.innerWidth <= 720 &&
      window.innerHeight <= 550 &&
      window.innerWidth > window.innerHeight;
    const compactPortrait =
      window.innerWidth <= 400 &&
      window.innerHeight <= 650 &&
      window.innerWidth <= window.innerHeight;
    const layoutActive = intro.phase === "done" && !finale.cinematic && finale.phase !== "medal";
    const rail = layoutActive && shortLandscape ? Math.min(260, window.innerWidth * 0.46) : 0;
    const verticalOffset = layoutActive && compactPortrait ? 50 : 0;
    camera.frameScale = layoutActive && compactPortrait ? 1.4 : 1;
    const railKey = `${rail}:${verticalOffset}:${window.innerWidth}:${window.innerHeight}`;
    if (railKey !== lastRail) {
      if (rail || verticalOffset)
        stage.camera.setViewOffset(
          window.innerWidth,
          window.innerHeight,
          rail / 2,
          verticalOffset,
          window.innerWidth,
          window.innerHeight,
        );
      else stage.camera.clearViewOffset();
      lastRail = railKey;
    }
    camera.side = window.innerWidth < window.innerHeight ? 0.12 : 0.6;
    if (driving) {
      focus.set(roverBody.x, terrain.heightAt(roverBody.x, roverBody.z) + 0.4, roverBody.z);
      camera.update(dt, focus, roverBody.yaw, Math.abs(roverBody.speed) > 0.3);
    } else {
      focus.set(player.x, player.y, player.z);
      camera.update(dt, focus, player.yaw, player.speed > 0.2);
    }
    if (intro.phase !== "done") {
      intro.update(dt, calm);
      if (intro.phase === "arrive") {
        const eye = stage.camera.position.clone();
        const look = stage.camera
          .getWorldDirection(new THREE.Vector3())
          .multiplyScalar(10)
          .add(eye);
        intro.finish(eye, look, dt, calm);
      }
      stage.camera.position.copy(intro.eye);
      stage.camera.lookAt(intro.target);
    }
    if (intro.phase !== lastIntro) {
      resetInput();
      if (intro.phase === "done") {
        hud.set({ intro: "play", hidden: false, controls: true });
        play.start();
      }
      lastIntro = intro.phase;
    }
    if (finale.phase !== "idle") {
      finale.update(dt, oxygenShare(play.garden) >= 1, calm);
      if (finale.cinematic || finale.phase === "medal") {
        stage.camera.position.copy(finale.eye);
        stage.camera.lookAt(finale.target);
      }
      fader.style.opacity = String(finale.cinematic ? finale.fade : 0);
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
    kit.update(dt, play.garden);
    grazers.update(dt, {
      player,
      plants: play.garden.plants,
      obstacles: [
        ...base.obstacles,
        ...caches.obstacles,
        landerObstacle,
        { x: roverBody.x, z: roverBody.z, r: 1.8 },
        ...(finale.phase === "idle" ? [] : [shipObstacle]),
      ],
      calm,
    });
    folk.update(
      dt,
      world.sunClear,
      play.garden.plants.filter((p) => p.bloomed),
    );
    cairns.update(
      dt,
      stage.camera.position,
      stage.camera.getWorldDirection(new THREE.Vector3()),
      focus,
    );
    target.update(dt, play.action);
    world.update(dt * test.gardenRate, focus);
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
      ready = true;
      worldReady();
      hud.set({ ready: true });
      if (!filmed) play.start();
    }
    canvas.inert = !canPlay();
  };
  const frame = (now: number) => {
    if (disposed) return;
    try {
      tick(now);
    } catch {
      fail();
      return;
    }
    frameId = requestAnimationFrame(frame);
  };
  frameId = requestAnimationFrame(frame);

  if (import.meta.env.DEV || new URLSearchParams(location.search).has("e2e")) {
    (window as unknown as Record<string, unknown>).__GAME__ = {
      get ready() {
        return ready;
      },
      clock(rate = 1) {
        test.gardenRate = Number.isFinite(rate) ? Math.max(1, Math.min(600, rate)) : 1;
      },
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
          yaw: player.yaw,
          grounded: player.grounded,
          thrusting: player.thrusting,
          rover: { x: roverBody.x, z: roverBody.z },
          quality,
          scale: stage.renderScale,
          oxygen: oxygenShare(g),
          plants: g.plants.length,
          seeds: { ...g.seeds },
          can: g.can,
          action: play.action?.kind ?? null,
          sunClear: world.sunClear,
          time: g.time,
          intro: intro.phase,
          finale: finale.phase,
          selected: play.selected,
          driving,
          unlocked: [...g.unlocked],
          guide: hud.get().radio.map((line) => line.text),
          renderer: {
            calls: stage.renderer.info.render.calls,
            triangles: stage.renderer.info.render.triangles,
            ...stage.renderer.info.memory,
            pixelRatio: stage.renderer.getPixelRatio(),
          },
        };
      },
      /** The garden itself, for tests that set up a scene. */
      garden: () => play.garden,
      /** Fill the dome to the brim (the next frame completes it), for the ending. */
      fill() {
        play.garden.oxygen = DOME_UNITS - 0.01;
        play.garden.plants.push({
          id: 9999,
          species: "mooncress",
          x: 30,
          z: 30,
          growth: 1,
          water: 1,
          sun: 0.8,
          earth: 0,
          wet: 0,
          fit: 1,
          harvestIn: 0,
          bloomed: true,
        });
      },
      grazers: () => grazers.snapshot(),
      grazerDiagnostics: () => grazers.diagnostics(),
      finale: () => finale.phase,
    };
  }
}
start().catch(fail);
