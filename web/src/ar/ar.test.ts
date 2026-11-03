/// <reference types="node" />
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { alternatives } from "../scoring/alternatives";
import { scoreMemo } from "../scoring/memo";
import { makeStyleFor } from "../scan/scoredStyle";
import { COLORS } from "../scan/overlay";
import type { AppData, Product, Track, UserProfile } from "../types";
import { bestForUse, edgePoint, pickArrows, type Item } from "./extras";

const FIX = path.resolve(process.cwd(), "../tools/fixtures");
const fx = (n: string) => JSON.parse(readFileSync(path.join(FIX, n), "utf8"));
const products: Product[] = fx("products.json");
const data: AppData = {
  products,
  productsByNdc: new Map(products.map((p) => [p.ndc11, p])),
  termTables: fx("term_tables.json"),
  rated: new Set(
    (fx("rated_ingredients.json") as { unii: string }[]).map((r) => r.unii),
  ),
  templates: fx("templates.json"),
  questions: fx("questions.json"),
  labelStatus: fx("label_status.json"),
  families: fx("families.json"),
};
const N = (s: string) => `99999000${s}`;
const profile: UserProfile = {
  id: "t",
  name: "t",
  persona: "adult_65_plus",
  conditions: ["hypertension"],
  medication_types: [],
};
const item = (id: number, s: string, x: number): Item => ({
  trackId: id,
  ndc: N(s),
  box: [x, 100, x + 80, 200],
});
const scoreFn = (ndc: string) => {
  const r = scoreMemo(data.productsByNdc.get(ndc)!, profile, data);
  return r.status === "scored" ? { tier: r.tier, score: r.score } : null;
};
const altFor = (items: Item[]) => {
  const inView = new Set(items.map((i) => i.ndc));
  return (ndc: string) =>
    alternatives(data.productsByNdc.get(ndc)!, profile, data, inView).find(
      (a) => a.inView,
    )?.ndc11 ?? null;
};

describe("edgePoint", () => {
  const box: [number, number, number, number] = [0, 0, 100, 50];
  it("exits right / left / top / bottom", () => {
    expect(edgePoint(box, [300, 25])).toEqual([100, 25]);
    expect(edgePoint(box, [-300, 25])).toEqual([0, 25]);
    expect(edgePoint(box, [50, -300])).toEqual([50, 0]);
    expect(edgePoint(box, [50, 300])).toEqual([50, 50]);
  });
  it("diagonal exits on the nearer face", () => {
    const [x, y] = edgePoint(box, [150, 125]); // slope 1: hits bottom first
    expect(y).toBeCloseTo(50);
    expect(x).toBeCloseTo(75);
  });
  it("target at center returns center", () => {
    expect(edgePoint(box, [50, 25])).toEqual([50, 25]);
  });
});

describe("pickArrows", () => {
  it("red source points at the best in-view alternative", () => {
    const items = [item(1, "303", 0), item(2, "101", 150)];
    const a = pickArrows(items, scoreFn, altFor(items));
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ fromId: 1, toId: 2 });
  });
  it("no arrow when no better alternative is in view or source is not red", () => {
    const only = [item(1, "303", 0)];
    expect(pickArrows(only, scoreFn, altFor(only))).toEqual([]);
    const ok = [item(1, "101", 0), item(2, "505", 150)];
    expect(pickArrows(ok, scoreFn, altFor(ok))).toEqual([]);
  });
  it("focus forces an arrow for a non-red product", () => {
    const items = [item(1, "606", 0), item(2, "101", 150)];
    expect(pickArrows(items, scoreFn, altFor(items))).toEqual([]);
    const a = pickArrows(items, scoreFn, altFor(items), N("606"));
    expect(a.map((x) => [x.fromId, x.toId])).toEqual([[1, 2]]);
  });
  it("caps at 2, most severe source first", () => {
    const stub = (n: string) =>
      ({ [N("1")]: 30, [N("2")]: 10, [N("3")]: 20 })[n] !== undefined
        ? {
            tier: "red" as const,
            score: { [N("1")]: 30, [N("2")]: 10, [N("3")]: 20 }[n]!,
          }
        : { tier: "green" as const, score: 90 };
    const items = [
      item(1, "1", 0),
      item(2, "2", 100),
      item(3, "3", 200),
      item(4, "4", 300),
    ];
    const a = pickArrows(items, stub, () => N("4"));
    expect(a.map((x) => x.fromId)).toEqual([2, 3]);
  });
});

describe("bestForUse", () => {
  const uses = (s: string) => data.productsByNdc.get(N(s))!.uses;
  const items = ["101", "303", "404", "505"].map((s, i) => ({
    ...item(i, s, i * 90),
    uses: uses(s),
  }));
  const sc = (n: string) => scoreFn(n)?.score ?? null;
  it("picks the top scorer among matching uses", () => {
    expect(bestForUse(items, sc, ["allergy"])?.ndc).toBe(N("505"));
    expect(bestForUse(items, sc, ["pain", "fever"])?.ndc).toBe(N("101"));
  });
  it("null when nothing matches or is scorable", () => {
    expect(bestForUse(items, sc, ["sleep"])).toBeNull();
    expect(bestForUse(items, () => null, ["pain"])).toBeNull();
  });
});

describe("scoredStyle useFilter array", () => {
  const t = (s: string): Track => ({
    id: 1,
    box: [0, 0, 1, 1],
    status: "named",
    product_id: N(s),
    family: null,
    similarity: 0.9,
    age: 3,
  });
  const style = makeStyleFor({ data, profile, useFilter: ["pain", "fever"] });
  it("dims products sharing none of the uses", () => {
    expect(style(t("404")).dim).toBe(true);
    expect(style(t("101")).dim).toBe(false);
    expect(style(t("606")).dim).toBe(false); // shares pain
    expect(style(t("303")).color).toBe(COLORS.red);
  });
  it("null or empty filter dims nothing", () => {
    expect(makeStyleFor({ data, profile, useFilter: null })(t("404")).dim).toBe(
      false,
    );
    expect(makeStyleFor({ data, profile, useFilter: [] })(t("404")).dim).toBe(
      false,
    );
  });
});
