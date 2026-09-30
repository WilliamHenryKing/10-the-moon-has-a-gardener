import * as THREE from "three";
import { glow } from "./caches";

// Far off on the ridge, something is building. A tall thin figure stands by a cairn of stones
// marked with faint light, and the cairn is one stone taller each time you look back at it. Walk
// out to it and the builder is gone before you arrive; walk away and it is there again.

type Ground = (x: number, z: number) => number;

const MAX_STONES = 15;
/** Seconds the cairn must go unwatched before the next stone. */
const UNWATCHED = 14;

const stone = new THREE.MeshStandardMaterial({
  color: 0x6d6a66,
  roughness: 0.92,
  flatShading: true,
});
const mark = new THREE.MeshStandardMaterial({
  color: 0x9ff6ff,
  emissive: 0x5fe8ff,
  emissiveIntensity: 1.8,
  roughness: 0.4,
});

export class Cairns {
  readonly group = new THREE.Group();
  private stones: THREE.Group[] = [];
  private top = 0;
  private unwatched = 0;
  private builder: THREE.Group;
  private builderMats: THREE.Material[] = [];
  private seen = 1;
  private at: THREE.Vector3;
  /** A cold light on the topmost stone, so the cairn shows from anywhere in the basin. */
  private beacon: THREE.Sprite;

  constructor(ground: Ground, x: number, z: number) {
    this.at = new THREE.Vector3(x, ground(x, z), z);
    this.group.position.copy(this.at);
    // Everything here is built big: this is not a person's cairn.
    this.group.scale.setScalar(1.7);
    this.beacon = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glow(),
        color: new THREE.Color(0.5, 1.6, 2.0),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.beacon.scale.setScalar(1.6);
    this.group.add(this.beacon);
    const shape = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < MAX_STONES; i++) {
      const g = new THREE.Group();
      const s = 0.62 - i * 0.025 + ((i * 0.37) % 1) * 0.12;
      const rock = new THREE.Mesh(shape, stone);
      rock.scale.set(s, s * 0.55, s * 0.9);
      rock.rotation.y = i * 1.7;
      rock.castShadow = rock.receiveShadow = true;
      const band = new THREE.Mesh(new THREE.TorusGeometry(s * 0.82, 0.018, 4, 20), mark);
      band.rotation.x = Math.PI / 2;
      band.scale.set(1, 0.9, 1);
      g.add(rock, band);
      g.position.set(((i * 0.53) % 1) * 0.16 - 0.08, 0, ((i * 0.71) % 1) * 0.16 - 0.08);
      g.visible = false;
      this.stones.push(g);
      this.group.add(g);
    }
    for (let i = 0; i < 3; i++) this.addStone();
    // The builder: a dark stretched figure with two points of light for eyes.
    this.builder = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({
      color: 0x1b1d22,
      roughness: 0.85,
      transparent: true,
    });
    const eyes = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.6, 2.4, 2.6),
      transparent: true,
    });
    this.builderMats.push(skin, eyes);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 2.2, 6, 12), skin);
    body.position.y = 1.55;
    body.scale.set(1, 1, 0.75);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), skin);
    head.scale.set(0.8, 1.35, 0.9);
    head.position.set(0, 3.05, -0.05);
    const arms = [-1, 1].map((sd) => {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 1.6, 4, 8), skin);
      arm.position.set(sd * 0.3, 1.75, -0.1);
      arm.rotation.set(-0.25, 0, sd * 0.08);
      return arm;
    });
    const eyePts = [-1, 1].map((sd) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), eyes);
      e.position.set(sd * 0.065, 3.1, -0.2);
      return e;
    });
    this.builder.add(body, head, ...arms, ...eyePts);
    this.builder.position.set(1.6, 0, 0.4);
    this.builder.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    this.group.add(this.builder);
  }

  private addStone() {
    if (this.top >= MAX_STONES) return;
    const s = this.stones[this.top] as THREE.Group;
    const below = this.top === 0 ? 0 : (this.stones[this.top - 1] as THREE.Group).position.y;
    const rock = s.children[0] as THREE.Mesh;
    s.position.y = this.top === 0 ? rock.scale.y * 0.7 : below + rock.scale.y * 1.05 + 0.08;
    s.visible = true;
    this.top++;
    this.beacon?.position.set(s.position.x, s.position.y + rock.scale.y + 0.25, s.position.z);
  }

  /** `camera` looks along `forward`; the builder keeps its distance from `player`. */
  update(dt: number, camera: THREE.Vector3, forward: THREE.Vector3, player: THREE.Vector3) {
    const to = this.at.clone().sub(camera);
    const d = to.length();
    const watched = to.normalize().dot(forward) > Math.cos((40 * Math.PI) / 180) && d < 900;
    this.unwatched = watched ? 0 : this.unwatched + dt;
    if (this.unwatched > UNWATCHED) {
      this.unwatched = 0;
      this.addStone();
    }
    // The builder faces whoever is coming, and is not there when they arrive.
    const near = Math.hypot(player.x - this.at.x, player.z - this.at.z);
    const want = near < 70 ? 0 : near > 110 ? 1 : this.seen;
    this.seen += (want - this.seen) * Math.min(1, dt * 1.5);
    for (const m of this.builderMats) m.opacity = this.seen;
    this.builder.visible = this.seen > 0.02;
    this.builder.rotation.y = Math.atan2(player.x - this.at.x, player.z - this.at.z) + Math.PI;
  }
}
