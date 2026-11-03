import { ndcCandidates } from "@nomi/barcode";
import type { Product, Track } from "../types";

export type BarcodeFailure = "not_ndc" | "invalid" | "bad_check_digit";
export type Resolved =
  | { product: Product }
  | { status: "not_in_catalog"; candidates: string[] }
  | { status: BarcodeFailure };

export function resolveBarcode(
  text: string,
  productsByNdc: Map<string, Product>,
): Resolved {
  const r = ndcCandidates(text);
  if (r.status === "invalid_format") return { status: "invalid" };
  if (r.status === "not_ndc_barcode") return { status: "not_ndc" };
  if (r.status === "bad_check_digit") return { status: "bad_check_digit" };
  for (const c of r.candidates) {
    const product = productsByNdc.get(c);
    if (product) return { product };
  }
  return { status: "not_in_catalog", candidates: r.candidates };
}

/** Center of a barcode box (source pixels), scaled into the 640px frame/track coordinate space. */
export function barcodeCenterToFrame(
  box: [number, number, number, number],
  sourceW: number,
  frameW: number,
): [number, number] {
  const s = frameW / sourceW;
  return [((box[0] + box[2]) / 2) * s, ((box[1] + box[3]) / 2) * s];
}

/** The track whose box contains the point; the smallest box wins. */
export function trackAtPoint(
  tracks: ReadonlyArray<Track>,
  x: number,
  y: number,
): Track | null {
  let best: Track | null = null;
  let bestArea = Infinity;
  for (const t of tracks) {
    const [x1, y1, x2, y2] = t.box;
    if (x < x1 || x > x2 || y < y1 || y > y2) continue;
    const area = (x2 - x1) * (y2 - y1);
    if (area < bestArea) {
      best = t;
      bestArea = area;
    }
  }
  return best;
}
