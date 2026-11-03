import type { AppData, Product, Tier, UserProfile } from "../types";
import { score } from "./score";

export interface Alternative {
  ndc11: string;
  score: number;
  tier: Tier;
  shared_use: string;
  inView: boolean;
}

export function alternatives(
  product: Product,
  profile: UserProfile,
  data: AppData,
  inView: Set<string> = new Set(),
): Alternative[] {
  const mine = score(product, profile, data);
  const floor = (mine.status === "scored" ? mine.score : 0) + 10;
  const out: Alternative[] = [];
  for (const p of data.products) {
    if (p.ndc11 === product.ndc11) continue;
    const shared_use = p.uses.find((u) => product.uses.includes(u));
    if (!shared_use) continue;
    const r = score(p, profile, data);
    if (
      r.status !== "scored" ||
      r.hard_stops_triggered.length ||
      r.score < floor
    )
      continue;
    out.push({
      ndc11: p.ndc11,
      score: r.score,
      tier: r.tier,
      shared_use,
      inView: inView.has(p.ndc11),
    });
  }
  return out.sort(
    (a, b) => Number(b.inView) - Number(a.inView) || b.score - a.score,
  );
}

/** Medicine Cabinet duplicate check: active ingredients this product shares with others. */
export function sharedIngredients(
  product: Product,
  others: Product[],
): Array<{ unii: string; name: string; with: Product }> {
  const out: Array<{ unii: string; name: string; with: Product }> = [];
  for (const o of others) {
    if (o.ndc11 === product.ndc11) continue;
    for (const i of product.ingredients) {
      if (o.ingredients.some((x) => x.unii === i.unii))
        out.push({ unii: i.unii, name: i.name, with: o });
    }
  }
  return out;
}
