// Core types for the lunar garden rules. Pure data: no DOM, no three.js.

export type Species = "sunleaf" | "mooncress" | "nightbell";

export interface Cell {
  x: number; // column, west → east
  z: number; // row, north → south
}

export interface PlantSpot extends Cell {
  species: Species;
}

export interface Level {
  id: string;
  name: string;
  width: number;
  depth: number;
  panels: number; // shade panels carried on the rover for this garden
  plants: PlantSpot[];
  rocks: Cell[];
  note: string; // one line shown when the garden opens
}

/** Why a plant failed, or that it bloomed. */
export type Verdict = "bloom" | "scorched" | "starved";

export interface HourState {
  lit: boolean;
  growth: number; // 0..1 after this hour
  health: "growing" | "scorched" | "starved";
}
