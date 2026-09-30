import * as THREE from "three";
import { type Dir, earthDirection } from "../world/sky-model";
import { Assets } from "./resources";
import { FAR_LAYER } from "./stage";

// The Moon's sky: black, stars that never twinkle (there is no air), a band of the Milky Way,
// the Sun as a small blinding disc, and Earth: rendered live from NASA's Blue Marble, cloud and
// Black Marble maps (public domain; credit NASA Earth Observatory) so its phase always matches
// the Sun, with cloud shadows, city lights on the night side, sun glint on the oceans and a thin
// blue atmosphere. Sky objects follow the camera, so they sit at infinity: in the far layer,
// beyond the furthest land (146 km), so mountains hide the stars behind them.

const STAR_DISTANCE = 240000;
const SUN_DISTANCE = 228000;
const EARTH_DISTANCE = 210000;
/** Earth's apparent diameter in degrees (1.9 in reality; enlarged a little for the frame). */
const EARTH_DIAMETER = 3.4;
const SUN_DIAMETER = 0.54;

function stars(count: number) {
  let seed = 20260928;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  // The galactic plane, tilted across the sky.
  const pole = new THREE.Vector3(0.45, 0.62, 0.64).normalize();
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    // Two thirds anywhere, one third crowded toward the band.
    const band = i % 3 === 0;
    for (let tries = 0; tries < 12; tries++) {
      v.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
      if (v.lengthSq() > 1 || v.lengthSq() < 1e-4) continue;
      v.normalize();
      if (!band || Math.abs(v.dot(pole)) < 0.12 + rand() * 0.2) break;
    }
    pos.set([v.x * STAR_DISTANCE, v.y * STAR_DISTANCE, v.z * STAR_DISTANCE], i * 3);
    // Magnitudes: many faint, few bright. Colour from cool blue-white to warm orange.
    const bright = rand() ** 7;
    const warm = rand();
    const c = new THREE.Color().setRGB(
      0.8 + warm * 0.25,
      0.83 + (1 - Math.abs(warm - 0.5)) * 0.12,
      1.05 - warm * 0.35,
    );
    const b = 0.25 + bright * 7;
    col.set([c.r * b, c.g * b, c.b * b], i * 3);
    size[i] = 1 + bright * 2.6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPixel: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute vec3 color;
      uniform float uPixel;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = size * uPixel;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = 1.0 - smoothstep(0.0, 1.0, d);
        gl_FragColor = vec4(vColor * a * a, 1.0);
      }`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = -10;
  return { points, mat };
}

function sunDisc() {
  const size = 2 * SUN_DISTANCE * Math.tan(((SUN_DIAMETER / 2) * Math.PI) / 180);
  const mat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p) / 0.34;
        // The photosphere with limb darkening, then a soft corona glow for the bloom to catch.
        float disc = r < 1.0 ? (0.4 + 0.6 * sqrt(max(0.0, 1.0 - r * r))) * 60.0 : 0.0;
        float glow = exp(-max(r - 1.0, 0.0) * 2.6) * 1.4 * step(1.0, r);
        vec3 c = vec3(1.0, 0.97, 0.92) * (disc + glow);
        gl_FragColor = vec4(c, 1.0);
      }`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size * 3, size * 3), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -9;
  return mesh;
}

const EARTH_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vP;
  void main() {
    vUv = uv;
    vN = normal;
    vP = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

// The original Earth plate shader, now rendered live from the NASA maps.
const EARTH_FRAGMENT = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D cloudMap;
  uniform vec3 sunObj;
  uniform vec3 camObj;
  uniform float sunPower;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vP;
  const float PI = 3.14159265;
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(camObj - vP);
    vec3 L = normalize(sunObj);
    float mu = dot(N, L);
    float day = max(mu, 0.0);
    vec3 albedo = texture2D(dayMap, vUv).rgb;
    float cloud = texture2D(cloudMap, vUv).r;
    vec3 east = normalize(vec3(N.z, 0.0, -N.x) + 1e-6);
    vec3 north = cross(N, east);
    float lat = asin(clamp(N.y, -1.0, 1.0));
    vec2 toward = vec2(dot(L, east), dot(L, north)) / max(mu, 0.12) * 0.0022;
    vec2 shadowUv = vUv + vec2(toward.x / (2.0 * PI * max(cos(lat), 0.15)), toward.y / PI);
    float shadow = smoothstep(0.15, 0.85, texture2D(cloudMap, shadowUv).r);
    float water = smoothstep(0.012, 0.05, albedo.b - max(albedo.r, albedo.g))
      * (1.0 - smoothstep(0.22, 0.4, dot(albedo, vec3(0.333))));
    vec3 surface = albedo * day * (1.0 - 0.55 * shadow);
    vec3 H = normalize(L + V);
    float nh = max(dot(N, H), 0.0);
    // Every pow() base is kept at or above zero: a negative one is NaN on Apple GPUs.
    float fresnel = 0.02 + 0.98 * pow(clamp(1.0 - dot(V, H), 0.0, 1.0), 5.0);
    float a2 = 0.012;
    float dd = nh * nh * (a2 - 1.0) + 1.0;
    float ggx = a2 / (PI * dd * dd);
    float glint = water * PI * ggx * fresnel / (4.0 * max(dot(N, V), 0.08)) * step(0.0, mu);
    surface += vec3(1.0, 0.95, 0.86) * glint * (1.0 - shadow * 0.8);
    float cloudAlpha = smoothstep(0.1, 0.92, cloud);
    vec3 cloudLit = vec3(0.96, 0.97, 1.0) * (day * 0.92 + 0.04 * smoothstep(-0.08, 0.08, mu));
    vec3 color = mix(surface, cloudLit, cloudAlpha);
    float night = 1.0 - smoothstep(-0.1, 0.05, mu);
    float lights = texture2D(nightMap, vUv).r;
    color += vec3(1.0, 0.66, 0.34) * pow(max(lights, 0.0), 1.7) * 1.3 * night * (1.0 - 0.85 * cloudAlpha);
    float vn = max(dot(N, V), 0.0);
    float limb = clamp(1.0 - vn, 0.0, 1.0);
    float lit = smoothstep(-0.2, 0.35, mu);
    color = mix(color, vec3(0.3, 0.52, 1.0) * max(mu + 0.12, 0.0), pow(limb, 2.4) * 0.7 * lit);
    color += vec3(0.22, 0.42, 1.0) * pow(limb, 5.0) * lit * 0.45;
    float dusk = mu / 0.04;
    color += vec3(1.0, 0.42, 0.16) * exp(-dusk * dusk) * 0.03 * pow(limb, 1.5);
    gl_FragColor = vec4(color * sunPower, 1.0);
  }`;

const HALO_FRAGMENT = /* glsl */ `
  uniform vec3 sunObj;
  uniform vec3 camObj;
  uniform float sunPower;
  varying vec3 vP;
  void main() {
    vec3 D = normalize(vP - camObj);
    float t = -dot(camObj, D);
    vec3 closest = camObj + D * t;
    float altitude = length(closest) - 1.0;
    if (altitude < 0.0) discard;
    float glow = exp(-altitude / 0.008) * 1.2;
    float lit = smoothstep(-0.35, 0.45, dot(normalize(closest), normalize(sunObj)));
    float a = glow * lit;
    gl_FragColor = vec4(vec3(0.34, 0.58, 1.0) * a * sunPower, a);
  }`;

export class Sky {
  readonly group = new THREE.Group();
  private starMat: THREE.ShaderMaterial;
  private sun: THREE.Mesh;
  private earth = new THREE.Group();
  private globe: THREE.Mesh | null = null;
  private shared = {
    sunObj: { value: new THREE.Vector3(1, 0, 0) },
    camObj: { value: new THREE.Vector3(0, 0, 3) },
    sunPower: { value: 2.2 },
  };
  private spin = 0;
  readonly ready: Promise<void>;

  constructor(
    detail: number,
    private assets = new Assets(),
  ) {
    const s = stars(Math.round(9000 * detail + 2000));
    this.starMat = s.mat;
    this.sun = sunDisc();
    this.group.add(s.points, this.sun, this.earth);
    const e: Dir = earthDirection();
    this.earth.position.set(e.x, e.y, e.z).multiplyScalar(EARTH_DISTANCE);
    const radius = EARTH_DISTANCE * Math.tan(((EARTH_DIAMETER / 2) * Math.PI) / 180);
    this.earth.scale.setScalar(radius);
    // Tilt Earth's axis for January and turn the face toward the Moon.
    this.earth.rotation.set(0.35, 0, 0.2);
    this.ready = this.loadEarth().then(() => {
      this.group.traverse((o) => o.layers.set(FAR_LAYER));
    });
    this.group.traverse((o) => o.layers.set(FAR_LAYER));
  }

  private async loadEarth() {
    const load = async (name: string, colour: boolean) => {
      const t = await this.assets.texture(`${import.meta.env.BASE_URL}earth2/${name}.webp`);
      if (colour) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    };
    const [dayMap, nightMap, cloudMap] = await Promise.all([
      load("day", true),
      load("night", false),
      load("clouds", false),
    ]);
    this.assets.signal.throwIfAborted();
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 64),
      new THREE.ShaderMaterial({
        vertexShader: EARTH_VERTEX,
        fragmentShader: EARTH_FRAGMENT,
        uniforms: {
          ...this.shared,
          dayMap: { value: dayMap },
          nightMap: { value: nightMap },
          cloudMap: { value: cloudMap },
        },
      }),
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(1.045, 64, 48),
      new THREE.ShaderMaterial({
        vertexShader: EARTH_VERTEX,
        fragmentShader: HALO_FRAGMENT,
        uniforms: this.shared,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    for (const m of [globe, halo]) m.frustumCulled = false;
    this.globe = globe;
    this.earth.add(globe, halo);
  }

  /** Keep the sky at infinity around the camera and light Earth from the Sun. */
  update(camera: THREE.Camera, sunDir: THREE.Vector3, dt: number, pixelRatio: number) {
    this.group.position.copy(camera.position);
    const sd = sunDir;
    this.sun.position.copy(sd).multiplyScalar(SUN_DISTANCE);
    this.sun.lookAt(camera.position.clone().sub(this.group.position));
    this.sun.quaternion.copy(camera.quaternion);
    this.starMat.uniforms.uPixel!.value = pixelRatio;
    // Earth turns slowly; its shader works in its own object space.
    this.spin += dt * 0.012;
    if (this.globe) this.globe.rotation.y = this.spin;
    this.earth.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy((this.globe ?? this.earth).matrixWorld).invert();
    const sunObj = sd.clone().transformDirection(inv);
    this.shared.sunObj.value.copy(sunObj);
    this.shared.camObj.value.copy(camera.position).applyMatrix4(inv);
  }

  /** Objects GTAO should ignore. */
  get aoObjects(): THREE.Object3D[] {
    return [this.group];
  }
}
