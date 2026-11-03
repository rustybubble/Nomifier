/// <reference types="node" />
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PROFILE_SCOPE } from "../types";
import type {
  AppData,
  Condition,
  MedicationType,
  Persona,
  Product,
  TermTables,
  UserProfile,
} from "../types";
import { alternatives, sharedIngredients } from "./alternatives";
import { scoreMemo } from "./memo";
import { combine, profileKey, score } from "./score";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const FIX = path.resolve(process.cwd(), "../tools/fixtures");
const fx = (n: string) => read(path.join(FIX, n));

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
const byNdc = (suffix: string) => data.productsByNdc.get(`99999000${suffix}`)!;
const prof = (
  persona: Persona,
  conditions: Condition[] = [],
  medication_types: MedicationType[] = [],
): UserProfile => ({
  id: "t",
  name: "t",
  persona,
  conditions,
  medication_types,
});

describe("fixture expected table", () => {
  // [adult_18_64, adult_65_plus, adult_65_plus + hypertension]; "red" = hard stop, "unrated" = unrated
  const table: Record<string, Array<number | "hs" | "unrated">> = {
    "101": [92, 92, 92],
    "202": [84, "hs", "hs"],
    "303": [92, 40, 20],
    "404": [92, "hs", "hs"],
    "505": [100, 100, 100],
    "606": [84, 84, 64],
    "707": ["unrated", "unrated", "unrated"],
  };
  const tiers: Record<number, string> = {
    92: "green",
    40: "red",
    20: "red",
    84: "green",
    100: "green",
    64: "yellow",
  };
  const profiles = [
    prof("adult_18_64"),
    prof("adult_65_plus"),
    prof("adult_65_plus", ["hypertension"]),
  ];
  for (const [suffix, row] of Object.entries(table)) {
    row.forEach((exp, i) => {
      it(`${suffix} / profile ${i}`, () => {
        const r = score(byNdc(suffix), profiles[i], data);
        if (exp === "unrated") {
          expect(r.status).toBe("unrated");
          expect(r).not.toHaveProperty("tier");
        } else if (exp === "hs") {
          expect(r.status).toBe("scored");
          if (r.status !== "scored") return;
          expect(r.tier).toBe("red");
          expect(r.hard_stops_triggered[0].id).toBe(
            "hs_dev_first_gen_antihistamine_65_plus",
          );
          expect(r.hard_stops_triggered[0].message).toContain(
            "diphenhydramine",
          );
          expect(r.explanation[0].text).toBe(r.hard_stops_triggered[0].message);
        } else {
          expect(r.status).toBe("scored");
          if (r.status !== "scored") return;
          expect(r.score).toBe(exp);
          expect(r.tier).toBe(tiers[exp]);
          expect(r.hard_stops_triggered).toEqual([]);
          for (const c of r.contributions)
            expect(c.citations.length).toBeGreaterThan(0);
        }
      });
    });
  }

  it("contributions sorted desc with explanations", () => {
    const r = score(
      byNdc("303"),
      prof("adult_65_plus", ["hypertension"]),
      data,
    );
    if (r.status !== "scored") throw new Error("unrated");
    const pts = r.contributions.map((c) => c.points);
    expect(pts).toEqual([...pts].sort((a, b) => b - a));
    expect(r.explanation).toHaveLength(r.contributions.length);
    expect(r.explanation[0].template_id).toBe("gi_bleeding_high");
  });

  it("scope != in_scope is unrated with no missing", () => {
    expect(
      score({ ...byNdc("101"), scope: "homeopathic" }, profiles[0], data),
    ).toEqual({ status: "unrated", missing: [] });
  });

  it("unrated lists missing uniis", () => {
    expect(score(byNdc("707"), profiles[0], data)).toEqual({
      status: "unrated",
      missing: ["DEVUNRATED"],
    });
  });
});

describe("Nomi sample", () => {
  const S = path.resolve(process.cwd(), "../vendor/nomi/samples");
  const termTables: TermTables = read(path.join(S, "term-tables.json"));
  const product: Product = read(path.join(S, "product.json"));
  const d = {
    termTables,
    rated: new Set(termTables.terms.map((t) => t.unii)),
    templates: {},
  };
  const run = (persona: Persona, c: Condition[] = []) =>
    score(product, prof(persona, c), d);

  it("adult_18_64 -> 90 green", () => {
    expect(run("adult_18_64")).toMatchObject({ score: 90, tier: "green" });
  });
  it("liver_disease sums 10 + 15 -> 75 green", () => {
    expect(run("adult_18_64", ["liver_disease"])).toMatchObject({
      score: 75,
      tier: "green",
    });
  });
  it("under_2 red via unii hard stop (fallback message)", () => {
    const r = run("under_2");
    expect(r).toMatchObject({ tier: "red" });
    if (r.status === "scored") {
      expect(r.hard_stops_triggered.map((h) => h.id)).toEqual([
        "hs_acetaminophen_under_2",
      ]);
      expect(r.hard_stops_triggered[0].message).toBe(
        "Not recommended for this person (label or expert criteria).",
      );
    }
  });
  it("child_6_11 red via ndc11 hard stop", () => {
    const r = run("child_6_11");
    expect(r).toMatchObject({ tier: "red" });
    if (r.status === "scored")
      expect(r.hard_stops_triggered.map((h) => h.id)).toEqual([
        "hs_adult_acetaminophen_children",
      ]);
  });
});

describe("combine methods", () => {
  it("max", () => expect(combine([10, 20, 5], { method: "max" })).toBe(20));
  it("max_plus_stacking", () =>
    expect(
      combine([10, 20, 0], { method: "max_plus_stacking", stacking_points: 5 }),
    ).toBe(25));
  it("sum", () => expect(combine([10, 20, 5], { method: "sum" })).toBe(35));

  it("score() honors combine on a two-ingredient dimension", () => {
    const base = data.termTables;
    const two = byNdc("202"); // apap + diphenhydramine; make both hit liver
    const terms = [
      {
        unii: "362O9ITL9D",
        dimension: "liver",
        persona: "adult_18_64",
        points: 10,
        citation_ids: ["cit_dev_apap_liver"],
      },
      {
        unii: "DEVDIPHENH",
        dimension: "liver",
        persona: "adult_18_64",
        points: 20,
        citation_ids: ["cit_dev_acb"],
      },
    ] as TermTables["terms"];
    const run = (combineCfg: TermTables["combine"]) =>
      score(two, prof("adult_18_64"), {
        ...data,
        termTables: { ...base, terms, hard_stops: [], combine: combineCfg },
      });
    expect(run({ method: "max" })).toMatchObject({ score: 80 });
    expect(
      run({ method: "max_plus_stacking", stacking_points: 5 }),
    ).toMatchObject({ score: 75 });
    const s = run({ method: "sum" });
    expect(s).toMatchObject({ score: 70 });
    if (s.status === "scored")
      expect(s.contributions[0].citations).toHaveLength(2);
  });
});

describe("properties", () => {
  const subsets = (xs: Condition[]): Condition[][] => [
    [],
    ...xs.map((x) => [x]),
    ...xs.flatMap((a, i) => xs.slice(i + 1).map((b) => [a, b])),
  ];
  const all: UserProfile[] = [];
  for (const persona of PROFILE_SCOPE.personas)
    for (const cs of subsets(PROFILE_SCOPE.conditions))
      for (const ms of [[], ["anticoagulants"] as MedicationType[]])
        all.push(prof(persona, cs, ms));
  const rank = { red: 0, yellow: 1, green: 2 } as const;

  it("adding a condition or medication never raises the score or improves the tier", () => {
    let pairs = 0;
    for (const p of products)
      for (const base of all)
        for (const extra of all) {
          const sup =
            base.persona === extra.persona &&
            base.conditions.every((c) => extra.conditions.includes(c)) &&
            base.medication_types.every((m) =>
              extra.medication_types.includes(m),
            );
          if (!sup) continue;
          pairs++;
          const a = score(p, base, data);
          const b = score(p, extra, data);
          if (a.status === "unrated") {
            expect(b.status).toBe("unrated");
            continue;
          }
          if (b.status !== "scored") throw new Error("status changed");
          expect(b.score).toBeLessThanOrEqual(a.score);
          expect(rank[b.tier]).toBeLessThanOrEqual(rank[a.tier]);
        }
    expect(pairs).toBeGreaterThan(100);
  });

  it("unrated products never yield a tier", () => {
    for (const p of [
      byNdc("707"),
      { ...byNdc("101"), scope: "out_of_scope" as const },
    ])
      for (const pr of all)
        expect(score(p, pr, data)).not.toHaveProperty("tier");
  });

  it("profileKey is order-stable and memo returns same object", () => {
    expect(
      profileKey(prof("adult_65_plus", ["kidney_disease", "glaucoma"])),
    ).toBe(profileKey(prof("adult_65_plus", ["glaucoma", "kidney_disease"])));
    const p = prof("adult_65_plus");
    expect(scoreMemo(byNdc("303"), p, data)).toBe(
      scoreMemo(byNdc("303"), p, data),
    );
  });
});

describe("alternatives", () => {
  const p65 = prof("adult_65_plus");
  it("diphenhydramine allergy -> loratadine", () => {
    const alts = alternatives(byNdc("404"), p65, data);
    expect(alts.map((a) => a.ndc11)).toContain("99999000505");
    expect(alts.find((a) => a.ndc11 === "99999000505")).toMatchObject({
      shared_use: "allergy",
      score: 100,
      tier: "green",
    });
  });
  it("inView ordering; hard-stopped excluded", () => {
    // 202 for adult_18_64 (84): pain-sharing 101 (92) is only +8 -> excluded; use 303 at 65+ (40): 101 (92), 606 (84)
    const base = alternatives(byNdc("303"), p65, data);
    expect(base.map((a) => a.ndc11)).toEqual(["99999000101", "99999000606"]);
    expect(
      alternatives(byNdc("303"), p65, data, new Set(["99999000606"])).map(
        (a) => a.ndc11,
      ),
    ).toEqual(["99999000606", "99999000101"]);
    expect(base.map((a) => a.ndc11)).not.toContain("99999000202");
  });
  it("unrated product counts as 0", () => {
    expect(alternatives(byNdc("707"), p65, data)).toEqual([]); // no shared use
  });
  it("sharedIngredients finds acetaminophen between 101 and 606", () => {
    const r = sharedIngredients(byNdc("101"), [byNdc("606"), byNdc("303")]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ unii: "362O9ITL9D", name: "acetaminophen" });
    expect(r[0].with.ndc11).toBe("99999000606");
  });
});
