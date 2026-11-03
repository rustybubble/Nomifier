/**
 * Turns the scanned barcode into candidate NDC11 codes.
 *
 * A mirror of pipeline/src/nomi_pipeline/identity/barcode.py.
 * Both must give identical output for every case in
 * packages/schema/fixtures/barcodes.json.
 */

export type Status = "ok" | "invalid_format" | "bad_check_digit" | "not_ndc_barcode";

export interface BarcodeResult {
  status: Status;
  candidates: string[];
}

// Trimmed explicitly: trim() and Python's str.strip() disagree on some characters, e.g. the BOM.
const TRIM = /^[ \t\n\r\v\f\ufeff]+|[ \t\n\r\v\f\ufeff]+$/g;

/**
 * Returns the expected check digit of a UPC-A or EAN-13 barcode, given every digit but the last.
 * Digits are weighted 3, 1, 3, ... starting from the rightmost one.
 */
function checkDigit(data: string): number {
  let total = 0;
  for (let i = 0; i < data.length; i++) {
    const weight = i % 2 === 0 ? 3 : 1;
    total += Number(data[data.length - 1 - i]) * weight;
  }
  return (10 - (total % 10)) % 10;
}

function fail(status: Status): BarcodeResult {
  return { status, candidates: [] };
}

/**
 * Returns the status and NDC11 candidates for a scanned barcode.
 * Candidates is empty unless status is "ok".
 */
export function ndcCandidates(raw: string): BarcodeResult {
  let code = raw.replace(TRIM, "");

  // Only ASCII 0-9.
  if (!/^[0-9]+$/.test(code)) {
    return fail("invalid_format");
  }

  // EAN-13 with a leading 0 is a UPC-A. Any other valid EAN-13 is a real barcode, just not a drug.
  if (code.length === 13) {
    if (code[0] !== "0") {
      if (checkDigit(code.slice(0, 12)) !== Number(code[12])) {
        return fail("bad_check_digit");
      }
      return fail("not_ndc_barcode");
    }
    code = code.slice(1);
  }
  if (code.length !== 12) {
    return fail("invalid_format");
  }

  // Checked before the "3" prefix so a misread is reported as a misread, not as a non-drug.
  if (checkDigit(code.slice(0, 11)) !== Number(code[11])) {
    return fail("bad_check_digit");
  }

  if (code[0] !== "3") {
    return fail("not_ndc_barcode");
  }

  const ndc10 = code.slice(1, 11);
  return {
    status: "ok",
    candidates: [
      "0" + ndc10, // 4-4-2
      ndc10.slice(0, 5) + "0" + ndc10.slice(5), // 5-3-2
      ndc10.slice(0, 9) + "0" + ndc10[9], // 5-4-1
    ],
  };
}
