// App settings. localStorage only. largeText also drives --text-scale and the "large-text" class on <html>.
import { useSyncExternalStore } from "react";
import { persisted } from "./persist";

export interface Settings {
  largeText: boolean;
  showHud: boolean;
  sound: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  largeText: false,
  showHud: false,
  sound: true,
};

const store = persisted<Settings>(
  "nomifier.settings.v1",
  DEFAULT_SETTINGS,
  (raw) => {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<
      string,
      unknown
    >;
    const b = (k: keyof Settings) =>
      typeof r[k] === "boolean" ? (r[k] as boolean) : DEFAULT_SETTINGS[k];
    return {
      largeText: b("largeText"),
      showHud: b("showHud"),
      sound: b("sound"),
    };
  },
);

export function applySettings(s: Settings) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.style.setProperty("--text-scale", s.largeText ? "1.3" : "1");
  el.classList.toggle("large-text", s.largeText);
}
applySettings(store.get());

export function setSetting<K extends keyof Settings>(k: K, v: Settings[K]) {
  const next = { ...store.get(), [k]: v };
  store.set(next);
  applySettings(next);
}

export function useSettings() {
  const settings = useSyncExternalStore(store.subscribe, store.get);
  return { ...settings, set: setSetting };
}
