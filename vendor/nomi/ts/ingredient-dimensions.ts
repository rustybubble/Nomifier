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
 * Risk severity of one ingredient on one dimension for one persona: 0 none, 1 low, 2 moderate, 3 high.
 */
export type Severity = number;
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
 * How much human review a value has had.
 */
export type ReviewStatus = "unreviewed" | "preliminary" | "sampled_ok" | "pharmacist_reviewed";

/**
 * Knowledge base entry for one ingredient: its severity on each risk dimension per persona, and how conditions or other medications change it. One file per ingredient in pipeline/knowledge/ingredients/ (NOMI-034, NOMI-035).
 */
export interface IngredientDimensions {
  unii: Unii;
  /**
   * Ingredient name, e.g. 'naproxen sodium'.
   */
  name: string;
  /**
   * Severity per dimension and persona. Write 0 explicitly where a dimension was considered and has no risk.
   *
   * @minItems 1
   */
  ratings: [Rating, ...Rating[]];
  /**
   * Adjustments that apply when the user has a condition or takes a type of medication.
   */
  modifiers: Modifier[];
  review_status?: ReviewStatus;
  /**
   * Free-text notes for reviewers. Never shown to users.
   */
  notes?: string;
}
/**
 * Severity of this ingredient on one dimension for one persona. A non-zero severity needs at least one citation.
 *
 * This interface was referenced by `IngredientDimensions`'s JSON-Schema
 * via the `definition` "rating".
 */
export interface Rating {
  dimension: Dimension;
  persona: Persona;
  severity: Severity;
  /**
   * Sources for this rating. Required when severity is above 0.
   */
  citations?: Citation[];
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
 * Severity change on one dimension when the user has a condition or takes a medication type. Exactly one of condition or medication_type. Always needs a citation.
 *
 * This interface was referenced by `IngredientDimensions`'s JSON-Schema
 * via the `definition` "modifier".
 */
export interface Modifier {
  dimension: Dimension;
  condition?: Condition;
  medication_type?: MedicationType;
  /**
   * Personas the modifier applies to. Omit to apply to all.
   */
  personas?: Persona[];
  /**
   * Change in severity, e.g. 1 means one level higher. Results are capped at 3.
   */
  severity_change: number;
  /**
   * Sources for this modifier.
   *
   * @minItems 1
   */
  citations: [Citation, ...Citation[]];
}
