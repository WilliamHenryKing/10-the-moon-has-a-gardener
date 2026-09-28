/// <reference lib="webworker" />
import { buildHeightfield } from "./terrain-gen";

// Builds the basin's heightfield off the main thread.

self.onmessage = () => {
  const field = buildHeightfield();
  (self as unknown as Worker).postMessage(field, [field.heights.buffer]);
};
