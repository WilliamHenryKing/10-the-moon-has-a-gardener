import * as THREE from "three";
import { growthTrace, HOURS, lightMask, mod, reportGarden } from "../game/rules";
import type { Cell, HourState, Level } from "../game/types";
import { Astronaut } from "./astronaut";
import { Bed, cellToWorld } from "./bed";
import { createEquipment } from "./equipment";
import { PALETTE } from "./palette";
import { PlantView } from "./plants";
import { Rover } from "./rover";
import { createSky, SPACE } from "./sky";
import { createTerrain } from "./terrain";

/** Sun direction for a continuous hour. Diagonal hours sit lower so shadows reach 2 tiles. */
export function sunDirection(hour: number, out = new THREE.Vector3()): THREE.Vector3 {
  const a = (hour * Math.PI) / 4;
  const tanE = 0.41 + 0.066 * Math.cos(4 * a);
  return out.set(Math.cos(a), tanE, -Math.sin(a)).normalize();
}

export type DayView = { traces: HourState[][]; t: number; bloom: number } | null;

export class GardenScene {
  onTile: ((cell: Cell) => void) | null = null;
  set onStep(fn: (() => void) | null) {
    this.astronaut.onStep = fn;
  }
  reduced: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1200);
  private sun = new THREE.DirectionalLight(PALETTE.sunKey, 2.8);
  private sky = createSky();
  private bed = new Bed();
  private plants: PlantView[] = [];
  private astronaut = new Astronaut();
  private rover = new Rover();
  private level: Level | null = null;
  private panels: Cell[] = [];
  private hour = 0;
  private shownHour = 0;
  private day: DayView = null;
  private ending = false;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private clock = new THREE.Timer();
  private sunDir = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private firstFrame: (() => void) | null;
  private frame = 0;
  private endT = 0;
  private viewW = 1;
  private viewH = 1;

  constructor(
    private host: HTMLElement,
    reduced: boolean,
    onFirstFrame: () => void,
  ) {
    this.reduced = reduced;
    this.firstFrame = onFirstFrame;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = "block h-full w-full";
    host.appendChild(this.renderer.domElement);

    this.scene.background = SPACE;
    this.scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.9));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -9;
    sc.right = sc.top = 9;
    sc.near = 1;
    sc.far = 60;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);

    this.scene.add(this.sky.group, createTerrain(), createEquipment(), this.bed.group);
    this.scene.add(this.astronaut.group, this.rover.group);

    this.renderer.domElement.addEventListener("pointerup", this.onPointer);
    window.addEventListener("resize", this.resize);
    this.resize();
    this.renderer.setAnimationLoop(this.tick);
  }

  setLevel(level: Level): void {
    this.level = level;
    this.panels = [];
    this.bed.setLevel(level);
    for (const p of this.plants) this.bed.group.remove(p.group);
    this.plants = level.plants.map((spot) => {
      const view = new PlantView(spot.species);
      cellToWorld(level, spot, view.group.position);
      view.group.rotation.y = spot.x * 1.3 + spot.z * 0.7;
      this.bed.group.add(view.group);
      return view;
    });
    this.rover.group.position.set(-level.width / 2 - 1.3, 0, 0.6);
    this.rover.group.rotation.y = 0.25;
    this.rover.setLoad(level.panels);
    this.astronaut.place(new THREE.Vector3(-level.width / 2 - 0.4, 0, level.depth / 2 + 0.5));
    this.day = null;
    this.refresh();
  }

  setPanels(panels: Cell[], animate: boolean): void {
    const level = this.level;
    if (!level) return;
    const changed = this.bed.setPanels(panels, !animate);
    this.panels = panels;
    this.rover.setLoad(level.panels - panels.length);
    if (changed && animate) this.astronaut.tend(cellToWorld(level, changed));
    this.refresh();
  }

  /** Walk the gardener over to look at a tile without changing it. */
  visit(cell: Cell): void {
    if (this.level) this.astronaut.tend(cellToWorld(this.level, cell));
  }

  setHour(hour: number): void {
    this.hour = hour;
    this.refresh();
  }

  setCursor(cell: Cell | null): void {
    this.bed.setCursor(cell);
  }

  /** Drive a lunar day: t runs 0..HOURS, bloom 0..1 after it ends. null returns to planning. */
  setDay(day: DayView): void {
    if (day && !this.day && this.level) {
      // The gardener steps off the bed to watch the day play out.
      const l = this.level;
      this.astronaut.tend(new THREE.Vector3(-l.width / 2 - 0.2, 0, l.depth / 2 - 0.2));
    }
    this.day = day;
    if (day) this.hour = day.t;
    this.refresh();
  }

  setEnding(on: boolean): void {
    this.ending = on;
  }

  private refresh(): void {
    const level = this.level;
    if (!level) return;
    const reports = reportGarden(level, this.panels);
    const h = mod(Math.floor(this.hour + 0.5), HOURS);
    this.bed.setLight(
      this.panels,
      h,
      reports.map((r) => r.mask),
      reports.map((r) => r.verdict),
    );
    this.plants.forEach((view, i) => {
      const spot = level.plants[i];
      if (!spot) return;
      const mask = lightMask(level, this.panels, spot);
      if (this.day) {
        const trace = this.day.traces[i] ?? growthTrace(spot.species, mask);
        const step = Math.min(HOURS - 1, Math.floor(this.day.t));
        const now = trace[step];
        const prev = step > 0 ? (trace[step - 1]?.growth ?? 0) : 0;
        const frac = Math.min(1, this.day.t - step);
        const growth = now ? prev + (now.growth - prev) * frac : 0;
        const ok = trace[HOURS - 1]?.health === "growing";
        view.set({
          growth: 0.15 + growth * 0.85,
          health: this.day.t > step && now ? now.health : "growing",
          lit: now?.lit ?? true,
          bloom: ok ? this.day.bloom : 0,
        });
      } else {
        view.set({ growth: 0.15, health: "growing", lit: mask[h] ?? true, bloom: 0 });
      }
    });
  }

  private onPointer = (e: PointerEvent): void => {
    if (!this.bed.tiles || !this.level || !this.onTile) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.bed.tiles, false)[0];
    if (hit?.instanceId === undefined) return;
    const w = this.level.width;
    this.onTile({ x: hit.instanceId % w, z: Math.floor(hit.instanceId / w) });
  };

  private resize = (): void => {
    this.viewW = this.host.clientWidth || window.innerWidth;
    this.viewH = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(this.viewW, this.viewH, false);
  };

  /**
   * Third-person framing with an off-axis lens: the camera looks down at the bed, but the
   * frame is shifted upward so the horizon, Earth and stars stay in view above the garden.
   * Narrow screens pull back and show more sky.
   */
  private cameraGoal(dt: number, pos: THREE.Vector3, look: THREE.Vector3): void {
    this.endT += ((this.ending ? 1 : 0) - this.endT) * (this.reduced ? 1 : Math.min(1, dt * 0.8));
    const e = this.endT;
    const w = this.viewW;
    const h = this.viewH;
    const aspect = w / h;
    const portrait = aspect < 0.9;
    const deg = THREE.MathUtils.degToRad;
    const pitch = deg((portrait ? 33 : 29) - e * 16);
    const top = deg((portrait ? 9 : 6) + e * 10); // elevation of the frame's top edge
    const tUp = Math.tan(pitch + top);
    const tDown = Math.tan(deg(portrait ? 40 : 24));
    const size = this.level ? Math.max(this.level.width, this.level.depth) : 5;
    const reach = size * 0.6 + (portrait ? 1.2 : 1.9);
    const hTan = (aspect * (tUp + tDown)) / 2;
    const dist = Math.max(reach / hTan, size * 1.3 + 3.5) * (1 + e * 0.6);

    const full = (h * 2 * tUp) / (tUp + tDown);
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tUp));
    this.camera.setViewOffset(w, full, 0, 0, w, h);

    const a = this.astronaut.group.position;
    look.set(a.x * 0.12 * (1 - e), 0.2, a.z * 0.08 * (1 - e));
    pos.set(look.x, look.y + dist * Math.sin(pitch), look.z + dist * Math.cos(pitch));
  }

  private tick = (): void => {
    this.clock.update();
    const dt = Math.min(0.05, this.clock.getDelta());
    const time = this.clock.getElapsed();

    this.shownHour += (this.hour - this.shownHour) * (this.reduced ? 1 : Math.min(1, dt * 6));
    sunDirection(this.shownHour, this.sunDir);
    this.sun.position.copy(this.sunDir).multiplyScalar(30);
    this.sky.setSun(this.sunDir);

    this.bed.update(dt, this.sunDir, time);
    for (const p of this.plants) p.update(this.reduced ? 1 : dt, time);
    this.astronaut.update(dt, time, this.reduced);

    const goalPos = new THREE.Vector3();
    const goalLook = new THREE.Vector3();
    this.cameraGoal(dt, goalPos, goalLook);
    this.camera.updateProjectionMatrix();
    const k = this.frame === 0 || this.reduced ? 1 : Math.min(1, dt * 1.5);
    this.camPos.lerp(goalPos, k);
    this.camLook.lerp(goalLook, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    this.renderer.render(this.scene, this.camera);
    this.frame++;
    if (this.firstFrame) {
      const done = this.firstFrame;
      this.firstFrame = null;
      requestAnimationFrame(done);
    }
  };

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener("resize", this.resize);
    this.renderer.domElement.removeEventListener("pointerup", this.onPointer);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
