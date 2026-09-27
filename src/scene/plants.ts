import * as THREE from "three";
import type { HourState, Species } from "../game/types";
import { PALETTE } from "./palette";

export interface PlantLook {
  growth: number; // 0..1
  health: HourState["health"];
  lit: boolean; // in light at this moment
  bloom: number; // 0..1 flower opening, only at the end of a good day
}

const SCORCHED = new THREE.Color(PALETTE.scorched);
const STARVED = new THREE.Color(PALETTE.starved);

const leafGeo = (() => {
  // A pointed leaf blade: a flattened, tapered sphere, pivot at its base.
  const g = new THREE.SphereGeometry(0.5, 12, 8);
  g.scale(0.18, 1, 0.05);
  g.translate(0, 0.5, 0);
  return g;
})();

const frondGeo = (() => {
  const g = new THREE.ConeGeometry(0.05, 1, 6, 1);
  g.translate(0, 0.5, 0);
  return g;
})();

const bellGeo = (() => {
  const pts = [
    [0.0, 0],
    [0.12, 0.02],
    [0.16, 0.06],
    [0.12, 0.14],
    [0.08, 0.22],
    [0.02, 0.26],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 16);
  g.rotateX(Math.PI); // mouth down
  return g;
})();

export class PlantView {
  readonly group = new THREE.Group();
  private parts: { pivot: THREE.Object3D; base: THREE.Euler }[] = [];
  private flower: THREE.Mesh;
  private body: THREE.MeshStandardMaterial;
  private bloomMat: THREE.MeshStandardMaterial;
  private baseColor: THREE.Color;
  private glowColor: THREE.Color;
  private look: PlantLook = { growth: 0.2, health: "growing", lit: true, bloom: 0 };
  private shown: PlantLook = { ...this.look };

  constructor(readonly species: Species) {
    const colors = {
      sunleaf: [PALETTE.sunleaf, PALETTE.sunleafFlower],
      mooncress: [PALETTE.mooncress, PALETTE.mooncressPearl],
      nightbell: [PALETTE.nightbell, PALETTE.nightbellGlow],
    }[species];
    this.baseColor = new THREE.Color(colors[0]);
    this.glowColor = new THREE.Color(colors[1]);
    this.body = new THREE.MeshStandardMaterial({
      color: this.baseColor,
      roughness: 0.45,
      metalness: 0.15,
      emissive: this.baseColor,
      emissiveIntensity: 0.12,
    });
    this.bloomMat = new THREE.MeshStandardMaterial({
      color: this.glowColor,
      emissive: this.glowColor,
      emissiveIntensity: 0.9,
      roughness: 0.3,
    });

    if (species === "sunleaf") this.buildSunleaf();
    else if (species === "mooncress") this.buildMooncress();
    this.flower = species === "nightbell" ? this.buildNightbell() : this.buildFlower();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
  }

  private addPart(geo: THREE.BufferGeometry, rot: THREE.Euler, scale: THREE.Vector3): void {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(geo, this.body);
    mesh.scale.copy(scale);
    pivot.add(mesh);
    pivot.rotation.copy(rot);
    this.group.add(pivot);
    this.parts.push({ pivot, base: rot.clone() });
  }

  /** A fan of broad golden leaves that open toward the light. */
  private buildSunleaf(): void {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      this.addPart(leafGeo, new THREE.Euler(0.55, a, 0, "YXZ"), new THREE.Vector3(1.3, 0.75, 1));
    }
  }

  /** Silver-teal fronds: a tight rosette of spires. */
  private buildMooncress(): void {
    for (let i = 0; i < 11; i++) {
      const a = i * 2.4;
      const tilt = 0.15 + (i % 3) * 0.18;
      const h = 0.55 + (i % 4) * 0.08;
      this.addPart(frondGeo, new THREE.Euler(tilt, a, 0, "YXZ"), new THREE.Vector3(1, h, 1));
    }
  }

  private buildFlower(): THREE.Mesh {
    const geo =
      this.species === "sunleaf"
        ? new THREE.CylinderGeometry(0.16, 0.1, 0.06, 16)
        : new THREE.IcosahedronGeometry(0.09, 1);
    const f = new THREE.Mesh(geo, this.bloomMat);
    f.position.y = this.species === "sunleaf" ? 0.42 : 0.62;
    this.group.add(f);
    return f;
  }

  /** Arching violet stem with a hanging bell that glows in the dark. */
  private buildNightbell(): THREE.Mesh {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.85, 0),
      new THREE.Vector3(0.26, 0.72, 0),
    );
    this.addPart(
      new THREE.TubeGeometry(curve, 16, 0.025, 6),
      new THREE.Euler(0, 0.4, 0),
      new THREE.Vector3(1, 1, 1),
    );
    for (let i = 0; i < 3; i++) {
      this.addPart(
        leafGeo,
        new THREE.Euler(0.9, i * 2.1 + 0.6, 0, "YXZ"),
        new THREE.Vector3(1, 0.35, 1),
      );
    }
    const bell = new THREE.Mesh(bellGeo, this.bloomMat);
    const pivot = this.parts[0]?.pivot;
    bell.position.set(0.26, 0.72, 0);
    pivot?.add(bell);
    return bell;
  }

  set(look: PlantLook): void {
    this.look = look;
  }

  update(dt: number, time: number): void {
    const k = Math.min(1, dt * 5);
    const s = this.shown;
    s.growth += (this.look.growth - s.growth) * k;
    s.bloom += (this.look.bloom - s.bloom) * k;
    s.health = this.look.health;
    s.lit = this.look.lit;

    const size = (0.3 + s.growth * 0.7) * 1.6;
    this.group.scale.setScalar(size);
    const scorched = s.health === "scorched";
    const starved = s.health === "starved";
    const wilt = scorched || starved ? 1 : 0;
    const target = scorched ? SCORCHED : starved ? STARVED : this.baseColor;
    this.body.color.lerp(target, k * 0.5);
    this.body.emissive.copy(this.body.color);

    // Light response: sunleaf opens in light, nightbell glows in shade.
    const open = this.species === "sunleaf" ? (s.lit ? 0.35 : -0.15) : 0;
    const sway = Math.sin(time * 0.9 + this.group.position.x * 2) * 0.03;
    for (const p of this.parts) {
      p.pivot.rotation.x += (p.base.x + open + wilt * 0.9 + sway - p.pivot.rotation.x) * k;
    }
    const glowBase = this.species === "nightbell" ? (s.lit ? 0.25 : 1.6) : 0.6;
    this.bloomMat.emissiveIntensity = (glowBase + s.bloom * 1.8) * (1 - wilt * 0.85);
    const flowerScale =
      this.species === "nightbell" ? 0.6 + s.growth * 0.4 + s.bloom * 0.4 : s.bloom;
    this.flower.scale.setScalar(Math.max(0.001, flowerScale * (1 - wilt)));
  }
}
