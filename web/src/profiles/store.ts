// On-device profiles. localStorage only; never touches the network.
import { useSyncExternalStore } from "react";
import { PROFILE_SCOPE } from "../types";
import type { Condition, MedicationType, Persona, UserProfile } from "../types";

const KEY = "nomifier.profiles.v1";

interface State {
  profiles: UserProfile[];
  activeId: string;
}

const DEFAULTS: State = {
  profiles: [
    {
      id: "me",
      name: "Me",
      persona: "adult_18_64",
      conditions: [],
      medication_types: [],
    },
    {
      id: "mom",
      name: "Mom",
      persona: "adult_65_plus",
      conditions: ["hypertension"],
      medication_types: [],
    },
  ],
  activeId: "me",
};

const PERSONA_WORDS: Record<string, string> = {
  adult_18_64: "an adult (18-64)",
  adult_65_plus: "a 65+ adult",
};
const CONDITION_WORDS: Record<string, string> = {
  hypertension: "high blood pressure",
  kidney_disease: "kidney disease",
  glaucoma: "glaucoma",
  enlarged_prostate: "an enlarged prostate",
};
const MED_WORDS: Record<string, string> = { anticoagulants: "blood thinners" };

export function describeProfile(
  p: Pick<UserProfile, "persona" | "conditions" | "medication_types">,
): string {
  const with_ = [
    ...p.conditions.map((c) => CONDITION_WORDS[c] ?? c),
    ...p.medication_types.map((m) => `taking ${MED_WORDS[m] ?? m}`),
  ];
  const who = PERSONA_WORDS[p.persona] ?? p.persona;
  return with_.length
    ? `${who} with ${with_.join(" and ")}`.replace("with taking", "taking")
    : who;
}

function clean(raw: unknown): UserProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.name !== "string") return null;
  if (!PROFILE_SCOPE.personas.includes(r.persona as Persona)) return null;
  const keep = <T extends string>(v: unknown, allowed: T[]): T[] =>
    Array.isArray(v) ? allowed.filter((a) => v.includes(a)) : [];
  return {
    id: r.id,
    name: r.name,
    persona: r.persona as Persona,
    conditions: keep<Condition>(r.conditions, PROFILE_SCOPE.conditions),
    medication_types: keep<MedicationType>(
      r.medication_types,
      PROFILE_SCOPE.medication_types,
    ),
  };
}

function load(): State {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as {
      profiles?: unknown[];
      activeId?: unknown;
    } | null;
    const profiles = (raw?.profiles ?? []).map(clean).filter((p) => p !== null);
    if (profiles.length) {
      const activeId = profiles.some((p) => p.id === raw?.activeId)
        ? (raw?.activeId as string)
        : profiles[0].id;
      return { profiles, activeId };
    }
  } catch {
    // no storage or bad JSON: fall through to defaults
  }
  return DEFAULTS;
}

let state: State = load();
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable: keep in memory
  }
  listeners.forEach((l) => l());
}

export const setActive = (id: string) => {
  if (state.profiles.some((p) => p.id === id)) set({ ...state, activeId: id });
};
export const upsert = (p: UserProfile) => {
  const c = clean(p);
  if (!c) return;
  const exists = state.profiles.some((x) => x.id === c.id);
  set({
    ...state,
    profiles: exists
      ? state.profiles.map((x) => (x.id === c.id ? c : x))
      : [...state.profiles, c],
  });
};
export const remove = (id: string) => {
  const profiles = state.profiles.filter((p) => p.id !== id);
  if (!profiles.length) return; // always keep at least one
  set({
    profiles,
    activeId: state.activeId === id ? profiles[0].id : state.activeId,
  });
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useProfiles() {
  const s = useSyncExternalStore(subscribe, () => state);
  const active = s.profiles.find((p) => p.id === s.activeId) ?? s.profiles[0];
  return { profiles: s.profiles, active, setActive, upsert, remove };
}
