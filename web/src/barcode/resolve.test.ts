import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Product, Track } from "../types";
import { barcodeCenterToFrame, resolveBarcode, trackAtPoint } from "./resolve";

interface Case {
  description: string;
  input: string;
  status: "ok" | "invalid_format" | "bad_check_digit" | "not_ndc_barcode";
  candidates: string[];
}
const cases: Case[] = JSON.parse(
  readFileSync(
    new URL("../../../vendor/nomi/barcodes.json", import.meta.url),
    "utf8",
  ),
);
const prod = (ndc11: string) => ({ ndc11 }) as Product;
const STATUS = {
  invalid_format: "invalid",
  bad_check_digit: "bad_check_digit",
  not_ndc_barcode: "not_ndc",
} as const;

describe("resolveBarcode vs vendor fixtures", () => {
  it("has fixtures", () => expect(cases.length).toBeGreaterThan(30));
  for (const c of cases) {
    it(c.description, () => {
      if (c.status === "ok") {
        expect(resolveBarcode(c.input, new Map())).toEqual({
          status: "not_in_catalog",
          candidates: c.candidates,
        });
        for (const cand of c.candidates) {
          const r = resolveBarcode(c.input, new Map([[cand, prod(cand)]]));
          expect(r).toEqual({ product: prod(cand) });
        }
      } else {
        expect(resolveBarcode(c.input, new Map())).toEqual({
          status: STATUS[c.status],
        });
      }
    });
  }
});

const T = (id: number, box: Track["box"]) => ({ id, box }) as Track;

describe("barcode -> track mapping", () => {
  it("scales source px into 640px frame coords", () => {
    // 1280-wide source, 640 frame: halves the coordinates
    expect(barcodeCenterToFrame([100, 200, 300, 400], 1280, 640)).toEqual([
      100, 150,
    ]);
    expect(barcodeCenterToFrame([0, 0, 10, 10], 640, 640)).toEqual([5, 5]);
  });
  it("picks the smallest containing box", () => {
    const tracks = [
      T(1, [0, 0, 400, 400]),
      T(2, [100, 100, 200, 200]),
      T(3, [300, 300, 350, 350]),
    ];
    expect(trackAtPoint(tracks, 150, 150)?.id).toBe(2);
    expect(trackAtPoint(tracks, 50, 50)?.id).toBe(1);
    expect(trackAtPoint(tracks, 320, 320)?.id).toBe(3);
  });
  it("returns null when nothing contains the point", () => {
    expect(trackAtPoint([T(1, [0, 0, 10, 10])], 50, 50)).toBeNull();
    expect(trackAtPoint([], 1, 1)).toBeNull();
  });
});
