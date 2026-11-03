// Last 50 viewed products with the tier for the profile at the time. localStorage only.
import { useSyncExternalStore } from "react";
import type { Tier } from "../types";
import { persisted } from "../settings/persist";

export interface HistoryEntry {
  ndc11: string;
  at: string; // ISO
  score: number | null;
  tier: Tier | null;
  profileName: string;
}

export const HISTORY_MAX = 50;
export const DEDUPE_MS = 60_000;

const store = persisted<HistoryEntry[]>("nomifier.history.v1", [], (raw) =>
  Array.isArray(raw)
    ? raw
        .filter(
          (x): x is HistoryEntry =>
            !!x && typeof x.ndc11 === "string" && typeof x.at === "string",
        )
        .slice(0, HISTORY_MAX)
    : [],
);

/** Newest first. Skips a repeat of the newest entry's ndc11 within 60 s. */
export function recordView(
  e: Omit<HistoryEntry, "at">,
  now: Date = new Date(),
) {
  const list = store.get();
  const last = list[0];
  if (
    last &&
    last.ndc11 === e.ndc11 &&
    now.getTime() - Date.parse(last.at) < DEDUPE_MS
  )
    return;
  store.set([{ ...e, at: now.toISOString() }, ...list].slice(0, HISTORY_MAX));
}

export const clearHistory = () => store.set([]);

export function useHistory() {
  const entries = useSyncExternalStore(store.subscribe, store.get);
  return { entries, clear: clearHistory, recordView };
}

export function relativeTime(iso: string, now: Date = new Date()): string {
  const s = Math.max(0, (now.getTime() - Date.parse(iso)) / 1000);
  if (s < 45) return "Just now";
  const plural = (n: number, u: string) => `${n} ${u}${n === 1 ? "" : "s"} ago`;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return plural(Math.round(s / 3600), "hour");
  return plural(Math.round(s / 86400), "day");
}
