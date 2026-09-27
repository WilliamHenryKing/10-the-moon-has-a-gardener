import type { Level } from "./types";

// Six gardens, each introducing one idea. Budgets are verified by tests/solver.test.ts.
export const LEVELS: Level[] = [
  {
    id: "first-seedling",
    name: "First Seedling",
    width: 4,
    depth: 4,
    panels: 4,
    plants: [{ x: 1, z: 2, species: "mooncress" }],
    rocks: [],
    note: "Mooncress wants half a day of light. Stand panels near it so it spends 3 to 5 hours in shade.",
  },
  {
    id: "sun-and-shelter",
    name: "Sun and Shelter",
    width: 5,
    depth: 4,
    panels: 4,
    plants: [
      { x: 1, z: 1, species: "sunleaf" },
      { x: 3, z: 2, species: "mooncress" },
    ],
    rocks: [],
    note: "Sunleaf needs almost the whole day. Shadows reach two tiles, so shelter the cress without darkening the leaf.",
  },
  {
    id: "night-bloom",
    name: "Night Bloom",
    width: 5,
    depth: 5,
    panels: 4,
    plants: [{ x: 2, z: 2, species: "nightbell" }],
    rocks: [
      { x: 1, z: 1 },
      { x: 2, z: 4 },
    ],
    note: "Nightbell opens in darkness. Rocks cast shadows too: build on them to wall it in.",
  },
  {
    id: "neighbours",
    name: "Neighbours",
    width: 5,
    depth: 5,
    panels: 5,
    plants: [
      { x: 1, z: 2, species: "nightbell" },
      { x: 3, z: 2, species: "mooncress" },
      { x: 2, z: 0, species: "sunleaf" },
    ],
    rocks: [{ x: 0, z: 4 }],
    note: "One panel can shade two plants at different hours. Share them.",
  },
  {
    id: "earthrise-row",
    name: "Earthrise Row",
    width: 6,
    depth: 5,
    panels: 5,
    plants: [
      { x: 0, z: 0, species: "sunleaf" },
      { x: 5, z: 4, species: "sunleaf" },
      { x: 2, z: 2, species: "mooncress" },
      { x: 3, z: 2, species: "mooncress" },
      { x: 4, z: 1, species: "nightbell" },
    ],
    rocks: [
      { x: 5, z: 0 },
      { x: 0, z: 3 },
    ],
    note: "A full row under Earth. Two cress side by side, a nightbell tucked by the rock.",
  },
  {
    id: "gardeners-ring",
    name: "The Gardener's Ring",
    width: 6,
    depth: 6,
    panels: 6,
    plants: [
      { x: 3, z: 0, species: "sunleaf" },
      { x: 3, z: 1, species: "mooncress" },
      { x: 4, z: 1, species: "nightbell" },
      { x: 3, z: 2, species: "nightbell" },
      { x: 4, z: 4, species: "mooncress" },
      { x: 5, z: 5, species: "sunleaf" },
    ],
    rocks: [
      { x: 1, z: 1 },
      { x: 4, z: 5 },
    ],
    note: "The last bed: all three kinds crowded together. Every panel counts.",
  },
];
