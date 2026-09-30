import * as THREE from "three";

/** Each runtime owns its resources, including textures that finish loading after it stops. */
export class Assets {
  private controller = new AbortController();
  readonly signal = this.controller.signal;
  private resources = new Set<{ dispose(): void }>();
  private parent?: AbortSignal;
  constructor(parent?: AbortSignal) {
    this.parent = parent;
    parent?.addEventListener("abort", this.dispose, { once: true });
    if (parent?.aborted) this.dispose();
  }
  own<T extends { dispose(): void }>(resource: T): T {
    if (this.signal.aborted) resource.dispose();
    else this.resources.add(resource);
    return resource;
  }
  texture(url: string): Promise<THREE.Texture> {
    this.signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const abort = () => reject(this.signal.reason);
      this.signal.addEventListener("abort", abort, { once: true });
      const finish = () => this.signal.removeEventListener("abort", abort);
      const texture = new THREE.TextureLoader().load(
        url,
        (value) => {
          finish();
          if (this.signal.aborted) value.dispose();
          else resolve(value);
        },
        undefined,
        (error) => {
          finish();
          reject(error);
        },
      );
      this.own(texture);
    });
  }
  dispose = () => {
    if (this.signal.aborted) return;
    this.controller.abort();
    this.parent?.removeEventListener("abort", this.dispose);
    for (const resource of this.resources) resource.dispose();
    this.resources.clear();
  };
}

/** Release shared mesh/instance/skeleton/material resources once, including shader textures. */
export function disposeObject(root: THREE.Object3D) {
  const seen = new Set<{ dispose(): void }>();
  const release = (value: { dispose(): void } | null | undefined) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    value.dispose();
  };
  const texture = (value: unknown) => {
    if (value instanceof THREE.Texture) release(value);
    else if (Array.isArray(value)) for (const item of value) texture(item);
  };
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    release(mesh.geometry);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material || seen.has(material)) continue;
      for (const value of Object.values(material)) texture(value);
      const uniforms = (material as THREE.ShaderMaterial).uniforms;
      if (uniforms) for (const uniform of Object.values(uniforms)) texture(uniform.value);
      release(material);
    }
    if (object instanceof THREE.SkinnedMesh) release(object.skeleton);
    if (object instanceof THREE.InstancedMesh) release(object);
  });
  root.clear();
}

/** Worker completion, failure, cancellation and timeout all terminate the owned worker. */
export async function workerResult<T>(
  worker: Worker,
  input: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    signal?.throwIfAborted();
    return await new Promise<T>((resolve, reject) => {
      abort = () => reject(signal?.reason);
      signal?.addEventListener("abort", abort, { once: true });
      worker.onmessage = (event) => resolve(event.data);
      worker.onerror = () => reject(new Error("The landscape worker could not finish."));
      worker.onmessageerror = () =>
        reject(new Error("The landscape worker returned invalid data."));
      timer = setTimeout(() => reject(new Error("The landscape worker timed out.")), 60_000);
      worker.postMessage(input);
    });
  } finally {
    clearTimeout(timer);
    if (abort) signal?.removeEventListener("abort", abort);
    worker.onmessage = worker.onerror = worker.onmessageerror = null;
    worker.terminate();
  }
}
