// Quality tiers and the frame governor. The tier is guessed at startup from the GPU and the
// device (overridable with ?quality=low|medium|high), then the governor watches real frame times
// and trades render resolution first, then the costly effects, to hold a steady frame rate.

export type Quality = "high" | "medium" | "low";

export interface Tier {
  /** Cap on the device pixel ratio. */
  pixelRatio: number;
  /** Cap on the drawing buffer's pixels, so a dense 4K screen is not drawn at 8 megapixels. */
  pixelBudget: number;
  msaa: number;
  shadow: number;
  ao: boolean;
  smaa: boolean;
  /** Multiplier on terrain level-of-detail distances. */
  lod: number;
  /** Multiplier on scattered detail (rocks, pebbles, stars). */
  detail: number;
}

export const TIERS: Record<Quality, Tier> = {
  high: {
    pixelRatio: 2,
    pixelBudget: 3.7e6,
    msaa: 4,
    shadow: 2048,
    ao: true,
    smaa: true,
    lod: 1.25,
    detail: 1,
  },
  medium: {
    pixelRatio: 1.5,
    pixelBudget: 2.1e6,
    msaa: 0,
    shadow: 2048,
    ao: false,
    smaa: true,
    lod: 1,
    detail: 0.7,
  },
  low: {
    pixelRatio: 1,
    pixelBudget: 1.0e6,
    msaa: 0,
    shadow: 1024,
    ao: false,
    smaa: false,
    lod: 0.7,
    detail: 0.4,
  },
};

/** A first guess from the GPU's name and the device; the governor corrects it in play. */
export function detectQuality(gl: WebGL2RenderingContext | null): Quality {
  const forced = new URLSearchParams(location.search).get("quality");
  if (forced === "high" || forced === "medium" || forced === "low") return forced;
  const coarse = matchMedia("(pointer: coarse)").matches;
  let gpu = "";
  if (gl) {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  }
  if (/swiftshader|llvmpipe|software/i.test(gpu)) return "low";
  if (coarse) return /apple gpu|adreno \(tm\) 7|mali-g7/i.test(gpu) ? "medium" : "low";
  if (
    /nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|apple m[2-9]|apple m1 (pro|max|ultra)/i.test(
      gpu,
    )
  )
    return "high";
  if (/intel|uhd|iris|hd graphics|radeon\(tm\) graphics|vega|apple m1/i.test(gpu)) return "medium";
  return "medium";
}

/**
 * Watches frame times over one-second windows. Two slow windows in a row lower the render scale
 * (down to half resolution) and then ask for effects to be dropped; a long run of fast windows
 * wins resolution back, but never soon after it was lowered, so the scale cannot see-saw (each
 * change reallocates the frame's buffers, a hitch). It waits a moment after start-up and after
 * each change so shader warm-up is not mistaken for a slow machine.
 */
export class FrameGovernor {
  private time = 0;
  private frames = 0;
  private cooldown = 3;
  private slow = 0;
  private fast = 0;
  /** Seconds before the scale may rise again. */
  private hold = 0;
  constructor(
    private target = 1 / 55,
    private onScale: (scale: number) => void,
    private getScale: () => number,
    private onDrop: () => boolean,
  ) {}

  sample(dt: number) {
    if (dt <= 0 || dt > 0.5) return;
    this.cooldown -= dt;
    this.hold -= dt;
    this.time += dt;
    this.frames++;
    if (this.time < 1) return;
    const avg = this.time / this.frames;
    this.time = 0;
    this.frames = 0;
    if (this.cooldown > 0) return;
    const scale = this.getScale();
    if (avg > this.target * 1.15) {
      this.fast = 0;
      if (++this.slow < 2) return;
      this.slow = 0;
      if (scale > 0.55) this.onScale(scale - (avg > this.target * 1.6 ? 0.15 : 0.08));
      else this.onDrop();
      this.cooldown = 2;
      this.hold = 20;
    } else if (avg < this.target * 0.7 && scale < 1) {
      this.slow = 0;
      if (this.hold > 0 || ++this.fast < 5) return;
      this.fast = 0;
      this.onScale(scale + 0.05);
      this.cooldown = 3;
    } else {
      this.slow = 0;
      this.fast = 0;
    }
  }
}
