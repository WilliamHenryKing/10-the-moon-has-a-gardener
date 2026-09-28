/// <reference lib="webworker" />
import { buildParts, buildSuit } from "./suit-body";

// Builds the gardener's suit off the main thread; voxel sizes come from the quality tier.

self.onmessage = (e: MessageEvent<{ suit: number; parts: number }>) => {
  const suit = buildSuit(e.data.suit);
  const parts = buildParts(e.data.parts);
  const buffers: ArrayBuffer[] = [
    ...Object.values(suit).map((a) => (a as ArrayBufferView).buffer as ArrayBuffer),
    ...parts.flatMap(
      (p) => [p.positions.buffer, p.normals.buffer, p.indices.buffer] as ArrayBuffer[],
    ),
  ];
  (self as unknown as Worker).postMessage({ suit, parts }, buffers);
};
