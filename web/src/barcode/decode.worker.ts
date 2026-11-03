/// <reference lib="webworker" />
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
// Self-hosted wasm (offline PWA, Tailscale): Vite emits it as a local asset; never the CDN default.
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

export interface DecodeRequest {
  width: number;
  height: number;
  buffer: ArrayBuffer;
}
export interface BarcodeHit {
  text: string;
  box: [number, number, number, number]; // x1, y1, x2, y2 in the decoded image's pixels
}
export type DecodeReply = { hits: BarcodeHit[] } | { error: string };

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith(".wasm")
        ? new URL(wasmUrl, self.location.href).href
        : prefix + path,
  },
});

self.onmessage = async (ev: MessageEvent<DecodeRequest>) => {
  const { width, height, buffer } = ev.data;
  try {
    const img = new ImageData(new Uint8ClampedArray(buffer), width, height);
    const res = await readBarcodes(img, {
      formats: ["UPC-A", "EAN-13"],
      tryHarder: true,
      maxNumberOfSymbols: 4,
    });
    const hits: BarcodeHit[] = res
      .filter((r) => r.isValid)
      .map((r) => {
        const p = [
          r.position.topLeft,
          r.position.topRight,
          r.position.bottomRight,
          r.position.bottomLeft,
        ];
        const xs = p.map((q) => q.x);
        const ys = p.map((q) => q.y);
        return {
          text: r.text,
          box: [
            Math.min(...xs),
            Math.min(...ys),
            Math.max(...xs),
            Math.max(...ys),
          ],
        };
      });
    self.postMessage({ hits } satisfies DecodeReply);
  } catch (e) {
    self.postMessage({ error: String(e) } satisfies DecodeReply);
  }
};
