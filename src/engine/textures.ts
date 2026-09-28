import * as THREE from "three";
import type { RegolithMaps } from "./ground";

// PBR texture sets shipped in public/textures/<set>/ as WebP (see assets.manifest.json): colour in
// sRGB, everything else linear. ARM packs ambient occlusion, roughness and metalness.

const loader = new THREE.TextureLoader();
let anisotropy = 8;

export function setAnisotropy(a: number) {
  anisotropy = a;
}

export async function loadTexture(url: string, colour: boolean) {
  const t = await loader.loadAsync(`${import.meta.env.BASE_URL}${url}`);
  t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  return t;
}

/** Mean linear luminance of a colour texture's image (for absolute albedo grading). */
export function meanLuminance(t: THREE.Texture) {
  const img = t.image as CanvasImageSource & { width: number; height: number };
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d");
  if (!g) return 0.2;
  g.drawImage(img, 0, 0, 32, 32);
  const d = g.getImageData(0, 0, 32, 32).data;
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  let sum = 0;
  for (let i = 0; i < d.length; i += 4)
    sum +=
      0.2126 * lin(d[i] as number) +
      0.7152 * lin(d[i + 1] as number) +
      0.0722 * lin(d[i + 2] as number);
  return Math.max(0.02, sum / (d.length / 4));
}

export async function loadRegolith(): Promise<RegolithMaps> {
  const set = (name: string, map: string, colour = false) =>
    loadTexture(`textures/${name}/${name}_${map}.webp`, colour);
  const [colour, normal, arm, roughNormal, roughArm, meteorNormal] = await Promise.all([
    set("moon_dusted_05", "diff", true),
    set("moon_dusted_05", "nor"),
    set("moon_dusted_05", "arm"),
    set("moon_01", "nor"),
    set("moon_01", "arm"),
    set("moon_meteor_01", "nor"),
  ]);
  return {
    dust: { colour, normal, arm, mean: meanLuminance(colour) },
    rough: { normal: roughNormal, arm: roughArm },
    meteor: { normal: meteorNormal },
  };
}
