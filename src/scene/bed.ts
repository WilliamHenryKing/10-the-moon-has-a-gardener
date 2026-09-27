import * as THREE from "three";
import { casterSet, HOURS, isShaded, key, sameCell } from "../game/rules";
import type { Cell, Level, Verdict } from "../game/types";
import { PALETTE } from "./palette";
import { boulderGeometry } from "./terrain";

export const BED_TOP = 0.14;
const CASTER_HEIGHT = 1.0;

export function cellToWorld(level: Level, c: Cell, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(c.x - (level.width - 1) / 2, BED_TOP, c.z - (level.depth - 1) / 2);
}

/** Shade panel: dark solar film in a gold frame on a slim post. It turns to face the Sun. */
function panelMesh(): THREE.Group {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({
    color: PALETTE.panelFrame,
    metalness: 0.8,
    roughness: 0.35,
  });
  const film = new THREE.Mesh(
    new THREE.BoxGeometry(0.86, 0.72, 0.04),
    new THREE.MeshStandardMaterial({ color: PALETTE.panelFilm, metalness: 0.5, roughness: 0.25 }),
  );
  film.position.y = CASTER_HEIGHT - 0.38;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.78, 0.03), frameMat);
  frame.position.copy(film.position);
  frame.position.z = -0.02;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.3, 8), frameMat);
  post.position.y = 0.15;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.05, 12), frameMat);
  foot.position.y = 0.025;
  g.add(film, frame, post, foot);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true;
  });
  return g;
}

interface PanelView {
  cell: Cell;
  group: THREE.Group;
  rise: number; // 0..1 entry animation
  leaving: boolean;
}

interface Ring {
  pips: THREE.InstancedMesh;
  halo: THREE.Mesh;
}

const RING_COLORS: Record<Verdict, number> = {
  bloom: PALETTE.ringBloom,
  scorched: PALETTE.ringScorch,
  starved: PALETTE.ringStarve,
};

export class Bed {
  readonly group = new THREE.Group();
  tiles: THREE.InstancedMesh | null = null;
  private level: Level | null = null;
  private panels: PanelView[] = [];
  private rings: Ring[] = [];
  private cursor: THREE.Mesh;
  private statics = new THREE.Group();
  private tint = new THREE.Color();

  constructor() {
    this.cursor = new THREE.Mesh(
      new THREE.RingGeometry(0.44, 0.5, 4, 1),
      new THREE.MeshBasicMaterial({ color: PALETTE.cursor, transparent: true, opacity: 0.9 }),
    );
    this.cursor.rotation.x = -Math.PI / 2;
    this.cursor.rotation.z = Math.PI / 4;
    this.cursor.scale.setScalar(Math.SQRT2);
    this.group.add(this.statics, this.cursor);
  }

  setLevel(level: Level): void {
    this.level = level;
    this.statics.clear();
    for (const p of this.panels) this.group.remove(p.group);
    this.panels = [];
    this.rings = [];
    const n = level.width * level.depth;

    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(level.width + 0.3, BED_TOP, level.depth + 0.3),
      new THREE.MeshStandardMaterial({ color: PALETTE.bedRim, roughness: 0.7, metalness: 0.3 }),
    );
    rim.position.y = BED_TOP / 2 - 0.01;
    rim.receiveShadow = true;
    this.statics.add(rim);

    const tiles = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.94, 0.04, 0.94),
      new THREE.MeshStandardMaterial({ roughness: 0.95 }),
      n,
    );
    tiles.receiveShadow = true;
    const m = new THREE.Matrix4();
    const v = new THREE.Vector3();
    for (let z = 0; z < level.depth; z++) {
      for (let x = 0; x < level.width; x++) {
        cellToWorld(level, { x, z }, v);
        m.makeTranslation(v.x, BED_TOP, v.z);
        tiles.setMatrixAt(z * level.width + x, m);
      }
    }
    this.tiles = tiles;
    this.statics.add(tiles);

    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x847d74,
      roughness: 0.9,
      flatShading: true,
    });
    for (const r of level.rocks) {
      const rock = new THREE.Mesh(boulderGeometry(0.42, 1), rockMat);
      cellToWorld(level, r, rock.position);
      rock.position.y += 0.4;
      rock.scale.set(1, 1.35, 1);
      rock.castShadow = rock.receiveShadow = true;
      this.statics.add(rock);
    }

    for (const p of level.plants) {
      const pips = new THREE.InstancedMesh(
        new THREE.SphereGeometry(0.06, 10, 6),
        new THREE.MeshBasicMaterial(),
        HOURS,
      );
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(0.3, 0.335, 40),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85 }),
      );
      halo.rotation.x = -Math.PI / 2;
      const base = cellToWorld(level, p);
      halo.position.set(base.x, BED_TOP + 0.03, base.z);
      pips.position.set(base.x, BED_TOP + 0.05, base.z);
      this.statics.add(pips, halo);
      this.rings.push({ pips, halo });
    }
  }

  /** Sync panel meshes to the rules' panel list; new panels rise, lifted ones sink. */
  setPanels(panels: readonly Cell[], instant: boolean): Cell | null {
    const level = this.level;
    if (!level) return null;
    let changed: Cell | null = null;
    for (const view of this.panels) {
      if (!view.leaving && !panels.some((c) => sameCell(c, view.cell))) {
        view.leaving = true;
        changed = view.cell;
      }
    }
    for (const c of panels) {
      if (this.panels.some((p) => !p.leaving && sameCell(p.cell, c))) continue;
      const group = panelMesh();
      cellToWorld(level, c, group.position);
      this.group.add(group);
      this.panels.push({ cell: c, group, rise: instant ? 1 : 0, leaving: false });
      changed = c;
    }
    return changed;
  }

  /** Tile tint and plant light rings for the previewed hour; rings show the whole day. */
  setLight(panels: readonly Cell[], hour: number, masks: boolean[][], verdicts: Verdict[]): void {
    const level = this.level;
    if (!level || !this.tiles) return;
    const casters = casterSet(level, panels);
    const h = Math.round(hour) % HOURS;
    const soil = new THREE.Color(PALETTE.bedSoil);
    const alt = new THREE.Color(PALETTE.bedSoilAlt);
    const shade = new THREE.Color(PALETTE.shade);
    for (let z = 0; z < level.depth; z++) {
      for (let x = 0; x < level.width; x++) {
        this.tint.copy((x + z) % 2 ? alt : soil);
        if (isShaded(casters, { x, z }, h)) this.tint.lerp(shade, 0.8);
        this.tiles.setColorAt(z * level.width + x, this.tint);
      }
    }
    if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;

    const m = new THREE.Matrix4();
    const lit = new THREE.Color(PALETTE.pipLit);
    const dark = new THREE.Color(PALETTE.pipDark);
    this.rings.forEach((ring, i) => {
      const mask = masks[i] ?? [];
      for (let k = 0; k < HOURS; k++) {
        const a = (k * Math.PI) / 4;
        const s = k === h ? 1.7 : 1;
        m.makeScale(s, s, s).setPosition(Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4);
        ring.pips.setMatrixAt(k, m);
        ring.pips.setColorAt(k, mask[k] ? lit : dark);
      }
      ring.pips.instanceMatrix.needsUpdate = true;
      if (ring.pips.instanceColor) ring.pips.instanceColor.needsUpdate = true;
      const mat = ring.halo.material as THREE.MeshBasicMaterial;
      mat.color.setHex(RING_COLORS[verdicts[i] ?? "bloom"]);
    });
  }

  setCursor(cell: Cell | null): void {
    this.cursor.visible = !!cell && !!this.level;
    if (cell && this.level) {
      cellToWorld(this.level, cell, this.cursor.position);
      this.cursor.position.y += 0.035;
    }
  }

  isPanelAt(c: Cell): boolean {
    return this.panels.some((p) => !p.leaving && key(p.cell) === key(c));
  }

  update(dt: number, sunDir: THREE.Vector3, time: number): void {
    const yaw = Math.atan2(sunDir.x, sunDir.z);
    for (const p of this.panels) {
      p.rise = Math.max(0, Math.min(1, p.rise + (p.leaving ? -dt : dt) * 2.5));
      const e = p.rise * p.rise * (3 - 2 * p.rise);
      p.group.scale.set(1, Math.max(0.001, e), 1);
      const turn = Math.atan2(
        Math.sin(yaw - p.group.rotation.y),
        Math.cos(yaw - p.group.rotation.y),
      );
      p.group.rotation.y += turn * Math.min(1, dt * 6);
    }
    for (const p of this.panels.filter((v) => v.leaving && v.rise <= 0)) this.group.remove(p.group);
    this.panels = this.panels.filter((v) => !(v.leaving && v.rise <= 0));
    (this.cursor.material as THREE.MeshBasicMaterial).opacity = 0.65 + Math.sin(time * 4) * 0.25;
  }
}
