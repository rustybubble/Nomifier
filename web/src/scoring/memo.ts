import type { AppData, Product, ScoreResult, UserProfile } from "../types";
import { profileKey, score } from "./score";

// Cache keyed by `${ndc11}|${profileKey}`; dropped whenever a different AppData object arrives.
let cache = new Map<string, ScoreResult>();
let forData: AppData | null = null;

export function scoreMemo(
  product: Product,
  profile: UserProfile,
  data: AppData,
): ScoreResult {
  if (forData !== data) {
    cache = new Map();
    forData = data;
  }
  const key = `${product.ndc11}|${profileKey(profile)}`;
  let r = cache.get(key);
  if (!r) cache.set(key, (r = score(product, profile, data)));
  return r;
}
