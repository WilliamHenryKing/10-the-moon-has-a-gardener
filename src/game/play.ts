import type { Cue } from "../audio/cues";
import type { Intent } from "../engine/input";
import { banner, hud, say } from "../ui/hud-store";
import {
  ARRIVAL,
  CAN_SIZE,
  createGarden,
  DOME,
  drainEvents,
  type Garden,
  type GardenEvent,
  medal,
  oxygenShare,
  production,
  step,
} from "./garden";
import { Guide } from "./guide";
import type { HeightQuery } from "./light";
import { type Action, describe, nextAction, nextSeed, perform } from "./session";
import { SPECIES_ORDER, type SpeciesId } from "./species";

// One round of the game, wired: the garden's rules, what E does, the seed pouch, Mission Control
// on the radio, the suit's displays and the sounds that go with it all. The scene reads the
// garden and `kneel`; everything else goes out through the HUD store and `sfx`.

const MILESTONE_SUB: Record<string, string> = {
  rover: "The farm rover waits by the pad",
  caches: "Two survey caches are open: follow the amber beacons",
  supply: "Birch saplings and sprinklers, coming down by the pad",
  jets: "Hold Space in the air to boost",
  full: "Perennial, you are clear to land",
};

export class Play {
  readonly garden: Garden = createGarden();
  selected: SpeciesId = "mooncress";
  /** What E would do right now. */
  action: Action | null = null;
  /** 0 … 1: kneeling to plant, water or gather. */
  kneel = 0;
  private kneelFor = 0;
  private guide = new Guide(say);
  private wasInteract = false;
  private publishIn = 0;
  private started = false;

  constructor(
    private ground: HeightQuery,
    private sfx: (cue: Cue, opts?: { rate?: number; gain?: number }) => void,
  ) {}

  /** The round begins (after the intro). */
  start() {
    if (this.started) return;
    this.started = true;
    this.guide.start();
  }

  update(
    dt: number,
    intent: Intent,
    player: { x: number; z: number; yaw: number; grounded: boolean },
  ) {
    const g = this.garden;
    if (!this.started) return;
    this.choose(intent);
    const busy = this.kneelFor > 0 || !player.grounded;
    this.action = nextAction(g, this.ground, player.x, player.z, player.yaw, this.selected);
    const pressed = intent.interact && !this.wasInteract;
    this.wasInteract = intent.interact;
    if (pressed && !busy) this.act(this.action);

    step(g, dt);
    for (const e of drainEvents(g)) {
      this.guide.event(e, g);
      this.react(e);
    }
    this.guide.update(dt, g);
    if (g.seeds[this.selected] <= 0) this.selected = nextSeed(g, this.selected, SPECIES_ORDER);

    this.kneelFor = Math.max(0, this.kneelFor - dt);
    const want = this.kneelFor > 0 ? 1 : 0;
    this.kneel += (want - this.kneel) * Math.min(1, dt * (want ? 9 : 5));

    this.publishIn -= dt;
    if (this.publishIn <= 0) {
      this.publishIn = 0.1;
      this.publish();
    }
  }

  private choose(intent: Intent) {
    const g = this.garden;
    if (intent.seedSlot >= 0) {
      const id = SPECIES_ORDER[intent.seedSlot];
      if (id && g.seeds[id] > 0) {
        if (id !== this.selected) this.sfx("cursor");
        this.selected = id;
      } else this.sfx("denied", { gain: 0.5 });
    }
    if (intent.seedStep) {
      const next = nextSeed(g, this.selected, SPECIES_ORDER, intent.seedStep);
      if (next !== this.selected) this.sfx("cursor");
      this.selected = next;
    }
  }

  private act(a: Action) {
    if (!perform(this.garden, this.ground, a)) {
      this.sfx("denied", { gain: 0.7 });
      return;
    }
    switch (a.kind) {
      case "plant":
      case "water":
      case "harvest":
        this.kneelFor = a.kind === "plant" ? 1.1 : 0.8;
        break;
      case "refill":
        this.sfx("grow", { rate: 0.7, gain: 0.8 });
        break;
      default:
        break;
    }
  }

  private react(e: GardenEvent) {
    switch (e.type) {
      case "planted":
        this.sfx("place");
        break;
      case "watered":
        this.sfx("grow", { rate: 1.2, gain: 0.8 });
        break;
      case "harvested":
        this.sfx("lift");
        break;
      case "bloomed":
        this.sfx("bloom");
        break;
      case "thirsty":
        this.sfx("wilt", { gain: 0.6 });
        break;
      case "pickup":
        this.sfx("lift");
        this.sfx("ui", { gain: 0.7 });
        break;
      case "milestone":
        this.sfx("success");
        banner(e.title, MILESTONE_SUB[e.unlock] ?? "");
        break;
      case "arrived":
        this.sfx(oxygenShare(this.garden) >= 1 ? "ending" : "hour");
        break;
      default:
        break;
    }
  }

  private publish() {
    const g = this.garden;
    const share = oxygenShare(g);
    const a = this.action;
    const known = SPECIES_ORDER.filter((id) => g.seeds[id] > 0 || g.journal.has(id));
    hud.set({
      oxygen: share,
      perMinute: ((production(g) * 60) / DOME) * 100,
      eta: ARRIVAL - g.time,
      seeds: { ...g.seeds },
      known,
      selected: this.selected,
      can: g.can,
      canMax: CAN_SIZE,
      panels: g.panelsCarried,
      sprinklers: g.sprinklersCarried,
      prompt: a && this.kneelFor <= 0 ? describe(a) : null,
      medal: medal(g),
    });
  }
}
