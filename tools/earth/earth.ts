// Earth as seen from the Moon (D12): NASA Blue Marble day colour, clouds that shade the ground,
// Black Marble city lights on the night side, sun glint on open water and a thin atmosphere,
// rendered to transparent plates for the lunar sky. Driven by tools/earth/render-earth.mjs.
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BackSide,
  Mesh,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from "three";

const MAPS = "/assets-src/sourced/earth/prepared";
const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const loader = new TextureLoader();
const load = async (file: string, colour: boolean) => {
  const texture: Texture = await loader.loadAsync(`${MAPS}/${file}`);
  if (colour) texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
};

const shared = {
  sunObj: { value: new Vector3(0, 0, 1) },
  camObj: { value: new Vector3(0, 0, 30) },
  sunPower: { value: 1.6 },
};

const surfaceVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vP;
  void main() {
    vUv = uv;
    vN = normal;
    vP = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const surfaceFragment = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D cloudMap;
  uniform vec3 sunObj;
  uniform vec3 camObj;
  uniform float sunPower;
  uniform float nightPower;
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

    // Cloud shadows: the cloud that shades this point sits toward the sun, further away as the
    // sun gets lower (cloud tops ~10 km over a 6371 km radius, slightly exaggerated).
    vec3 east = normalize(vec3(N.z, 0.0, -N.x) + 1e-6);
    vec3 north = cross(N, east);
    float lat = asin(clamp(N.y, -1.0, 1.0));
    vec2 toward = vec2(dot(L, east), dot(L, north)) / max(mu, 0.12) * 0.0022;
    vec2 shadowUv = vUv + vec2(toward.x / (2.0 * PI * max(cos(lat), 0.15)), toward.y / PI);
    float shadow = smoothstep(0.15, 0.85, texture2D(cloudMap, shadowUv).r);

    // Open water: the Blue Marble oceans are dark and blue-dominant.
    float water = smoothstep(0.012, 0.05, albedo.b - max(albedo.r, albedo.g))
      * (1.0 - smoothstep(0.22, 0.4, dot(albedo, vec3(0.333))));

    vec3 surface = albedo * day * (1.0 - 0.55 * shadow);
    vec3 H = normalize(L + V);
    // Sun glint off a wind-roughened sea: a GGX lobe (slope spread ~0.11 rad), not a mirror.
    float nh = max(dot(N, H), 0.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(V, H), 0.0), 5.0);
    float a2 = 0.012;
    float dd = nh * nh * (a2 - 1.0) + 1.0;
    float ggx = a2 / (PI * dd * dd);
    float glint = water * PI * ggx * fresnel / (4.0 * max(dot(N, V), 0.08)) * step(0.0, mu);
    surface += vec3(1.0, 0.95, 0.86) * glint * (1.0 - shadow * 0.8);

    // Clouds: bright where lit, with a soft twilight edge.
    float cloudAlpha = smoothstep(0.1, 0.92, cloud);
    vec3 cloudLit = vec3(0.96, 0.97, 1.0) * (day * 0.92 + 0.04 * smoothstep(-0.08, 0.08, mu));
    vec3 color = mix(surface, cloudLit, cloudAlpha);

    // City lights on the night side, dimmed by cloud.
    float night = 1.0 - smoothstep(-0.1, 0.05, mu);
    float lights = texture2D(nightMap, vUv).r;
    color += vec3(1.0, 0.66, 0.34) * pow(lights, 1.7) * nightPower * night * (1.0 - 0.85 * cloudAlpha);

    // Atmosphere: blue haze toward the limb on the lit side; a warm band along the terminator.
    float vn = max(dot(N, V), 0.0);
    float lit = smoothstep(-0.2, 0.35, mu);
    color = mix(color, vec3(0.3, 0.52, 1.0) * max(mu + 0.12, 0.0), pow(1.0 - vn, 2.4) * 0.7 * lit);
    color += vec3(0.22, 0.42, 1.0) * pow(1.0 - vn, 5.0) * lit * 0.45;
    // Sunset light in the thin air along the terminator, seen only toward the limb.
    color += vec3(1.0, 0.42, 0.16) * exp(-pow(mu / 0.04, 2.0)) * 0.03 * pow(1.0 - vn, 1.5);

    gl_FragColor = vec4(color * sunPower, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const haloFragment = /* glsl */ `
  uniform vec3 sunObj;
  uniform vec3 camObj;
  uniform float sunPower;
  varying vec3 vP;
  void main() {
    // Distance of this view ray's closest approach above the surface sets the glow.
    vec3 D = normalize(vP - camObj);
    float t = -dot(camObj, D);
    vec3 closest = camObj + D * t;
    float altitude = length(closest) - 1.0;
    if (altitude < 0.0) discard;
    float glow = exp(-altitude / 0.008) * 1.2;
    float lit = smoothstep(-0.35, 0.45, dot(normalize(closest), normalize(sunObj)));
    float a = glow * lit;
    gl_FragColor = vec4(vec3(0.34, 0.58, 1.0) * a * sunPower, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const scene = new Scene();
const camera = new PerspectiveCamera(4, 1, 1, 100);
camera.position.set(0, 0, 30);
camera.lookAt(0, 0, 0);

let earth: Mesh;
let halo: Mesh;
const ready = (async () => {
  const [dayMap, nightMap, cloudMap] = await Promise.all([
    load("earth-day-8k.jpg", true),
    load("earth-night-8k.jpg", false),
    load("earth-clouds-8k.jpg", false),
  ]);
  earth = new Mesh(
    new SphereGeometry(1, 512, 256),
    new ShaderMaterial({
      vertexShader: surfaceVertex,
      fragmentShader: surfaceFragment,
      uniforms: {
        ...shared,
        dayMap: { value: dayMap },
        nightMap: { value: nightMap },
        cloudMap: { value: cloudMap },
        nightPower: { value: 1.3 },
      },
    }),
  );
  halo = new Mesh(
    new SphereGeometry(1.045, 256, 128),
    new ShaderMaterial({
      vertexShader: surfaceVertex,
      fragmentShader: haloFragment,
      uniforms: shared,
      side: BackSide,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
  scene.add(earth, halo);
})();

type Plate = {
  size: number;
  /** Longitude facing the viewer, degrees east. */
  lon: number;
  /** Phase angle Sun–Earth–viewer, degrees: 0 full, 90 half, 180 new. */
  phase: number;
  /** Sun's height above the equator plane, degrees (January: about −20). */
  season?: number;
  exposure?: number;
};

async function render(plate: Plate) {
  await ready;
  renderer.setSize(plate.size, plate.size, false);
  renderer.toneMappingExposure = plate.exposure ?? 1;
  // Frame the disc and its glow in about 90 % of the plate.
  camera.fov = ((2 * Math.asin(1.06 / camera.position.z)) / 0.9) * (180 / Math.PI);
  camera.updateProjectionMatrix();
  // lon λ sits at (cos λ, 0, −sin λ) on three's sphere: turn it to face the camera (+z).
  const spin = -Math.PI / 2 - (plate.lon * Math.PI) / 180;
  earth.rotation.y = spin;
  halo.rotation.y = spin;
  const phase = (plate.phase * Math.PI) / 180;
  const season = ((plate.season ?? -20) * Math.PI) / 180;
  const sunWorld = new Vector3(
    Math.sin(phase) * Math.cos(season),
    Math.sin(season),
    Math.cos(phase) * Math.cos(season),
  );
  // Lighting runs in the sphere's own space.
  const toObject = (v: Vector3) => v.clone().applyAxisAngle(new Vector3(0, 1, 0), -spin);
  shared.sunObj.value.copy(toObject(sunWorld)).normalize();
  shared.camObj.value.copy(toObject(camera.position));
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL("image/png");
}

(window as unknown as { __EARTH__: unknown }).__EARTH__ = { ready: ready.then(() => true), render };
