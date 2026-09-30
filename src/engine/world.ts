import * as THREE from "three";
import { sunDirection } from "../world/sky-model";
import { Terrain } from "../world/terrain";
import { FarLand } from "./far-land";
import { Ground, regolithMaterial } from "./ground";
import { farHorizon, groundHeight, type Lunar, loadLunar } from "./lunar";
import { type Quality, TIERS } from "./quality";
import { Assets } from "./resources";
import { Sky } from "./sky";
import { FAR_LAYER, Stage } from "./stage";
import { SunMask } from "./sun-mask";
import { loadRegolith, setAnisotropy } from "./textures";

// The place itself, independent of the game: the basin, the real land around it, its sky and its
// light, advanced by the clock. The game adds the gardener, the plants and the life on top.

/** The far land's mesh: ring spacing and vertices per ring, by quality. */
const FAR_DETAIL: Record<Quality, { ratio: number; segs: number }> = {
  high: { ratio: 1.022, segs: 1024 },
  medium: { ratio: 1.03, segs: 768 },
  low: { ratio: 1.045, segs: 512 },
};

export class World {
  private disposed = false;
  private sunVec = new THREE.Vector3();
  private sunView = new THREE.Vector3();
  /** Game time in seconds, which sets where the Sun stands. */
  time = 0;
  /** How much of the Sun clears the hills around the basin, seen from the focus (0 … 1). */
  sunClear = 1;
  /** Ground height anywhere: the basin, then the real land around it. */
  readonly heightAt: (x: number, z: number) => number;

  private constructor(
    readonly stage: Stage,
    readonly terrain: Terrain,
    readonly sky: Sky,
    readonly ground: Ground,
    readonly farLand: FarLand,
    readonly mask: SunMask,
    private regolith: { sunView: { value: THREE.Vector3 } },
    lunar: Lunar,
    private assets: Assets,
  ) {
    this.heightAt = groundHeight(terrain, lunar);
  }

  static async create(canvas: HTMLCanvasElement, quality: Quality, signal?: AbortSignal) {
    const assets = new Assets(signal);
    let stage: Stage | undefined;
    let mask: SunMask | undefined;
    let ground: Ground | undefined;
    try {
      stage = new Stage(canvas, quality);
      const tier = TIERS[quality];
      setAnisotropy(Math.min(8, stage.renderer.capabilities.getMaxAnisotropy()));
      const [terrain, maps, lunar] = await Promise.all([
        Terrain.load(assets.signal),
        loadRegolith(assets),
        loadLunar(assets),
      ]);
      // The basin's long shadows: finer and fresher on a strong GPU; a phone gets a lighter pass
      // (the Sun creeps, and the cross-fade hides the longer interval).
      assets.signal.throwIfAborted();
      mask = new SunMask(
        stage.renderer,
        terrain,
        quality === "high" ? 768 : quality === "medium" ? 512 : 384,
        quality === "high" ? 0.35 : quality === "medium" ? 0.5 : 0.7,
        quality === "high" ? 88 : 80,
        lunar.grids.near,
      );
      const { material, uniforms } = regolithMaterial(maps, mask);
      ground = new Ground(terrain, material, tier.lod);
      const farLand = new FarLand(lunar, terrain, maps, FAR_DETAIL[quality], stage.sunIrradiance);
      farLand.mesh.layers.enable(FAR_LAYER);
      const sky = new Sky(tier.detail, assets);
      stage.scene.add(ground.group, farLand.mesh, sky.group);
      stage.aoHidden.push(sky.group);
      await sky.ready;
      assets.signal.throwIfAborted();
      return new World(stage, terrain, sky, ground, farLand, mask, uniforms, lunar, assets);
    } catch (error) {
      assets.dispose();
      mask?.dispose();
      ground?.dispose();
      stage?.dispose();
      throw error;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.mask.dispose();
    this.assets.dispose();
    this.ground.dispose();
    this.stage.dispose();
  }

  get sunDir() {
    return this.sunVec;
  }

  /** Advance the Sun and everything that follows it, around a focus point (the player). */
  update(dt: number, focus: THREE.Vector3) {
    this.stage.renderer.info.reset();
    this.time += dt;
    const s = sunDirection(this.time);
    this.sunVec.set(s.x, s.y, s.z);
    this.stage.setSun(s, focus);
    // The hills beyond the rim (the rim itself shadows through the shadow map and the mask).
    const hl = Math.hypot(s.x, s.z);
    const sky = farHorizon(
      this.heightAt,
      focus.x,
      focus.y + 1,
      focus.z,
      s.x / hl,
      s.z / hl,
      this.terrain.half,
    );
    const margin = Math.atan2(s.y, hl) - Math.atan(sky);
    // Eased in time as well as across the Sun's disc: the skyline is sampled coarsely from where
    // the gardener stands, so near its edge it would otherwise flicker as they walk.
    const clear = THREE.MathUtils.smoothstep(margin, -0.006, 0.006);
    this.sunClear += (clear - this.sunClear) * Math.min(1, dt * 2.5);
    this.stage.setSunVisibility(this.sunClear);
    this.mask.update(this.sunVec, dt);
    const cam = this.stage.camera;
    this.ground.update(cam.position);
    this.sky.update(cam, this.sunVec, dt, this.stage.renderer.getPixelRatio());
    cam.updateMatrixWorld();
    this.sunView.copy(this.sunVec).transformDirection(cam.matrixWorldInverse);
    this.regolith.sunView.value.copy(this.sunView);
    this.farLand.update(this.sunVec, this.sunView);
  }

  render() {
    this.stage.render();
  }
}
