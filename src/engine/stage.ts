import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { type Dir, earthDirection } from "../world/sky-model";
import { type Quality, TIERS } from "./quality";

// One lighting model for the Moon. There is no air: the Sun is a single hard key (sharp shadows,
// no haze), and the only fill is light bounced off the sunlit regolith (a hemisphere from below)
// with a faint blue Earthshine from above. Reflections come from an environment built from the
// same sky: black, the Earth, and sunlit ground. AgX tone mapping, applied once in OutputPass.

/** Irradiance of the Sun in scene units, and the pre-exposure that keeps white suits in range. */
const SUN = 6.2;
const EXPOSURE = 1.02;
/** Half-width of the ground the shadow map covers around the player, and how far toward the Sun
 * it looks for casters (long low-Sun shadows from hills and the rim). */
const SHADOW_HALF = 34;
const SHADOW_REACH = 420;

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.05, 9000);
  readonly sun = new THREE.DirectionalLight(0xfff6ea, SUN);
  /** Light bounced from the sunlit ground around (and a little Earthshine): shadows stay readable. */
  readonly fill = new THREE.HemisphereLight(0x3d4555, 0x6e6a64, 1.15);
  readonly composer: EffectComposer;
  readonly ao: GTAOPass;
  readonly bloom: UnrealBloomPass;
  /** Objects GTAO's G-buffer should skip (sky, glows). */
  aoHidden: THREE.Object3D[] = [];
  quality: Quality;
  /** Sun direction (unit, toward the Sun). */
  readonly sunDir = new THREE.Vector3(0, 0.1, -1);
  private scale = 1;
  width = 1;
  height = 1;

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality;
    const tier = TIERS[quality];
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
      stencil: false,
    });
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = EXPOSURE;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = new THREE.Color(0x000000);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(tier.shadow, tier.shadow);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -SHADOW_HALF;
    sc.right = sc.top = SHADOW_HALF;
    sc.near = 1;
    sc.far = SHADOW_REACH + 60;
    const texel = (2 * SHADOW_HALF) / tier.shadow;
    this.sun.shadow.normalBias = texel * 1.2;
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.radius = 1.5;
    this.scene.add(this.sun, this.sun.target, this.fill);
    this.scene.environment = this.buildEnvironment();
    this.scene.environmentIntensity = 0.7;

    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: tier.msaa,
    });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new GTAOPass(this.scene, this.camera, 1, 1);
    this.ao.blendIntensity = 0.85;
    this.ao.updateGtaoMaterial({
      radius: 0.6,
      distanceExponent: 1.5,
      thickness: 1,
      scale: 1,
      samples: 12,
    });
    this.ao.updatePdMaterial({
      lumaPhi: 10,
      depthPhi: 2,
      normalPhi: 3,
      radius: 5,
      rings: 2,
      samples: 10,
    });
    const patched = this.ao as unknown as {
      _overrideVisibility(): void;
      _visibilityCache: THREE.Object3D[];
    };
    const original = patched._overrideVisibility.bind(this.ao);
    patched._overrideVisibility = () => {
      original();
      for (const o of this.aoHidden)
        if (o.visible) {
          o.visible = false;
          patched._visibilityCache.push(o);
        }
    };
    const aoRender = this.ao.render.bind(this.ao);
    this.ao.render = ((...args: Parameters<GTAOPass["render"]>) => {
      const shadows = this.renderer.shadowMap;
      const auto = shadows.autoUpdate;
      shadows.autoUpdate = false;
      try {
        aoRender(...args);
      } finally {
        shadows.autoUpdate = auto;
      }
    }) as GTAOPass["render"];
    this.ao.enabled = tier.ao;
    this.composer.addPass(this.ao);
    // Glare from the Sun's disc, Earth's glint and anything that glows; nothing else.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.35, 1.6);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    if (tier.smaa) this.composer.addPass(new SMAAPass());
  }

  /** A small equirectangular sky of what the Moon reflects: black space, the Earth, sunlit ground. */
  private buildEnvironment() {
    const w = 256;
    const h = 128;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    if (g) {
      g.fillStyle = "#000";
      g.fillRect(0, 0, w, h);
      // Ground below the horizon: bright regolith with a lighter band toward the horizon.
      const ground = g.createLinearGradient(0, h / 2, 0, h);
      ground.addColorStop(0, "#8d887f");
      ground.addColorStop(0.35, "#5d5a55");
      ground.addColorStop(1, "#3a3835");
      g.fillStyle = ground;
      g.fillRect(0, h / 2, w, h / 2);
      // Earth, low in the north.
      const e: Dir = earthDirection();
      const u = (Math.atan2(e.x, -e.z) / (Math.PI * 2) + 0.5) * w;
      const v = (0.5 - Math.asin(e.y) / Math.PI) * h;
      const glow = g.createRadialGradient(u, v, 0, u, v, 6);
      glow.addColorStop(0, "rgba(120,170,255,1)");
      glow.addColorStop(1, "rgba(120,170,255,0)");
      g.fillStyle = glow;
      g.fillRect(u - 8, v - 8, 16, 16);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
    tex.dispose();
    return env;
  }

  /** Point the Sun; the shadow box sits on the player, snapped to texels so it never swims. */
  setSun(dir: Dir, focus: THREE.Vector3) {
    this.sunDir.set(dir.x, dir.y, dir.z).normalize();
    const d = this.sunDir;
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), d).normalize();
    const up = new THREE.Vector3().crossVectors(d, right);
    const texel = (2 * SHADOW_HALF) / this.sun.shadow.mapSize.x;
    const a = Math.round(focus.dot(right) / texel) * texel;
    const b = Math.round(focus.dot(up) / texel) * texel;
    const c = focus.dot(d);
    const snapped = right.multiplyScalar(a).addScaledVector(up, b).addScaledVector(d, c);
    this.sun.target.position.copy(snapped);
    this.sun.position.copy(snapped).addScaledVector(d, SHADOW_REACH);
  }

  /** Render resolution as a fraction of the display (dynamic resolution). */
  setScale(s: number) {
    const clamped = Math.max(0.5, Math.min(1, s));
    if (Math.abs(clamped - this.scale) < 0.02) return;
    this.scale = clamped;
    this.resize(this.width, this.height);
  }

  get renderScale() {
    return this.scale;
  }

  resize(w: number, h: number) {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    const ratio =
      Math.min(window.devicePixelRatio || 1, TIERS[this.quality].pixelRatio) * this.scale;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(this.width, this.height, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.composer.render();
  }
}
