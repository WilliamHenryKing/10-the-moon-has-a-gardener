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
      case "harvested":
        this.said.add("harvested");
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

  /** The current task stays on the suit until the gardener actually completes it. */
  instruction(g: Garden): string {
    if (g.unlocked.has("full"))
      return "The dome is full. Your garden keeps growing; enjoy the first air on the Moon.";
    if (g.plants.length === 0)
      return "Step off the pad and face open ground. Choose Mooncress (1); a green ring suits the seed. Press E or tap Act to plant.";
    if (!this.said.has("watered"))
      return "Face your new seed and press E or tap Act to water it. Plants grow only while they have water.";
    if (g.can === 0 && g.plants.some((p) => p.water <= 0.6))
      return "The can is empty. Refill at the tank beside the dome, or at the ice drill; stand nearby and press E or tap Act.";
    if (g.journal.size === 0)
      return "Keep your seeds watered until the first bloom. Try Sunleaf (2) on open ground; refill at the tank when needed.";
    if (
      !this.said.has("harvested") &&
      g.plants.some((p) => p.bloomed && SPECIES[p.species].seeds > 0)
    )
      return "Face a bloom and press E or tap Act to harvest its seeds. The flower stays and keeps breathing into the dome.";
    const probe = g.pickups.find((p) => p.id === "probe");
    if (probe && !probe.taken)
      return "Find the crashed survey probe south-east of the pad. Stand by its amber beacon and press E or tap Act to open it.";
    if (g.seeds.nightbell > 0 && !g.journal.has("nightbell"))
      return "Try Nightbell (3) in the shaded crater bowl, or behind a shade panel (8). Plant it, then water it.";
    if (!g.unlocked.has("caches"))
      return "Grow and tend more flowers. At 40% dome oxygen, two new survey caches open; the rover unlocks at 25%.";
    if (g.pickups.some((p) => p.needs === "caches" && !p.taken))
      return "Follow the amber beacons: Glassfern seeds on the Earthside slope to the north, Craterbloom seeds at the ice drill to the west.";
    if (!g.unlocked.has("supply"))
      return "Plant Glassfern on a slope facing Earth and Craterbloom by wet ice. Keep tending your garden to reach the 60% supply drop.";
    if (g.pickups.some((p) => p.id === "supply" && !p.taken))
      return "The supply drop waits beside the pad. Open it for birch saplings and sprinklers.";
    if (g.seeds.birch > 0 && !g.plants.some((p) => p.species === "birch"))
      return "Set a sprinkler (9) on open sunny ground, then plant Silver birch (6) within five metres. The sprinkler keeps it watered.";
    return "Tend dry plants, harvest more seeds and grow the garden until the dome is full. Suit jets unlock at 80% oxygen.";
  }

  private milestone(unlock: string) {
    const lines: Record<string, string> = {
      rover: "A quarter full! The rover's fuel cell is charged: it's by the pad when you want it.",
      caches:
        "Survey caches located: one on the Earthside slope to the north, one at the ice drill in the bowl to the west.",
      supply: "Supply drop coming down beside the pad: birch saplings and sprinklers.",
      jets: "Suit jets unlocked. Hold Space in the air to boost.",
      full: "The dome is full. Perennial, your air is ready.",
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
        "Step off the pad and face open ground: the ring shows where the seed goes. Green means it will thrive. Press E to plant.",
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
