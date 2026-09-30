// The seven species of the lunar garden. Each wants its own place: a share of the slow lunar day
// in sunlight (or shade), Earthlight, or wet ground by the ice. Pure data.

export type SpeciesId =
  | "mooncress"
  | "sunleaf"
  | "nightbell"
  | "glassfern"
  | "craterbloom"
  | "birch"
  | "orchid";

export interface Species {
  id: SpeciesId;
  name: string;
  /** What it wants, in a few words for the pouch and journal. */
  want: string;
  /** Plain-language hint for Mission Control and the journal. */
  hint: string;
  /** Share of the lunar day in direct sunlight it thrives in, 0 … 1. */
  sun: [number, number];
  /** Needs Earth in view, on ground that faces it. */
  earth: boolean;
  /** Needs wet ground (by the ice, or a sprinkler). */
  wet: boolean;
  /** Seconds from seed to bloom in ideal conditions. */
  grow: number;
  /** Oxygen per second while blooming (units). */
  oxygen: number;
  /** Seeds a harvest gives back, and seconds before it can be harvested again. */
  seeds: number;
  regrow: number;
  /** Minimum spacing to other plants (metres). */
  space: number;
}

export const SPECIES: Record<SpeciesId, Species> = {
  mooncress: {
    id: "mooncress",
    name: "Mooncress",
    want: "some sun",
    hint: "Hardy and quick: grows almost anywhere the Sun reaches for a quarter of the day or more. The easy first crop.",
    sun: [0.25, 0.92],
    earth: false,
    wet: false,
    grow: 55,
    oxygen: 0.6,
    seeds: 2,
    regrow: 45,
    space: 1.1,
  },
  sunleaf: {
    id: "sunleaf",
    name: "Sunleaf",
    want: "full sun",
    hint: "Broad fans that follow the Sun. Needs open plains where nothing shades it for most of the day.",
    sun: [0.72, 1],
    earth: false,
    wet: false,
    grow: 80,
    oxygen: 1.1,
    seeds: 2,
    regrow: 55,
    space: 1.6,
  },
  nightbell: {
    id: "nightbell",
    name: "Nightbell",
    want: "deep shade",
    hint: "Glows in the dark. Plant it where the Sun barely reaches: the crater bowl, or behind a shade panel.",
    sun: [0, 0.22],
    earth: false,
    wet: false,
    grow: 85,
    oxygen: 1.2,
    seeds: 2,
    regrow: 60,
    space: 1.2,
  },
  glassfern: {
    id: "glassfern",
    name: "Glassfern",
    want: "Earthlight",
    hint: "Its fronds drink Earthshine. Plant it on the slope that faces Earth, with Earth in plain view.",
    sun: [0, 0.8],
    earth: true,
    wet: false,
    grow: 110,
    oxygen: 1.6,
    seeds: 1,
    regrow: 70,
    space: 1.5,
  },
  craterbloom: {
    id: "craterbloom",
    name: "Craterbloom",
    want: "wet ground",
    hint: "A tall burst of petals. Needs wet ground: beside the ice in the crater bowl, or under a sprinkler.",
    sun: [0, 1],
    earth: false,
    wet: true,
    grow: 130,
    oxygen: 2,
    seeds: 1,
    regrow: 80,
    space: 1.8,
  },
  birch: {
    id: "birch",
    name: "Silver birch",
    want: "sun and water",
    hint: "A real tree, slow and generous. Needs plenty of sun and wet ground: a sprinkler on the open plain.",
    sun: [0.55, 1],
    earth: false,
    wet: true,
    grow: 200,
    oxygen: 4,
    seeds: 1,
    regrow: 120,
    space: 3,
  },
  orchid: {
    id: "orchid",
    name: "Selene orchid",
    want: "a gift",
    hint: "The Lanternfolk's own flower. It grows anywhere they have blessed.",
    sun: [0, 1],
    earth: false,
    wet: false,
    grow: 20,
    oxygen: 6,
    seeds: 0,
    regrow: 999,
    space: 2,
  },
};

export const SPECIES_ORDER: SpeciesId[] = [
  "mooncress",
  "sunleaf",
  "nightbell",
  "glassfern",
  "craterbloom",
  "birch",
  "orchid",
];
