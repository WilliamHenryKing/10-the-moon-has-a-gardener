import { CAN_SIZE, type Garden, type GardenEvent, oxygenShare } from "./garden";
import { SPECIES } from "./species";

// Mission Control on the radio: teaching by doing. Each line waits for the gardener to have done
// the thing before it (or for a quiet spell that suggests they are stuck), and nothing is said
// twice. Pure logic: it reads the garden and its events and hands lines to `say`.

export type Say = (
  who: "Mission Control" | "Suit" | "Perennial",
  text: string,
  hold?: number,
) => void;

export class Guide {
  private said = new Set<string>();
  private quiet = 0;
  private since = 0;
  private blooms = 0;

  constructor(private say: Say) {}

  private once(key: string, text: string, who: Parameters<Say>[0] = "Mission Control", hold = 9) {
    if (this.said.has(key)) return false;
    this.said.add(key);
    this.say(who, text, hold);
    this.quiet = 0;
    return true;
  }

  start() {
    this.once(
      "hello",
      "Gardener, welcome to the Connecting ridge. The dome is empty and the Perennial lands in eighteen minutes. Let's grow them some air.",
      "Mission Control",
      11,
    );
  }

  event(e: GardenEvent, g: Garden) {
    switch (e.type) {
      case "planted":
        this.once("planted", "Seed's in. Face it and press E again to give it water.");
        break;
      case "watered":
        this.once(
          "watered",
          `It grows while it has water. Plant a few more: try ${SPECIES.sunleaf.name} (key 2) out in full sun.`,
        );
        break;
      case "thirsty":
        this.once(
          "thirsty",
          "One of your plants has gone dry. Plants only grow while they are watered.",
        );
        break;
      case "refilled":
        this.once(
          "refilled",
          "Can's full. The ice down in the bowl will fill it too, once you find the drill.",
          "Suit",
          7,
        );
        break;
      case "bloomed":
        this.blooms++;
        if (e.first && this.blooms === 1)
          this.once("bloom", "First bloom! Blooms breathe into the dome. Watch the gauge climb.");
        else if (e.first)
          this.say(
            "Suit",
            `New species in bloom: ${SPECIES[e.plant.species].name}. Added to the journal.`,
            6,
          );
        if (this.blooms === 2)
          this.once("harvest", "Blooms seed again. Face one and press E to gather its seeds.");
        break;
      case "pickup":
        this.say("Suit", `${e.pickup.label}: ${describeHaul(e.pickup)}.`, 7);
        break;
      case "milestone":
        this.milestone(e.unlock);
        break;
      case "arrived":
        this.say(
          "Perennial",
          oxygenShare(g) >= 1
            ? "Perennial on the pad. Twelve of us, and a dome full of air. Thank you, gardener."
            : "Perennial on the pad. We'll stay aboard until the dome is full. Keep going, gardener.",
          12,
        );
        break;
      default:
        break;
    }
  }

  private milestone(unlock: string) {
    const lines: Record<string, string> = {
      rover: "A quarter full! The rover's fuel cell is charged: it's by the pad when you want it.",
      caches:
        "Survey caches located: one on the Earthside slope to the north, one at the ice drill in the bowl to the west.",
      supply: "Supply drop coming down beside the pad: birch saplings and sprinklers.",
      jets: "Suit jets unlocked. Hold Space in the air to boost.",
      full: "The dome is full. Perennial, you are clear to land.",
    };
    const text = lines[unlock];
    if (text) this.once(`milestone-${unlock}`, text, "Mission Control", 11);
  }

  /** Call every frame with the time since the last call. */
  update(dt: number, g: Garden) {
    this.quiet += dt;
    this.since += dt;
    if (this.since > 7 && g.plants.length === 0)
      this.once(
        "how-to-plant",
        "Step off the pad, face open ground and press E. Mooncress is happy almost anywhere.",
      );
    if (g.can <= 1 && g.plants.length > 0)
      this.once(
        "can-low",
        "Your can's nearly dry. Refill at the tank beside the dome: stand by it and press E.",
      );
    if (this.blooms >= 1 && this.quiet > 25)
      this.once(
        "probe",
        "Survey control says a probe came down south-east of the pad years ago. It carried seeds: worth a look.",
      );
    if (g.plants.length >= 6 && this.quiet > 30)
      this.once(
        "variety",
        "Each species wants its own light. Nightbells like shade; the bowl's floor never sees the Sun.",
      );
    if (g.can === CAN_SIZE && g.plants.length > 0) this.said.add("can-full-seen");
  }
}

function describeHaul(p: {
  seeds: Partial<Record<string, number>>;
  panels?: number;
  sprinklers?: number;
}) {
  const bits: string[] = [];
  for (const [id, n] of Object.entries(p.seeds))
    if (n) bits.push(`${n} ${SPECIES[id as keyof typeof SPECIES].name} seed${n === 1 ? "" : "s"}`);
  if (p.panels) bits.push(`${p.panels} shade panel${p.panels === 1 ? "" : "s"}`);
  if (p.sprinklers) bits.push(`${p.sprinklers} sprinkler${p.sprinklers === 1 ? "" : "s"}`);
  return bits.join(", ") || "empty";
}
