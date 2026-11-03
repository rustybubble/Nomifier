import type { ScoreResult } from "../types";

const NAMES: Record<string, string> = {
  liver: "Liver",
  gi_bleeding: "Stomach bleeding",
  cardiovascular_bp: "Blood pressure",
  kidney: "Kidneys",
  anticholinergic_cognitive: "Memory & confusion",
  sedation_falls: "Drowsiness & falls",
  anticoagulant_bleeding: "Bleeding with blood thinners",
  efficacy_evidence: "Evidence it works",
  serotonergic_interactions: "Drug interactions",
};

/** Plain-language name for a scoring dimension. */
export function dimensionName(d: string): string {
  return (
    NAMES[d] ??
    d
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

export interface CompareRow {
  dimension: string;
  name: string;
  a: number; // points lost
  b: number;
  worse: "a" | "b" | null;
}

/** Union of contributing dimensions, biggest loss first; `worse` is the side losing more points. */
export function compareRows(a: ScoreResult, b: ScoreResult): CompareRow[] {
  const pts = (r: ScoreResult) =>
    new Map(
      r.status === "scored"
        ? r.contributions.map((c) => [c.dimension as string, c.points])
        : [],
    );
  const pa = pts(a);
  const pb = pts(b);
  return [...new Set([...pa.keys(), ...pb.keys()])]
    .map((dimension) => {
      const x = pa.get(dimension) ?? 0;
      const y = pb.get(dimension) ?? 0;
      return {
        dimension,
        name: dimensionName(dimension),
        a: x,
        b: y,
        worse: x === y ? null : x > y ? ("a" as const) : ("b" as const),
      };
    })
    .sort((r, s) => Math.max(s.a, s.b) - Math.max(r.a, r.b));
}
