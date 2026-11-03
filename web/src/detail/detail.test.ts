/// <reference types="node" />
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scoreMemo } from "../scoring/memo";
import type { AppData, Product, UserProfile } from "../types";
import { citationLabel, dailyMedUrl } from "./citation";
import { pharmacistQuestions } from "./questions";
import { buildSpeech } from "./readAloud";

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
const p = (s: string) => data.productsByNdc.get(`99999000${s}`)!;
const prof: UserProfile = {
  id: "t",
  name: "t",
  persona: "adult_65_plus",
  conditions: ["hypertension"],
  medication_types: [],
};
const profText = "a 65+ adult with high blood pressure";

describe("pharmacistQuestions", () => {
  const r = scoreMemo(p("303"), prof, data);
  it("fills ingredient names, one per dimension, max 5", () => {
    const qs = pharmacistQuestions(r, p("303"), data.questions);
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.length).toBeLessThanOrEqual(5);
    expect(qs.some((q) => q.includes("DEVIBUPROF") || /ibuprofen/i.test(q))).toBe(true);
    expect(qs.join()).not.toContain("{ingredient}");
  });
  it("dedupes and limits", () => {
    const dup = { liver: ["Q {ingredient}"], kidney: ["Q {ingredient}"] };
    const c = (dimension: string) => ({
      dimension,
      points: 10,
      ingredient_uniis: ["362O9ITL9D"],
      citations: [],
    });
    const fake = {
      status: "scored",
      score: 1,
      tier: "red",
      contributions: [c("liver"), c("kidney")],
      hard_stops_triggered: [],
      explanation: [],
    } as never;
    expect(pharmacistQuestions(fake, p("101"), dup)).toEqual(["Q acetaminophen"]);
    const many = { liver: ["a", "b", "c", "d", "e", "f", "g"] };
    expect(pharmacistQuestions(fake, p("101"), many)).toHaveLength(5);
  });
  it("is empty for unrated", () => {
    expect(
      pharmacistQuestions(scoreMemo(p("707"), prof, data), p("707"), data.questions),
    ).toEqual([]);
  });
});

describe("buildSpeech", () => {
  it("scored", () => {
    const s = buildSpeech(p("303"), scoreMemo(p("303"), prof, data), profText);
    expect(s).toContain("DEV Ibuprofen 200. Avoid, score 20, for a 65+ adult with high blood pressure.");
    expect(s).toMatch(/stomach bleeding/);
  });
  it("unrated", () => {
    expect(buildSpeech(p("707"), scoreMemo(p("707"), prof, data), profText)).toBe(
      "DEV Mystery Remedy. Not rated yet. Ask your pharmacist.",
    );
  });
});

describe("citation helpers", () => {
  const base = { document_id: "abc-123", section: "Warnings" };
  it("maps sources to plain words", () => {
    expect(citationLabel({ ...base, source: "fda_label" })).toBe("FDA label, Warnings");
    expect(citationLabel({ source: "acb", document_id: "x" })).toBe("ACB scale");
    expect(citationLabel({ source: "stopp_start", document_id: "x" })).toBe("STOPP/START criteria");
    expect(citationLabel({ source: "publication", document_id: "x" })).toBe("Published study");
  });
  it("builds DailyMed links for fda_label only, skipping the dev fixture", () => {
    expect(dailyMedUrl({ ...base, source: "fda_label" })).toBe(
      "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=abc-123",
    );
    expect(dailyMedUrl({ source: "fda_label", document_id: "DEV-FIXTURE" })).toBeNull();
    expect(dailyMedUrl({ ...base, source: "acb" })).toBeNull();
  });
});
