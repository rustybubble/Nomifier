import { useEffect, useRef } from "react";
import type { ScanSocket } from "../api";
import { encodeSize } from "../scan/coords";
import type { AppData, Product, Track } from "../types";
import { decode, grabFrame } from "./decode";
import { barcodeCenterToFrame, resolveBarcode, trackAtPoint } from "./resolve";

export const LOCK_INTERVAL_MS = 400;
const NOT_IN_CATALOG_REPEAT_MS = 10_000;

export interface BarcodeLockArgs {
  video: HTMLVideoElement | null;
  tracksRef: { current: Track[] };
  socketRef: { current: ScanSocket | null };
  data: AppData | null;
  enabled: boolean;
  onLocked?: (trackId: number, product: Product) => void;
  onNotInCatalog?: (code: string) => void;
}

/** Every 400 ms: decode a full-res frame, pin the matching track to the scanned product. */
export function useBarcodeLock(args: BarcodeLockArgs): void {
  const a = useRef(args);
  a.current = args;
  const { video, enabled } = args;

  useEffect(() => {
    if (!video || !enabled) return;
    const canvas = document.createElement("canvas");
    const pins = new Map<number, string>(); // track id -> ndc11 already pinned
    const reported = new Map<string, number>(); // code -> last report time
    let stopped = false;

    const tick = async () => {
      const { data, tracksRef, socketRef, onLocked, onNotInCatalog } = a.current;
      if (!data || video.paused || video.ended || video.readyState < 2) return;
      const img = grabFrame(video, canvas);
      if (!img) return;
      const srcW = img.width;
      let hits;
      try {
        hits = await decode(img);
      } catch (e) {
        console.warn("[barcode] decode failed", e);
        return;
      }
      if (stopped || !hits) return;
      const frameW = encodeSize(video.videoWidth, video.videoHeight).w;
      for (const hit of hits) {
        const r = resolveBarcode(hit.text, data.productsByNdc);
        if ("product" in r) {
          const [x, y] = barcodeCenterToFrame(hit.box, srcW, frameW);
          const t = trackAtPoint(tracksRef.current, x, y);
          if (!t || pins.get(t.id) === r.product.ndc11) continue;
          pins.set(t.id, r.product.ndc11);
          socketRef.current?.sendPin(t.id, r.product.ndc11);
          onLocked?.(t.id, r.product);
        } else if (r.status === "not_in_catalog") {
          const now = Date.now();
          if (now - (reported.get(hit.text) ?? -Infinity) < NOT_IN_CATALOG_REPEAT_MS) continue;
          reported.set(hit.text, now);
          onNotInCatalog?.(hit.text);
        }
      }
    };

    const id = window.setInterval(() => void tick(), LOCK_INTERVAL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [video, enabled]);
}
