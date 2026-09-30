import "./styles.css";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { AudioEngine } from "./audio/engine";
import { Dust } from "./engine/dust";
import { FollowCamera } from "./engine/follow-camera";
import { bindInput, readIntent } from "./engine/input";
import { detectQuality, FrameGovernor } from "./engine/quality";
import { World } from "./engine/world";
import { DOME as DOME_UNITS, medal, oxygenShare } from "./game/garden";
import type { HeightQuery } from "./game/light";
import { Play } from "./game/play";
import { Player } from "./game/player";
import { RoverBody } from "./game/rover";
import { worldReady } from "./loader";
import { Base, DOME, LANDING } from "./scene/base";
import { Caches, glow } from "./scene/caches";
import { Cairns } from "./scene/cairns";
import { FarmRover } from "./scene/farm-rover";
import { Finale } from "./scene/finale";
import { Gardener, type Motion, stillMotion } from "./scene/gardener/gardener";
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
  const kit = new KitView(ground);
  stage.scene.add(base.group, caches.group, plants.group, target.mesh, kit.group);
  // Life in the basin: the lanternfolk on the rim, the builder on the ridge.
  const folk = new Lanternfolk(ground, quality === "low" ? 4 : 7);
  const cairns = new Cairns(ground, 120, -138);
  stage.scene.add(folk.group, cairns.group);
  stage.aoHidden.push(folk.group);
  folk.onGift = (x, z) => {
    const gift = {
      id: "gift",
      x,
      z,
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
  };
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
    finale.resume();
    hud.set({ ending: null, hidden: false });
    gardener.helmetOff = 0;
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
    if (callIn > 0) {
      callIn -= dt;
      if (callIn <= 0) finale.call();
    }
    const playing =
      (intro.phase === "done" || intro.phase === "arrive") &&
      !finale.cinematic &&
      finale.phase !== "medal";
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
    const blockers = [
      ...base.obstacles,
      ...caches.obstacles,
      landerObstacle,
      ...(finale.phase === "idle" ? [] : [shipObstacle]),
    ];
    player.jets = play.garden.unlocked.has("jets");
    if (driving && !finale.cinematic) {
      roverBody.update({ throttle: intent.moveY, steer: intent.moveX }, dt, terrain, blockers);
      rover.update(roverBody, dt);
      // The gardener rides in the driving seat.
      const seat = rover.seatAt();
      player.x = seat.x;
      player.z = seat.z;
      player.y = seat.y - 0.62;
      player.yaw = roverBody.yaw;
    } else if (!finale.cinematic)
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
    motion.speed = driving ? 0 : player.speed;
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

    if (driving) {
      focus.set(roverBody.x, terrain.heightAt(roverBody.x, roverBody.z) + 0.4, roverBody.z);
      camera.update(dt, focus, roverBody.yaw, Math.abs(roverBody.speed) > 0.3);
    } else {
      focus.set(player.x, player.y, player.z);
      camera.update(dt, focus, player.yaw, player.speed > 0.2);
    }
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
    if (finale.phase !== "idle") {
      finale.update(dt, oxygenShare(play.garden) >= 1);
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
      finale: () => finale.phase,
    };
  }
}
start();
