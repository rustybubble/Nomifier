import type { Citation } from "@nomi/ts/index";

const SOURCE_WORDS: Record<string, string> = {
  fda_label: "FDA label",
  otc_monograph: "FDA OTC monograph",
  stopp_start: "STOPP/START criteria",
  acb: "ACB scale",
  faers: "FDA adverse event reports",
  publication: "Published study",
  pharmacist_review: "Pharmacist review",
};

/** Plain-words source name for a citation. */
export const sourceWords = (c: Pick<Citation, "source">): string =>
  SOURCE_WORDS[c.source] ?? c.source.replaceAll("_", " ");

/** DailyMed link for FDA label citations; null for everything else and for the dev placeholder. */
export function dailyMedUrl(c: Citation): string | null {
  if (c.source !== "fda_label" || !c.document_id) return null;
  if (c.document_id === "DEV-FIXTURE") return null;
  return `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${encodeURIComponent(c.document_id)}`;
}

/** "FDA label, Warnings" */
export function citationLabel(c: Citation): string {
  return c.section ? `${sourceWords(c)}, ${c.section}` : sourceWords(c);
}
