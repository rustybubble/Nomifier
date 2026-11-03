// Track -> outline style, using on-device scoring. Profile stays in memory; nothing here touches the network.
import type { AppData, Product, Track, UserProfile } from "../types";
import { scoreMemo } from "../scoring/memo";
import { sharedIngredients } from "../scoring/alternatives";
import { COLORS, TIER_ICON, defaultStyleFor, type TrackStyle } from "./overlay";

const TIER_COLOR = {
  green: COLORS.green,
  yellow: COLORS.orange,
  red: COLORS.red,
} as const;

export interface StyleContext {
  data: AppData;
  profile: UserProfile;
  cabinet?: Product[];
  useFilter?: string | null; // "I need…" chip; products without this use are dimmed
}

/** "tylenol-line" -> "Tylenol line" */
export function familyName(id: string): string {
  const s = id.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function makeStyleFor(ctx: StyleContext): (t: Track) => TrackStyle {
  const { data, profile, cabinet = [], useFilter } = ctx;
  return (t) => {
    if (t.status === "family" && t.family) {
      return {
        ...defaultStyleFor(t),
        label: `${familyName(t.family)}: turn to show the barcode`,
      };
    }
    if (t.status !== "named" || !t.product_id) return defaultStyleFor(t);

    const product = data.productsByNdc.get(t.product_id);
    if (!product)
      return {
        color: COLORS.gray,
        lineWidth: 1.5,
        label: "Not in our data yet",
      };

    const dim = !!useFilter && !product.uses.includes(useFilter);
    const r = scoreMemo(product, profile, data);
    if (r.status === "unrated")
      return {
        color: COLORS.gray,
        lineWidth: 1.5,
        label: "Not rated yet",
        dim,
      };

    const chips: string[] = [];
    const label = data.labelStatus[product.ndc11];
    if (label?.status === "recall") chips.push("⚠ Recall");
    else if (label?.status === "label_updated") chips.push("⚠ Label updated");
    for (const s of sharedIngredients(product, cabinet))
      chips.push(`Also ${s.name}`);

    return {
      color: TIER_COLOR[r.tier],
      lineWidth: 4,
      badge: { text: String(r.score), icon: TIER_ICON[r.tier] },
      chips: chips.length ? [...new Set(chips)] : undefined,
      dim,
    };
  };
}
