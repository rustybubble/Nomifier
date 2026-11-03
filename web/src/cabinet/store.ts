// Medicine cabinet: products the user takes. localStorage only.
import { useSyncExternalStore } from "react";
import type { AppData, Product } from "../types";
import { persisted } from "../settings/persist";

export interface CabinetItem {
  ndc11: string;
  added: string; // ISO
}

const store = persisted<CabinetItem[]>("nomifier.cabinet.v1", [], (raw) =>
  Array.isArray(raw)
    ? raw.filter(
        (x): x is CabinetItem =>
          !!x && typeof x.ndc11 === "string" && typeof x.added === "string",
      )
    : [],
);

export const addToCabinet = (ndc11: string) => {
  if (!store.get().some((i) => i.ndc11 === ndc11))
    store.set([...store.get(), { ndc11, added: new Date().toISOString() }]);
};
export const removeFromCabinet = (ndc11: string) =>
  store.set(store.get().filter((i) => i.ndc11 !== ndc11));

export function useCabinet() {
  const items = useSyncExternalStore(store.subscribe, store.get);
  return {
    items,
    has: (ndc11: string) => items.some((i) => i.ndc11 === ndc11),
    add: addToCabinet,
    remove: removeFromCabinet,
  };
}

/** Cabinet items resolved to products; unknown ndc11s are skipped. */
export function cabinetProducts(
  items: CabinetItem[],
  data: Pick<AppData, "productsByNdc">,
): Product[] {
  return items.flatMap((i) => data.productsByNdc.get(i.ndc11) ?? []);
}
