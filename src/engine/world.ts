import * as THREE from "three";
import { sunDirection } from "../world/sky-model";
import { Terrain } from "../world/terrain";
import { Ground, regolithMaterial } from "./ground";
import { type Quality, TIERS } from "./quality";
import { Sky } from "./sky";
import { Stage } from "./stage";
import { SunMask } from "./sun-mask";
import { loadRegolith, setAnisotropy } from "./textures";

// The place itself, independent of the game: the basin, its sky and its light, advanced by the
// clock. The game adds the gardener, the plants and the life on top.

export class World {
  private sunVec = new THREE.Vector3();
  private sunView = new THREE.Vector3();
  /** Game time in seconds, which sets where the Sun stands. */
  time = 0;

  private constructor(
    readonly stage: Stage,
    readonly terrain: Terrain,
    readonly sky: Sky,
    readonly ground: Ground,
    readonly mask: SunMask,
    private regolith: { sunView: { value: THREE.Vector3 } },
  ) {}

  static async create(canvas: HTMLCanvasElement, quality: Quality) {
    const stage = new Stage(canvas, quality);
    const tier = TIERS[quality];
    setAnisotropy(Math.min(8, stage.renderer.capabilities.getMaxAnisotropy()));
    const [terrain, maps] = await Promise.all([Terrain.load(), loadRegolith()]);
    const mask = new SunMask(
      stage.renderer,
      terrain,
      quality === "low" ? 384 : 768,
      quality === "low" ? 0.6 : 0.3,
      quality === "low" ? 56 : 88,
    );
    const { material, uniforms } = regolithMaterial(maps, mask);
    const ground = new Ground(terrain, material, tier.lod);
    const sky = new Sky(tier.detail);
    stage.scene.add(ground.group, sky.group);
    stage.aoHidden.push(sky.group);
    await sky.ready;
    return new World(stage, terrain, sky, ground, mask, uniforms);
  }

  get sunDir() {
    return this.sunVec;
  }

  /** Advance the Sun and everything that follows it, around a focus point (the player). */
  update(dt: number, focus: THREE.Vector3) {
    this.time += dt;
    const s = sunDirection(this.time);
    this.sunVec.set(s.x, s.y, s.z);
    this.stage.setSun(s, focus);
    this.mask.update(this.sunVec, dt);
    const cam = this.stage.camera;
    this.ground.update(cam.position);
    this.sky.update(cam, this.sunVec, dt, this.stage.renderer.getPixelRatio());
    cam.updateMatrixWorld();
    this.sunView.copy(this.sunVec).transformDirection(cam.matrixWorldInverse);
    this.regolith.sunView.value.copy(this.sunView);
  }

  render() {
    this.stage.render();
  }
}
