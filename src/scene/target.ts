import * as THREE from "three";
import type { Action } from "../game/session";

// Where the next seed would go, drawn on the ground before you press: a soft ring that is green
// where the species will thrive, amber where it will struggle, red where it cannot go at all.
// Hidden when E would do something else.

const GOOD = new THREE.Color(0.35, 1.0, 0.62);
const FAIR = new THREE.Color(1.0, 0.78, 0.25);
const POOR = new THREE.Color(1.0, 0.45, 0.2);
const NO = new THREE.Color(1.0, 0.18, 0.14);
const TOOL = new THREE.Color(0.45, 0.8, 1.0);

export class Target {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private time = 0;

  constructor(private ground: (x: number, z: number) => number) {
    this.material = new THREE.ShaderMaterial({
      uniforms: { colour: { value: GOOD.clone() }, time: { value: 0 }, strength: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 colour;
        uniform float time;
        uniform float strength;
        varying vec2 vUv;
        void main() {
          float r = length(vUv - 0.5) * 2.0;
          // Squares written out: pow() of a negative base is NaN on Apple GPUs (black pixels
          // that the bloom then spreads).
          float e = (r - 0.78) * 9.0;
          float ring = exp(-e * e);
          float fill = (1.0 - smoothstep(0.0, 0.78, r)) * 0.18;
          float pulse = 0.75 + 0.25 * sin(time * 4.0);
          float a = (ring * pulse + fill) * strength;
          gl_FragColor = vec4(colour * a * 1.8, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    const g = new THREE.PlaneGeometry(1.1, 1.1);
    g.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.visible = false;
    this.mesh.renderOrder = 4;
  }

  update(dt: number, a: Action | null) {
    this.time += dt;
    const u = this.material.uniforms as {
      colour: { value: THREE.Color };
      time: { value: number };
      strength: { value: number };
    };
    u.time.value = this.time;
    if (a && (a.kind === "place" || a.kind === "cannot-place")) {
      this.mesh.visible = true;
      this.mesh.position.set(a.x, this.ground(a.x, a.z) + 0.03, a.z);
      u.colour.value.copy(a.kind === "place" ? TOOL : NO);
      u.strength.value = 1;
      return;
    }
    if (!a || (a.kind !== "plant" && a.kind !== "cannot")) {
      this.mesh.visible = false;
      return;
    }
    // Refusals that are about where you stand (no seeds) show no ring.
    if (a.kind === "cannot" && a.refusal === "no seeds") {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    this.mesh.position.set(a.x, this.ground(a.x, a.z) + 0.03, a.z);
    const c = a.kind === "cannot" ? NO : a.fit >= 0.7 ? GOOD : a.fit >= 0.4 ? FAIR : POOR;
    u.colour.value.copy(c);
    u.strength.value = a.kind === "cannot" ? 0.8 : 1;
  }
}
