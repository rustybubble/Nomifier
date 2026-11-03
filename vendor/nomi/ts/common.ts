// Generated from packages/schema/schemas by scripts/codegen-ts.mjs. Do not edit.

/**
 * National Drug Code normalized to 11 digits with no hyphens, e.g. 50580044902.
 *
 * This interface was referenced by `Common`'s JSON-Schema
 * via the `definition` "ndc11".
 */
export type Ndc11 = string;
/**
 * FDA Unique Ingredient Identifier: 10 uppercase letters or digits, e.g. 362O9ITL9D (acetaminophen).
 *
 * This interface was referenced by `Common`'s JSON-Schema
 * via the `definition` "unii".
 */
export type Unii = string;
/**
 * Type of person a score is for. The list is owned by docs/scoring/dimensions.md (NOMI-016).
 *
 * This interface was referenced by `Common`'s JSON-Schema
 * via the `definition` "persona".
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
 * Risk dimension every ingredient is rated on. The list is owned by docs/scoring/dimensions.md (NOMI-016).
 *
 * This interface was referenced by `Common`'s JSON-Schema
 * via the `definition` "dimension".
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
 * Health condition a user can add to their profile. The list is owned by docs/scoring/dimensions.md (NOMI-016).
 *
 * This interface was referenced by `Common`'s JSON-Schema
 * via the `definition` "condition".
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
 *
 * This interface was referenced by `Common`'s JSON-Schema
 * via the `definition` "medication_type".
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
 * Risk severity of one ingredient on one dimension for one persona: 0 none, 1 low, 2 moderate, 3 high.
 *
 * This interface was referenced by `Common`'s JSON-Schema
 * via the `definition` "severity".
 */
export type Severity = number;
/**
 * Color band shown with a score.
 *
 * This interface was referenced by `Common`'s JSON-Schema
 * via the `definition` "tier".
 */
export type Tier = "green" | "yellow" | "red";
/**
 * How much human review a value has had.
 *
 * This interface was referenced by `Common`'s JSON-Schema
 * via the `definition` "review_status".
 */
export type ReviewStatus = "unreviewed" | "preliminary" | "sampled_ok" | "pharmacist_reviewed";
/**
 * Kind of source a value comes from.
 *
 * This interface was referenced by `Common`'s JSON-Schema
 * via the `definition` "citation_source".
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
 * Key into a citations map, e.g. cit_acetaminophen_liver_warning.
 *
 * This interface was referenced by `Common`'s JSON-Schema
 * via the `definition` "citation_id".
 */
export type CitationId = string;

/**
 * Shared definitions used by every Nomi schema.
 */
export interface Common {
  [k: string]: unknown;
}
/**
 * Where a value comes from, specific enough that a pharmacist can check it.
 *
 * This interface was referenced by `Common`'s JSON-Schema
 * via the `definition` "citation".
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
 * Citations keyed by citation id, so rows can reference them without repeating them.
 *
 * This interface was referenced by `Common`'s JSON-Schema
 * via the `definition` "citation_map".
 */
export interface CitationMap {
  [k: string]: Citation;
}
/**
 * Which data and code produced a file or record.
 *
 * This interface was referenced by `Common`'s JSON-Schema
 * via the `definition` "provenance".
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
