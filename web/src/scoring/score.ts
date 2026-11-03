// Nomi's scoring function (docs/system-design.md 6.2). Lookups and arithmetic only.
import type { Citation, Contribution, Dimension } from "@nomi/ts/index";
import type {
  AppData,
  Condition,
  MedicationType,
  Persona,
  Product,
  ScoreResult,
  TermTables,
  Tier,
  Unii,
  UserProfile,
} from "../types";

type Data = Pick<AppData, "termTables" | "rated" | "templates">;
type ProfileLike = Pick<
  UserProfile,
  "persona" | "conditions" | "medication_types"
>;

// The generated HardStop type is an open record; this is its schema shape.
type HardStopRule = {
  id: string;
  unii?: Unii;
  ndc11?: string;
  personas?: Persona[];
  condition?: Condition;
  medication_type?: MedicationType;
  message_template_id: string;
  citation_ids: string[];
};

export const FALLBACK_HARD_STOP =
  "Not recommended for this person (label or expert criteria).";

export function tierOf(score: number, bands: TermTables["tier_bands"]): Tier {
  return score >= bands.green_min
    ? "green"
    : score >= bands.yellow_min
      ? "yellow"
      : "red";
}

export function levelOf(points: number): "low" | "moderate" | "high" {
  return points < 15 ? "low" : points < 35 ? "moderate" : "high";
}

export function profileKey(p: ProfileLike): string {
  return `${p.persona}|${[...p.conditions].sort().join(",")}|${[...p.medication_types].sort().join(",")}`;
}

export function combine(values: number[], c: TermTables["combine"]): number {
  const pos = values.filter((v) => v > 0).sort((a, b) => b - a);
  if (!pos.length) return 0;
  if (c.method === "sum") return pos.reduce((a, b) => a + b, 0);
  if (c.method === "max") return pos[0];
  return pos[0] + (c.stacking_points ?? 0) * (pos.length - 1);
}

export function score(
  product: Product,
  profile: ProfileLike,
  data: Data,
): ScoreResult {
  if (product.scope !== "in_scope") return { status: "unrated", missing: [] };
  const missing = product.ingredients
    .map((i) => i.unii)
    .filter((u) => !data.rated.has(u));
  if (missing.length) return { status: "unrated", missing };

  const { termTables: tt, templates } = data;
  const conds = new Set<string>(profile.conditions);
  const meds = new Set<string>(profile.medication_types);
  const cite = (ids: Iterable<string>): Citation[] => {
    const out: Citation[] = [];
    for (const id of new Set(ids))
      if (tt.citations[id]) out.push(tt.citations[id]);
    return out;
  };
  const fill = (tpl: string, name: string) =>
    tpl.replaceAll("{ingredient}", name);

  // dimension -> ingredient -> summed points (base + condition/medication rows) and citation ids
  const byDim = new Map<
    Dimension,
    Map<Unii, { points: number; cites: string[] }>
  >();
  const active = new Set(product.ingredients.map((i) => i.unii));
  for (const t of tt.terms) {
    if (!active.has(t.unii) || t.persona !== profile.persona) continue;
    if (t.condition && !conds.has(t.condition)) continue;
    if (t.medication_type && !meds.has(t.medication_type)) continue;
    let ings = byDim.get(t.dimension);
    if (!ings) byDim.set(t.dimension, (ings = new Map()));
    const e = ings.get(t.unii) ?? { points: 0, cites: [] };
    e.points += t.points;
    e.cites.push(...t.citation_ids);
    ings.set(t.unii, e);
  }

  const nameOf = (u: Unii) =>
    product.ingredients.find((i) => i.unii === u)?.name ?? u;
  const contributions: Contribution[] = [...byDim]
    .map(([dimension, ings]) => {
      const contributing = [...ings].filter(([, e]) => e.points > 0);
      return {
        dimension,
        points: combine(
          contributing.map(([, e]) => e.points),
          tt.combine,
        ),
        ingredient_uniis: contributing.map(([u]) => u),
        citations: cite(
          contributing.flatMap(([, e]) => e.cites),
        ) as Contribution["citations"],
      };
    })
    .filter((c) => c.points > 0)
    .sort((a, b) => b.points - a.points);

  const hardStops: Array<{
    id: string;
    message: string;
    template_id: string;
    citations: Citation[];
  }> = [];
  for (const h of tt.hard_stops as HardStopRule[]) {
    const hit =
      h.unii && active.has(h.unii)
        ? nameOf(h.unii)
        : h.ndc11 === product.ndc11
          ? product.brand_name
          : null;
    if (hit === null) continue;
    if (h.personas && !h.personas.includes(profile.persona)) continue;
    if (h.condition && !conds.has(h.condition)) continue;
    if (h.medication_type && !meds.has(h.medication_type)) continue;
    const tpl = templates[h.message_template_id];
    hardStops.push({
      id: h.id,
      message: tpl ? fill(tpl, hit) : FALLBACK_HARD_STOP,
      template_id: h.message_template_id,
      citations: cite(h.citation_ids),
    });
  }

  const total = Math.max(
    0,
    Math.min(
      100,
      tt.base_score - contributions.reduce((s, c) => s + c.points, 0),
    ),
  );
  const explanation = [
    ...hardStops.map((h) => ({
      template_id: h.template_id,
      text: h.message,
      citations: h.citations,
    })),
    ...contributions.map((c) => {
      const template_id = `${c.dimension}_${levelOf(c.points)}`;
      const names = (c.ingredient_uniis ?? []).map(nameOf).join(" and ");
      const tpl = templates[template_id];
      return {
        template_id,
        text: tpl
          ? fill(tpl, names)
          : `${names} adds ${c.dimension.replaceAll("_", " ")} risk for this person.`,
        citations: c.citations,
      };
    }),
  ];

  return {
    status: "scored",
    score: total,
    tier: hardStops.length ? "red" : tierOf(total, tt.tier_bands),
    contributions,
    hard_stops_triggered: hardStops.map(({ id, message }) => ({ id, message })),
    explanation,
  };
}
