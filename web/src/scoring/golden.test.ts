/// <reference types="node" />
// Parity with scripts/score.py (Nomi NOMI-057): every vector in data/golden.json must give the same
// score and tier in TypeScript as in Python. score.py checks the same file in pytest.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Product, TermTables, UserProfile } from "../types";
import { score } from "./score";

const ROOT = resolve(process.cwd(), "..");
const json = (p: string) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));

interface Vector {
  note?: string;
  tables: "nomi_sample" | "repo";
  ndc11: string;
  profile: Omit<UserProfile, "id" | "name">;
  expected: { score: number; tier: string } | { status: "unrated" };
}

function dataset(tables: Vector["tables"]) {
  if (tables === "nomi_sample") {
    const tt: TermTables = json("vendor/nomi/samples/term-tables.json");
    const products: Product[] = [json("vendor/nomi/samples/product.json")];
    // Same rule as score.py: every UNII the sample has rows or ingredient hard stops for counts as reviewed.
    const rated = new Set<string>([
      ...tt.terms.map((t) => t.unii),
      ...(tt.hard_stops as Array<{ unii?: string }>).flatMap((s) =>
        s.unii ? [s.unii] : [],
      ),
    ]);
    return { termTables: tt, products, rated, templates: {} };
  }
  return {
    termTables: json("data/term_tables.json") as TermTables,
    products: json("data/products.json") as Product[],
    rated: new Set<string>(
      json("data/rated_ingredients.json").map((r: { unii: string }) => r.unii),
    ),
    templates: existsSync(resolve(ROOT, "data/templates.json"))
      ? json("data/templates.json")
      : {},
  };
}

const goldenPath = resolve(ROOT, "data/golden.json");
const vectors: Vector[] = existsSync(goldenPath)
  ? json("data/golden.json")
  : [];
const haveRepoData = existsSync(resolve(ROOT, "data/term_tables.json"));

describe("data/golden.json parity with scripts/score.py", () => {
  it("has vectors", () => expect(vectors.length).toBeGreaterThan(0));

  for (const v of vectors) {
    const run = v.tables === "repo" && !haveRepoData ? it.skip : it;
    run(`${v.ndc11} ${v.profile.persona} ${v.note ?? ""}`, () => {
      const d = dataset(v.tables);
      const product = d.products.find((p) => p.ndc11 === v.ndc11);
      if (!product)
        throw new Error(`product ${v.ndc11} missing from ${v.tables}`);
      const r = score(product, v.profile, d);
      if ("status" in v.expected) expect(r.status).toBe("unrated");
      else expect(r).toMatchObject({ status: "scored", ...v.expected });
    });
  }
});
