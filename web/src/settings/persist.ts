// Tiny localStorage-backed store shared by cabinet/history/settings. Never touches the network.
// Storage missing or throwing (private mode, node tests) falls back to memory.
export function persisted<T>(
  key: string,
  initial: T,
  clean: (raw: unknown) => T,
) {
  let state: T = initial;
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) state = clean(JSON.parse(raw));
  } catch {
    /* no storage or bad JSON: keep initial */
  }
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next: T) {
      state = next;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* keep in memory */
      }
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}
