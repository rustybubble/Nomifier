// Generated from packages/schema/schemas by scripts/codegen-ts.mjs. Do not edit.

/**
 * National Drug Code normalized to 11 digits with no hyphens, e.g. 50580044902.
 */
export type Ndc11 = string;
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
 * Color band shown with a score.
 */
export type Tier = "green" | "yellow" | "red";
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
 * FDA Unique Ingredient Identifier: 10 uppercase letters or digits, e.g. 362O9ITL9D (acetaminophen).
 */
export type Unii = string;
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
 * How much human review a value has had.
 */
export type ReviewStatus = "unreviewed" | "preliminary" | "sampled_ok" | "pharmacist_reviewed";

/**
 * The result of scoring one product for one profile: what the result screen shows and what golden vectors check (NOMI-051, NOMI-057, NOMI-060).
 */
export interface ScoreRecord {
  ndc11: Ndc11;
  profile: Profile;
  /**
   * Safety score from 0 (highest risk) to 100.
   */
  score: number;
  tier: Tier;
  /**
   * Points taken off per dimension, largest first.
   */
  contributions: Contribution[];
  /**
   * Hard-stop rules that fired. Any entry makes the tier red.
   */
  hard_stops_triggered: TriggeredHardStop[];
  /**
   * Rank among products with the same use for this profile. Null when there are too few comparable products.
   */
  benchmark: Benchmark | null;
  /**
   * Safer options with a shared use, best first. Empty means 'ask your pharmacist'.
   */
  alternatives: Alternative[];
  /**
   * Plain-language sentences, each with its sources.
   */
  explanation: ExplanationLine[];
  review_status: ReviewStatus;
  provenance: Provenance;
}
/**
 * Who the score is for. Lives only on the user's device.
 *
 * This interface was referenced by `ScoreRecord`'s JSON-Schema
 * via the `definition` "profile".
 */
export interface Profile {
  persona: Persona;
  conditions: Condition[];
  medication_types: MedicationType[];
}
/**
 * Points one dimension took off the score, and why.
 *
 * This interface was referenced by `ScoreRecord`'s JSON-Schema
 * via the `definition` "contribution".
 */
export interface Contribution {
  dimension: Dimension;
  /**
   * Points taken off on this dimension.
   */
  points: number;
  /**
   * Ingredients that contributed.
   */
  ingredient_uniis?: Unii[];
  /**
   * @minItems 1
   */
  citations: [Citation, ...Citation[]];
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
 * This interface was referenced by `ScoreRecord`'s JSON-Schema
 * via the `definition` "triggered_hard_stop".
 */
export interface TriggeredHardStop {
  /**
   * Hard-stop rule id from the term tables.
   */
  id: string;
  /**
   * Rendered message shown to the user.
   */
  message: string;
}
/**
 * This interface was referenced by `ScoreRecord`'s JSON-Schema
 * via the `definition` "benchmark".
 */
export interface Benchmark {
  /**
   * Use the product is compared within, e.g. 'pain'.
   */
  use: string;
  /**
   * Share of comparable products this one scores better than, 0 to 100.
   */
  percentile: number;
}
/**
 * This interface was referenced by `ScoreRecord`'s JSON-Schema
 * via the `definition` "alternative".
 */
export interface Alternative {
  ndc11: Ndc11;
  /**
   * The alternative's score for the same profile.
   */
  score: number;
  /**
   * Use both products share, e.g. 'pain'.
   */
  shared_use: string;
  /**
   * One-line reason it's safer for this profile.
   */
  reason: string;
}
/**
 * This interface was referenced by `ScoreRecord`'s JSON-Schema
 * via the `definition` "explanation_line".
 */
export interface ExplanationLine {
  /**
   * Template the sentence was built from.
   */
  template_id: string;
  /**
   * Rendered sentence.
   */
  text: string;
  citations: Citation[];
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
