import type { BarcodeHit, DecodeReply } from "./decode.worker";

export type { BarcodeHit };

let worker: Worker | null = null;
let busy = false;

/** Decode one frame in the worker. Resolves null (frame dropped) if a decode is already in flight. */
export function decode(img: ImageData): Promise<BarcodeHit[] | null> {
  if (busy) return Promise.resolve(null);
  busy = true;
  worker ??= new Worker(new URL("./decode.worker.ts", import.meta.url), {
    type: "module",
  });
  const w = worker;
  return new Promise((resolve, reject) => {
    const done = () => {
      busy = false;
      w.onmessage = w.onerror = null;
    };
    w.onmessage = (ev: MessageEvent<DecodeReply>) => {
      done();
      if ("error" in ev.data) reject(new Error(ev.data.error));
      else resolve(ev.data.hits);
    };
    w.onerror = (ev) => {
      done();
      worker = null; // recreate on next call
      w.terminate();
      reject(new Error(ev.message || "decoder worker failed"));
    };
    w.postMessage(
      { width: img.width, height: img.height, buffer: img.data.buffer },
      [img.data.buffer],
    );
  });
}

/** Draw the current video frame (downscaled to maxW) and return its pixels. */
export function grabFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  maxW = 1280,
): ImageData | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const w = Math.min(vw, maxW);
  const h = Math.round((w * vh) / vw);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}
