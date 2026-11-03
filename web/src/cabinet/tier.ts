import type { Tier } from "../types";

export const TIER_COLOR: Record<Tier, string> = {
  green: "var(--tier-green)",
  yellow: "var(--tier-orange)",
  red: "var(--tier-red)",
};
export const TIER_ICON: Record<Tier, string> = {
  green: "✓",
  yellow: "!",
  red: "✕",
};
export const TIER_WORD: Record<Tier, string> = {
  green: "Good fit",
  yellow: "Use caution",
  red: "Not advised",
};
