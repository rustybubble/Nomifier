import type { Product, Questions, ScoreResult } from "../types";

/** Questions to ask a pharmacist, one set per risk dimension, ingredient names filled in. Max 5. */
export function pharmacistQuestions(
  result: ScoreResult,
  product: Product,
  questions: Questions,
  max = 5,
): string[] {
  if (result.status !== "scored") return [];
  const nameOf = (u: string) =>
    product.ingredients.find((i) => i.unii === u)?.name ?? u;
  const out = new Set<string>();
  for (const c of result.contributions) {
    const names =
      (c.ingredient_uniis ?? []).map(nameOf).join(" and ") ||
      product.generic_name;
    for (const q of questions[c.dimension] ?? [])
      out.add(q.replaceAll("{ingredient}", names));
  }
  return [...out].slice(0, max);
}
