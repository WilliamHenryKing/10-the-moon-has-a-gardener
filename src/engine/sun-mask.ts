import * as THREE from "three";
import type { Terrain } from "../world/terrain";

// Where the Sun reaches, over the whole basin. The Sun stands only ten degrees up, so hills, crater
// rims and the basin wall throw shadows hundreds of metres long; a player-centred shadow map cannot
// hold them. This GPU pass marches from every point of a world-sized grid toward the Sun over the
// heightfield, keeping the steepest horizon it meets, and compares it with the Sun's height: soft
// by the width of the Sun's disc, so edges have a true penumbra. Two targets cross-fade between
// updates, so the shadows sweep smoothly as the Sun circles. The ground (and anything planted)
// samples it; the garden rules will read the same visibility for their light shares.

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D heights;
  uniform vec3 sunDir;
  uniform float extent;
  uniform int steps;
  varying vec2 vUv;
  float heightAt(vec2 p) { return texture2D(heights, clamp(p / (2.0 * extent) + 0.5, 0.0, 1.0)).r; }
  void main() {
    vec2 p = (vUv - 0.5) * 2.0 * extent;
    float h0 = heightAt(p) + 0.25;
    vec2 dir = normalize(sunDir.xz);
    float sunTan = sunDir.y / length(sunDir.xz);
    float horizon = -1.0;
    float dist = 0.0;
    float stepLen = 0.6;
    for (int i = 0; i < 96; i++) {
      if (i >= steps) break;
      dist += stepLen;
      stepLen *= 1.075;
      float h = heightAt(p + dir * dist);
      horizon = max(horizon, (h - h0) / dist);
    }
    // The Sun's disc is about half a degree across: visibility ramps over that angle.
    float vis = smoothstep(-0.0047, 0.0047, sunTan - horizon);
    gl_FragColor = vec4(vis, vis, vis, 1.0);
  }`;

export class SunMask {
  readonly targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  /** 0 … 1 cross-fade from targets[0] to targets[1]. */
  readonly blend = { value: 0 };
  readonly textures: { a: { value: THREE.Texture }; b: { value: THREE.Texture } };
  readonly rect: { value: THREE.Vector2 };
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  private heightTex: THREE.DataTexture;
  private since = 99;
  private first = true;

  constructor(
    private renderer: THREE.WebGLRenderer,
    terrain: Terrain,
    size: number,
    private interval: number,
    steps: number,
  ) {
    const { n, heights } = terrain.field;
    const half = new Uint16Array(n * n);
    for (let i = 0; i < heights.length; i++)
      half[i] = THREE.DataUtils.toHalfFloat(heights[i] as number);
    this.heightTex = new THREE.DataTexture(half, n, n, THREE.RedFormat, THREE.HalfFloatType);
    this.heightTex.magFilter = this.heightTex.minFilter = THREE.LinearFilter;
    this.heightTex.needsUpdate = true;
    const make = () =>
      new THREE.WebGLRenderTarget(size, size, {
        type: THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
      });
    this.targets = [make(), make()];
    this.textures = {
      a: { value: this.targets[0].texture },
      b: { value: this.targets[1].texture },
    };
    // World square the mask covers: origin (x = z = -half) and full size.
    this.rect = { value: new THREE.Vector2(-terrain.half, 2 * terrain.half) };
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        heights: { value: this.heightTex },
        sunDir: { value: new THREE.Vector3(0, 0.2, -1) },
        extent: { value: terrain.half },
        steps: { value: steps },
      },
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }

  /** The ground height texture, shared with anything else that needs the field on the GPU. */
  get heights() {
    return this.heightTex;
  }

  /** Re-render the newer target now and then, and cross-fade toward it in between. */
  update(sunDir: THREE.Vector3, dt: number) {
    this.since += dt;
    this.blend.value = Math.min(1, this.since / this.interval);
    if (this.since < this.interval && !this.first) return;
    // The faded-in target becomes the base; the other takes the new Sun.
    const [a, b] = this.targets;
    this.targets[0] = b;
    this.targets[1] = a;
    (this.material.uniforms.sunDir as { value: THREE.Vector3 }).value.copy(sunDir);
    const previous = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(a);
    this.renderer.render(this.scene, this.camera);
    if (this.first) {
      this.renderer.setRenderTarget(b);
      this.renderer.render(this.scene, this.camera);
      this.first = false;
    }
    this.renderer.setRenderTarget(previous);
    this.textures.a.value = this.targets[0].texture;
    this.textures.b.value = this.targets[1].texture;
    this.since = 0;
    this.blend.value = 0;
  }
}

/** GLSL for materials that sample the mask: `float sunVisible(vec3 worldPos)`. */
export const SUN_MASK_GLSL = /* glsl */ `
  uniform sampler2D sunMaskA;
  uniform sampler2D sunMaskB;
  uniform float sunMaskBlend;
  uniform vec2 sunMaskRect;
  float sunVisible(vec3 p) {
    vec2 uv = (p.xz - sunMaskRect.x) / sunMaskRect.y;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 1.0;
    return mix(texture2D(sunMaskA, uv).r, texture2D(sunMaskB, uv).r, sunMaskBlend);
  }`;

export function sunMaskUniforms(mask: SunMask) {
  return {
    sunMaskA: mask.textures.a,
    sunMaskB: mask.textures.b,
    sunMaskBlend: mask.blend,
    sunMaskRect: mask.rect,
  };
}
