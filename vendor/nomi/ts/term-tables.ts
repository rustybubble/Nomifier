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
 * Type of person a score is for. The list is owned by docs/scoring/dimensions.md (NOMI-016).
 */
export type Persona =
  | "adult_18_64"
  | "adult_65_plus"
  | "teen_12_17"
  | "child_6_11"
  | "child_2_5"
  | "under_2"
  | "pregnant"
  | "breastfeeding";
/**
 * Health condition a user can add to their profile. The list is owned by docs/scoring/dimensions.md (NOMI-016).
 */
export type Condition =
  | "hypertension"
  | "heart_disease"
  | "kidney_disease"
  | "liver_disease"
  | "stomach_ulcer_or_bleeding"
  | "glaucoma"
  | "enlarged_prostate"
  | "asthma"
  | "diabetes"
  | "thyroid_disease"
  | "phenylketonuria"
  | "heavy_alcohol_use";
/**
 * Type of medication a user already takes. The list is owned by docs/scoring/dimensions.md (NOMI-016).
 */
export type MedicationType =
  | "anticoagulants"
  | "antiplatelets"
  | "maoi"
  | "ssri_snri"
  | "sedatives"
  | "diuretics"
  | "blood_pressure_medications"
  | "corticosteroids";
/**
 * Key into a citations map, e.g. cit_acetaminophen_liver_warning.
 */
export type CitationId = string;
/**
 * A rule that forces the result tier. Targets either an ingredient (every product containing it) or one product (for label rules like age limits that differ between products with the same ingredient). Matches when the profile matches every given field.
 *
 * This interface was referenced by `TermTables`'s JSON-Schema
 * via the `definition` "hard_stop".
 */
export type HardStop = {
  [k: string]: unknown;
};
/**
 * Kind of source a value comes from.
 */
export type CitationSource =
  | "fda_label"
  | "otc_monograph"
  | "stopp_start"
  | "acb"
  | "faers"
  | "publication"
  | "pharmacist_review";

/**
 * The scoring model exported as lookup tables. The phone adds up matching term points for a product and profile, applies hard stops, and computes score = base_score - points (NOMI-051, NOMI-060).
 */
export interface TermTables {
  /**
   * Version of the exported model, e.g. 'rubric-v0.1'.
   */
  model_version: string;
  /**
   * Version of docs/rubric this export implements, e.g. 'v0'.
   */
  rubric_version: string;
  /**
   * Score before any points are taken off. Normally 100.
   */
  base_score: number;
  tier_bands: TierBands;
  combine: Combine;
  /**
   * Points per ingredient, dimension and persona, plus extra points for conditions and medication types.
   */
  terms: Term[];
  /**
   * Rules that make a product red regardless of points.
   */
  hard_stops: HardStop[];
  citations: CitationMap;
  provenance?: Provenance;
}
/**
 * Score thresholds for each tier. Below yellow_min is red.
 *
 * This interface was referenced by `TermTables`'s JSON-Schema
 * via the `definition` "tier_bands".
 */
export interface TierBands {
  /**
   * Lowest score shown as green, e.g. 75.
   */
  green_min: number;
  /**
   * Lowest score shown as yellow, e.g. 50.
   */
  yellow_min: number;
}
/**
 * How points from several ingredients in one product combine within a dimension.
 *
 * This interface was referenced by `TermTables`'s JSON-Schema
 * via the `definition` "combine".
 */
export interface Combine {
  /**
   * 'max' takes the largest ingredient's points; 'max_plus_stacking' adds stacking_points for each extra ingredient that scores on the same dimension; 'sum' adds all.
   */
  method: "max" | "max_plus_stacking" | "sum";
  /**
   * Extra points per additional ingredient on the same dimension, for max_plus_stacking.
   */
  stacking_points?: number;
}
/**
 * Points taken off for one ingredient on one dimension for one persona. A row with a condition or medication_type applies only when the profile has it, on top of the base row.
 *
 * This interface was referenced by `TermTables`'s JSON-Schema
 * via the `definition` "term".
 */
export interface Term {
  unii: Unii;
  dimension: Dimension;
  persona: Persona;
  condition?: Condition;
  medication_type?: MedicationType;
  /**
   * Points taken off. Rows with 0 points are not exported.
   */
  points: number;
  /**
   * Keys into the citations map.
   *
   * @minItems 1
   */
  citation_ids: [CitationId, ...CitationId[]];
}
/**
 * Citations keyed by citation id, so rows can reference them without repeating them.
 */
export interface CitationMap {
  [k: string]: Citation;
}
/**
 * Where a value comes from, specific enough that a pharmacist can check it.
 */
export interface Citation {
  source: CitationSource;
  /**
   * Identifier of the document, e.g. an SPL set id, a monograph id, or a DOI.
   */
  document_id: string;
  /**
   * Section within the document, e.g. 'Warnings' or 'Table 2'.
   */
  section?: string;
  /**
   * Link to the source.
   */
  url?: string;
  /**
   * Short exact quote supporting the value.
   */
  quote?: string;
}
/**
 * Which data and code produced a file or record.
 */
export interface Provenance {
  /**
   * Version of these contracts the data was written with (semver). A major bump means old readers can't read it.
   */
  schema_version: string;
  /**
   * Dataset release, e.g. 2026.11.0.
   */
  dataset_version: string;
  /**
   * Rubric or model version used for scoring, e.g. rubric-v0.1.
   */
  rubric_version: string;
  /**
   * Git commit of the pipeline code.
   */
  code_commit: string;
  /**
   * When the file or record was produced.
   */
  generated_at: string;
}
