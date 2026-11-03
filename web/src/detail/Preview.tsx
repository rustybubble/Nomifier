import { useMemo, useState } from "react";
import { useData } from "../data/DataProvider";
import type { Persona, UserProfile } from "../types";
import DetailSheet from "./DetailSheet";

const PROFILES: Record<string, UserProfile> = {
  "65+ hypertension": {
    id: "a",
    name: "Mom",
    persona: "adult_65_plus",
    conditions: ["hypertension"],
    medication_types: [],
  },
  "65+": {
    id: "b",
    name: "Dad",
    persona: "adult_65_plus" as Persona,
    conditions: [],
    medication_types: [],
  },
  "18-64": {
    id: "c",
    name: "Me",
    persona: "adult_18_64",
    conditions: [],
    medication_types: [],
  },
};

/** Dev preview of DetailSheet; mount with `?preview=detail`. */
export default function Preview() {
  const { data, error } = useData();
  const [pick, setPick] = useState(() => new URLSearchParams(location.search).get("pick") ?? "");
  const [prof, setProf] = useState(() => new URLSearchParams(location.search).get("profile") ?? "65+ hypertension");
  const [open, setOpen] = useState(true);
  const [cab, setCab] = useState(false);
  const options = useMemo(
    () => [
      ...(data?.products.map((p) => `p:${p.ndc11}`) ?? []),
      ...Object.keys(data?.families ?? {}).map((f) => `f:${f}`),
      "unknown",
    ],
    [data],
  );
  if (error) return <p>{error.message}</p>;
  if (!data) return <p>Loading…</p>;

  const sel = pick || options[0]!;
  const target = sel.startsWith("p:")
    ? { kind: "product" as const, product: data.productsByNdc.get(sel.slice(2))! }
    : sel.startsWith("f:")
      ? {
          kind: "family" as const,
          family: sel.slice(2),
          members: data.families[sel.slice(2)]!.map((n) => data.productsByNdc.get(n)!),
        }
      : { kind: "unknown" as const, trackId: 7 };
  const cabinet = [data.productsByNdc.get("99999000606")!];

  return (
    <div style={{ padding: 16 }}>
      <select value={sel} onChange={(e) => { setPick(e.target.value); setOpen(true); }}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>{" "}
      <select value={prof} onChange={(e) => setProf(e.target.value)}>
        {Object.keys(PROFILES).map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>{" "}
      <button onClick={() => setOpen(true)}>Open</button>
      <DetailSheet
        open={open}
        onClose={() => setOpen(false)}
        target={target}
        profile={PROFILES[prof]!}
        data={data}
        cabinet={cabinet}
        inView={new Set(["99999000505"])}
        inCabinet={cab}
        onAddToCabinet={() => setCab(true)}
        onRemoveFromCabinet={() => setCab(false)}
        onCompare={(p) => console.log("compare", p.ndc11)}
        onFindNearby={(p) => console.log("nearby", p.ndc11)}
        onSendToClerk={(id) => console.log("clerk", id)}
      />
    </div>
  );
}
