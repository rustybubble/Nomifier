// Generated from packages/schema/schemas by scripts/codegen-ts.mjs. Do not edit.

/**
 * FDA Unique Ingredient Identifier: 10 uppercase letters or digits, e.g. 362O9ITL9D (acetaminophen).
 */
export type Unii = string;
/**
 * Risk dimension every ingredient is rated on. The list is owned by docs/scoring/dimensions.md (NOMI-016).
 */
export type Dimension =
  | "liver"
  | "gi_bleeding"
  | "cardiovascular_bp"
  | "kidney"
  | "anticholinergic_cognitive"
  | "sedation_falls"
  | "serotonergic_interactions"
  | "anticoagulant_bleeding"
  | "pediatric"
  | "rebound_overuse"
  | "pregnancy_lactation"
  | "duplicate_dosing"
  | "excipients"
  | "local_skin"
  | "efficacy_evidence";

/**
 * One row of FAERS disproportionality evidence for an ingredient on a risk dimension, within an age band and sex (NOMI-053). IC025 above 0 counts as a signal.
 */
export interface Signal {
  unii: Unii;
  dimension: Dimension;
  /**
   * MedDRA event group behind the dimension, e.g. 'hepatic_disorders'.
   */
  event_group?: string;
  /**
   * Patient age band in years. 'all' is the unstratified total.
   */
  age_band: "0-11" | "12-17" | "18-64" | "65+" | "all";
  /**
   * Patient sex as reported. 'all' is the unstratified total.
   */
  sex: "F" | "M" | "all";
  /**
   * Information component: log2((observed + 0.5) / (expected + 0.5)).
   */
  ic: number;
  /**
   * Lower end of the 95% credibility interval for IC.
   */
  ic025: number;
  /**
   * Reports with both the ingredient and the event group (observed).
   */
  report_count: number;
  /**
   * Reports expected if ingredient and event were unrelated.
   */
  expected_count?: number;
}
