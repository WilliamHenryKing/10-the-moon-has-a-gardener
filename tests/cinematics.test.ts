import { expect, test } from "bun:test";
import * as THREE from "three";
import { Finale } from "../src/scene/finale";
import { Intro } from "../src/scene/intro";
import type { Lander } from "../src/scene/lander";
import type { Perennial } from "../src/scene/perennial";

test("live calm settles an in-flight arrival once and hands over the camera directly", () => {
  const lander = { root: new THREE.Group(), update() {} };
  const intro = new Intro(lander as unknown as Lander, { x: -14, y: 2, z: 13 }, 1);
  let landings = 0;
  intro.onTouchdown = () => landings++;
  intro.begin();
  intro.update(2);
  intro.update(0.016, true);
  expect(intro.phase).toBe("arrive");
  expect(lander.root.position.toArray()).toEqual([-14, 2, 13]);
  const eye = new THREE.Vector3(4, 5, 6);
  const target = new THREE.Vector3(1, 2, 3);
  intro.finish(eye, target, 0.016, true);
  intro.skip();
  intro.begin();
  expect(intro.phase).toBe("done");
  expect(intro.eye.toArray()).toEqual(eye.toArray());
  expect(intro.target.toArray()).toEqual(target.toArray());
  expect(landings).toBe(1);
});

test("the ship waits for actual oxygen and a resumed medal cannot restart its ending", () => {
  let walking = false;
  let left = 30;
  let disembarks = 0;
  const ship = {
    pose() {},
    disembark() {
      walking = true;
      disembarks++;
    },
    update(dt: number) {
      if (walking) left = Math.max(0, left - dt);
    },
    get stillWalking() {
      return left;
    },
  };
  const finale = new Finale(
    ship as unknown as Perennial,
    new THREE.Vector3(),
    { x: 0, y: 0, z: -20, r: 8 },
    new THREE.Vector3(0, 0, -12),
  );
  const phases: string[] = [];
  finale.onPhase = (phase) => phases.push(phase);
  finale.call();
  finale.call();
  finale.update(0.1, false, true);
  expect(finale.phase).toBe("waiting");
  expect(disembarks).toBe(0);
  finale.full();
  finale.update(0.1, true, true);
  expect(finale.phase).toBe("breath");
  expect(disembarks).toBe(1);
  finale.update(9.1, true, true);
  expect(finale.phase).toBe("medal");
  finale.resume();
  finale.update(30, true, true);
  expect(finale.phase).toBe("waiting");
  expect(phases).toEqual(["landing", "waiting", "walk", "breath", "medal"]);
  expect(disembarks).toBe(1);
});
