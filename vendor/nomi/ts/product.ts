// Generated from packages/schema/schemas by scripts/codegen-ts.mjs. Do not edit.

/**
 * National Drug Code normalized to 11 digits with no hyphens, e.g. 50580044902.
 */
export type Ndc11 = string;
/**
 * FDA Unique Ingredient Identifier: 10 uppercase letters or digits, e.g. 362O9ITL9D (acetaminophen).
 */
export type Unii = string;
/**
 * How much human review a value has had.
 */
export type ReviewStatus = "unreviewed" | "preliminary" | "sampled_ok" | "pharmacist_reviewed";

/**
 * One OTC product package, identified by its NDC. Produced by the identity stage (NOMI-025, NOMI-026); read by scoring and the app.
 */
export interface Product {
  ndc11: Ndc11;
  /**
   * DailyMed label set id, stable across label versions.
   */
  spl_set_id: string;
  /**
   * DailyMed label version number.
   */
  spl_version: number;
  /**
   * Name on the box, e.g. 'Tylenol Extra Strength'.
   */
  brand_name: string;
  /**
   * Generic name of the active ingredients, e.g. 'acetaminophen'.
   */
  generic_name: string;
  /**
   * Company that markets the product.
   */
  labeler?: string;
  /**
   * Dosage form from the NDC directory, e.g. 'TABLET, COATED'.
   */
  dosage_form?: string;
  /**
   * How the product is legally sold, from the NDC directory.
   */
  marketing_category:
    | "otc_monograph_drug"
    | "otc_monograph_final"
    | "otc_monograph_not_final"
    | "nda"
    | "nda_authorized_generic"
    | "anda"
    | "bla"
    | "unapproved_homeopathic"
    | "unapproved_drug_other"
    | "other";
  /**
   * Our OTC grouping, e.g. 'internal_analgesics' or 'antacids' (values assigned in NOMI-026). Null for out-of-scope products.
   */
  otc_category: string | null;
  /**
   * Consumer uses from the label, e.g. ['pain', 'fever'] (taxonomy in NOMI-047).
   */
  uses: string[];
  /**
   * Whether Nomi scores this product. Homeopathic products are shown but not scored.
   */
  scope: "in_scope" | "homeopathic" | "out_of_scope";
  /**
   * Active ingredients with strengths.
   *
   * @minItems 1
   */
  ingredients: [ActiveIngredient, ...ActiveIngredient[]];
  /**
   * Inactive ingredients, used for allergen and excipient checks.
   */
  inactive_ingredients?: InactiveIngredient[];
  review_status?: ReviewStatus;
}
/**
 * One active ingredient and its strength, e.g. 500 mg, or 650 mg per 30 mL for liquids.
 *
 * This interface was referenced by `Product`'s JSON-Schema
 * via the `definition` "active_ingredient".
 */
export interface ActiveIngredient {
  unii: Unii;
  /**
   * Ingredient name as on the label, e.g. 'acetaminophen'.
   */
  name: string;
  /**
   * Amount of the ingredient, e.g. 500.
   */
  strength: number;
  /**
   * Unit of strength, e.g. 'mg'.
   */
  unit: string;
  /**
   * For liquids and similar forms: the amount the strength is per, e.g. 30.
   */
  per_amount?: number;
  /**
   * Unit of per_amount, e.g. 'mL'.
   */
  per_unit?: string;
}
/**
 * One inactive ingredient. UNII may be missing on some labels.
 *
 * This interface was referenced by `Product`'s JSON-Schema
 * via the `definition` "inactive_ingredient".
 */
export interface InactiveIngredient {
  unii?: Unii;
  /**
   * Ingredient name as on the label, e.g. 'FD&C red no. 40'.
   */
  name: string;
}
