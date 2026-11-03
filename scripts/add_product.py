"""Resolve a real OTC product to a Nomi Product and upsert it into data/products.json.

    uv run python scripts/add_product.py 350580449028            # UPC-A from the box
    uv run python scripts/add_product.py --ndc 50580-449-02       # NDC, with or without hyphens
    uv run python scripts/add_product.py --brand "Tylenol"        # pick from openFDA matches

Barcode -> 3 NDC11 candidates (Nomi's parser) -> openFDA NDC directory (the candidate that exists wins) ->
DailyMed SPL (version, active ingredients with active-moiety UNIIs, strengths) -> uses / otc_category suggested from
the label, confirmed by you -> validated with Nomi's schema -> data/products.json (sorted by ndc11).

--save-fixture DIR also writes every raw response to DIR plus manifest.json and expected.json (the final product), which
scripts/test_add_product.py replays offline. Record at least one, e.g. --save-fixture scripts/fixtures/tylenol.
"""

import argparse
import hashlib
import json
import re
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx
from nomi_schema.validate import SchemaValidationError, validate

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from vendor.nomi.barcode import ndc_candidates  # noqa: E402

PRODUCTS = ROOT / "data" / "products.json"
RATED = ROOT / "data" / "rated_ingredients.json"
CATALOG = ROOT / "data" / "catalog"
CACHE = ROOT / ".cache" / "add_product"
SCHEMA = json.loads((ROOT / "vendor/nomi/schemas/product.schema.json").read_text())
MARKETING_CATEGORIES = set(SCHEMA["properties"]["marketing_category"]["enum"])

OPENFDA = "https://api.fda.gov/drug/ndc.json"
DAILYMED = "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls"
HL7 = {"v3": "urn:hl7-org:v3"}
UNII_SYSTEM = "2.16.840.1.113883.4.9"
NDC_SYSTEM = "2.16.840.1.113883.6.69"
ACTIVE_CLASSES = {"ACTIB", "ACTIM", "ACTIR"}  # active ingredient by basis of strength: base, moiety, reference
INACTIVE_CLASSES = {"IACT"}
LOINC_PURPOSE = "55105-1"
LOINC_INDICATIONS = "34067-9"

# Label phrase -> use. Suggestions only: you confirm or edit them.
USE_KEYWORDS = {
    "pain": ["pain", "headache", "backache", "toothache", "aches"],
    "fever": ["fever"],
    "allergy": ["hay fever", "allergies", "sneezing", "runny nose", "itchy, watery eyes", "itchy watery eyes"],
    "sleep": ["sleeplessness", "sleep aid", "fall asleep"],
    "cough": ["cough"],
    "congestion": ["congestion", "stuffy nose", "sinus pressure"],
    "heartburn": ["heartburn", "acid indigestion", "sour stomach"],
}
# Purpose-section phrase -> otc_category, first match wins.
CATEGORY_KEYWORDS = [
    ("nighttime sleep aid", "nighttime_sleep_aids"),
    ("pain reliever", "internal_analgesics"),
    ("fever reducer", "internal_analgesics"),
    ("antihistamine", "antihistamines"),
    ("nasal decongestant", "nasal_decongestants"),
    ("cough suppressant", "antitussives"),
    ("expectorant", "expectorants"),
    ("acid reducer", "acid_reducers"),
    ("antacid", "antacids"),
]


class ResolveError(Exception):
    pass


class NotFound(ResolveError):
    """openFDA answered, and no candidate matched. Network failures are plain ResolveErrors."""


# ---------- NDC formats ----------


def hyphenate(ndc11: str) -> list[str]:
    """Package NDCs (hyphenated, as openFDA stores them) that normalize to this NDC11.

    NDC11 pads one segment with a leading zero: 4-4-2 -> 0AAAA-BBBB-CC, 5-3-2 -> AAAAA-0BBB-CC, 5-4-1 -> AAAAA-BBBB-0C.
    """
    out = []
    if ndc11[0] == "0":
        out.append(f"{ndc11[1:5]}-{ndc11[5:9]}-{ndc11[9:]}")
    if ndc11[5] == "0":
        out.append(f"{ndc11[:5]}-{ndc11[6:9]}-{ndc11[9:]}")
    if ndc11[9] == "0":
        out.append(f"{ndc11[:5]}-{ndc11[5:9]}-{ndc11[10:]}")
    return out


def normalize_ndc(raw: str) -> list[tuple[str, str]]:
    """(ndc11, hyphenated package NDC) pairs to try for a user-typed NDC."""
    raw = raw.strip()
    parts = raw.split("-")
    if len(parts) == 3 and all(p.isdigit() for p in parts):
        a, b, c = parts
        widths = (len(a), len(b), len(c))
        pads = {(4, 4, 2): "0" + a + b + c, (5, 3, 2): a + "0" + b + c, (5, 4, 1): a + b + "0" + c, (5, 4, 2): a + b + c}
        if widths not in pads:
            raise ResolveError(f"{raw}: expected a 4-4-2, 5-3-2, 5-4-1 or 5-4-2 NDC")
        ndc11 = pads[widths]
        hyph = raw if widths != (5, 4, 2) else None
        return [(ndc11, h) for h in ([hyph] if hyph else hyphenate(ndc11))]
    digits = raw.replace("-", "")
    if not digits.isdigit():
        raise ResolveError(f"{raw}: not an NDC")
    if len(digits) == 11:
        return [(digits, h) for h in hyphenate(digits)]
    if len(digits) == 10:
        return split_ndc10(digits)
    raise ResolveError(f"{raw}: an NDC has 10 or 11 digits")


def split_ndc10(ndc10: str) -> list[tuple[str, str]]:
    """(ndc11, hyphenated) for each way a 10-digit NDC can split, in Nomi's order: 4-4-2, 5-3-2, 5-4-1."""
    return [
        ("0" + ndc10, f"{ndc10[:4]}-{ndc10[4:8]}-{ndc10[8:]}"),
        (ndc10[:5] + "0" + ndc10[5:], f"{ndc10[:5]}-{ndc10[5:8]}-{ndc10[8:]}"),
        (ndc10[:9] + "0" + ndc10[9], f"{ndc10[:5]}-{ndc10[5:9]}-{ndc10[9:]}"),
    ]


def candidates_from_upc(upc: str) -> list[tuple[str, str]]:
    result = ndc_candidates(upc)
    if result["status"] != "ok":
        raise ResolveError(f"{upc}: {result['status'].replace('_', ' ')}")
    # Nomi's candidates are the three splits of the barcode's NDC10; pair each with its hyphenated form.
    ndc10 = result["candidates"][0][1:]
    pairs = split_ndc10(ndc10)
    assert [n for n, _ in pairs] == result["candidates"], "split order must match Nomi's parser"
    return pairs


def map_marketing_category(value: str | None) -> str:
    key = re.sub(r"[^a-z0-9]+", "_", (value or "").lower()).strip("_")
    return key if key in MARKETING_CATEGORIES else "other"


# ---------- HTTP with cache and fixture recording ----------


class Http:
    def __init__(self, save_fixture: Path | None = None, offline: dict[str, Path] | None = None):
        self.save_fixture = save_fixture
        self.offline = offline  # url -> file; set by the offline test
        self.manifest: dict[str, str] = {}
        if save_fixture:
            save_fixture.mkdir(parents=True, exist_ok=True)

    def get(self, url: str, *, not_found_ok: bool = False) -> str | None:
        if self.offline is not None:
            if url not in self.offline:
                if not_found_ok:
                    return None
                raise ResolveError(f"offline: no fixture for {url}")
            return self.offline[url].read_text()
        name = hashlib.sha1(url.encode()).hexdigest()[:16] + (".xml" if url.endswith(".xml") else ".json")
        cached = CACHE / name
        if cached.exists():
            text = cached.read_text()
        else:
            text = self._fetch(url, not_found_ok)
            if text is None:
                return None
            CACHE.mkdir(parents=True, exist_ok=True)
            cached.write_text(text)
        if self.save_fixture:
            (self.save_fixture / name).write_text(text)
            self.manifest[url] = name
            (self.save_fixture / "manifest.json").write_text(json.dumps(self.manifest, indent=2) + "\n")
        return text

    @staticmethod
    def _fetch(url: str, not_found_ok: bool) -> str | None:
        last: Exception | None = None
        for attempt in range(2):  # one retry
            try:
                resp = httpx.get(url, timeout=10.0, follow_redirects=True)
            except httpx.HTTPError as exc:
                last = exc
                time.sleep(1)
                continue
            if resp.status_code == 404 and not_found_ok:
                return None
            if resp.status_code >= 500 and attempt == 0:
                time.sleep(1)
                continue
            if resp.status_code >= 400:
                raise ResolveError(f"GET {url} -> HTTP {resp.status_code}: {resp.text[:200]}")
            return resp.text
        raise ResolveError(f"GET {url} failed after a retry: {last}")


# ---------- openFDA ----------


def openfda_package(http: Http, hyphenated: str) -> dict[str, Any] | None:
    url = f'{OPENFDA}?search=packaging.package_ndc:"{hyphenated}"'
    text = http.get(url, not_found_ok=True)  # openFDA answers 404 when nothing matches
    if text is None:
        return None
    results = json.loads(text).get("results") or []
    return results[0] if results else None


def resolve_candidates(http: Http, candidates: list[tuple[str, str]]) -> tuple[str, dict[str, Any]]:
    for ndc11, hyphenated in candidates:
        hit = openfda_package(http, hyphenated)
        if hit is not None:
            return ndc11, hit
    raise NotFound("not an NDC barcode")


def search_brand(http: Http, brand: str) -> list[tuple[str, str, str]]:
    url = f'{OPENFDA}?search=brand_name:"{quote(brand)}"&limit=25'
    text = http.get(url, not_found_ok=True)
    out = []
    for r in (json.loads(text).get("results") or []) if text else []:
        for pkg in r.get("packaging", []):
            out.append((pkg["package_ndc"], r.get("brand_name", ""), pkg.get("description", "")))
    return out


# ---------- DailyMed ----------


def latest_spl_version(http: Http, setid: str) -> int:
    data = json.loads(http.get(f"{DAILYMED}/{setid}/history.json"))
    history = data.get("data", {}).get("history") or data.get("data") or []
    versions = [int(h["spl_version"]) for h in history if isinstance(h, dict) and "spl_version" in h]
    if not versions:
        raise ResolveError(f"DailyMed history for {setid} has no spl_version")
    return max(versions)


def _code(el: ET.Element | None, system: str) -> str | None:
    if el is None:
        return None
    for code in el.findall("v3:code", HL7):
        if code.get("codeSystem") == system:
            return code.get("code")
    return None


def _number(value: str | None) -> float | int | None:
    if value is None:
        return None
    n = float(value)
    return int(n) if n.is_integer() else n


def parse_spl(xml_text: str, product_ndc: str | None) -> dict[str, Any]:
    """Active ingredients (active-moiety UNII, label name, strength), inactive names, and Purpose/Uses text.

    product_ndc is openFDA's product NDC (labeler-product, e.g. "50580-449"); it picks the right product when one
    label covers several.
    """
    root = ET.fromstring(xml_text)
    products = root.findall(".//v3:manufacturedProduct/v3:manufacturedProduct", HL7)
    if not products:
        raise ResolveError("SPL has no manufacturedProduct")
    chosen = next((p for p in products if _code(p, NDC_SYSTEM) == product_ndc), products[0])

    actives, inactives, warnings = [], [], []
    for ing in chosen.findall("v3:ingredient", HL7):
        cls = ing.get("classCode")
        substance = ing.find("v3:ingredientSubstance", HL7)
        name = (substance.findtext("v3:name", default="", namespaces=HL7) if substance is not None else "").strip()
        if cls in INACTIVE_CLASSES:
            if name:
                inactives.append({"name": name.lower()})
            continue
        if cls not in ACTIVE_CLASSES:
            continue
        moiety = substance.find("v3:activeMoiety/v3:activeMoiety", HL7) if substance is not None else None
        unii = _code(moiety, UNII_SYSTEM)
        if unii is None:
            unii = _code(substance, UNII_SYSTEM)
            warnings.append(f"{name}: no active moiety in the SPL, used the substance UNII {unii}")
        num = ing.find("v3:quantity/v3:numerator", HL7)
        den = ing.find("v3:quantity/v3:denominator", HL7)
        if num is None or unii is None:
            raise ResolveError(f"SPL ingredient {name!r} is missing a strength or UNII")
        item: dict[str, Any] = {"unii": unii, "name": name.lower(), "strength": _number(num.get("value")), "unit": num.get("unit")}
        if den is not None and not (den.get("value") in ("1", None) and den.get("unit") in ("1", None)):
            item["per_amount"] = _number(den.get("value"))
            item["per_unit"] = den.get("unit")
        actives.append(item)
    if not actives:
        raise ResolveError("SPL product has no active ingredients (a kit or combo pack? add it by hand)")

    def section_text(loinc: str) -> str:
        texts = []
        for sec in root.iter("{urn:hl7-org:v3}section"):
            code = sec.find("v3:code", HL7)
            if code is not None and code.get("code") == loinc:
                texts.append(" ".join("".join(sec.itertext()).split()))
        return " ".join(texts)

    return {
        "ingredients": actives,
        "inactive_ingredients": inactives,
        "purpose": section_text(LOINC_PURPOSE),
        "uses_text": section_text(LOINC_INDICATIONS),
        "warnings": warnings,
    }


def suggest_uses(text: str) -> list[str]:
    low = text.lower()
    return [use for use, words in USE_KEYWORDS.items() if any(w in low for w in words)]


def suggest_category(purpose: str) -> str | None:
    low = purpose.lower()
    return next((cat for phrase, cat in CATEGORY_KEYWORDS if phrase in low), None)


# ---------- assemble ----------


def build_product(http: Http, ndc11: str, fda: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    setids = (fda.get("openfda") or {}).get("spl_set_id") or []
    if not setids:
        raise ResolveError(f"openFDA has no spl_set_id for {ndc11}")
    setid = setids[0]
    spl = parse_spl(http.get(f"{DAILYMED}/{setid}.xml"), fda.get("product_ndc"))
    category = map_marketing_category(fda.get("marketing_category"))
    product = {
        "ndc11": ndc11,
        "spl_set_id": setid,
        "spl_version": latest_spl_version(http, setid),
        "brand_name": (fda.get("brand_name") or "").strip(),
        "generic_name": (fda.get("generic_name") or "").strip().lower(),
        "labeler": fda.get("labeler_name"),
        "dosage_form": fda.get("dosage_form"),
        "marketing_category": category,
        "otc_category": suggest_category(spl["purpose"]),
        "uses": suggest_uses(spl["purpose"] + " " + spl["uses_text"]),
        "scope": "homeopathic" if category == "unapproved_homeopathic" else "in_scope",
        "ingredients": spl["ingredients"],
        "inactive_ingredients": spl["inactive_ingredients"],
        "review_status": "unreviewed",
    }
    return {k: v for k, v in product.items() if v is not None}, spl


def confirm(product: dict[str, Any], spl: dict[str, Any], args: argparse.Namespace) -> None:
    if args.uses is not None:
        product["uses"] = [u.strip() for u in args.uses.split(",") if u.strip()]
    if args.otc_category is not None:
        product["otc_category"] = args.otc_category
    if args.yes or not sys.stdin.isatty():
        return
    print(f"\nPurpose: {spl['purpose'][:300] or '(none found)'}")
    print(f"Uses:    {spl['uses_text'][:400] or '(none found)'}")
    entered = input(f"uses [{', '.join(product['uses'])}] (Enter keeps, or type a comma list): ").strip()
    if entered:
        product["uses"] = [u.strip() for u in entered.split(",") if u.strip()]
    entered = input(f"otc_category [{product.get('otc_category')}]: ").strip()
    if entered:
        product["otc_category"] = entered


def upsert(product: dict[str, Any], path: Path = PRODUCTS) -> None:
    products = json.loads(path.read_text()) if path.exists() else []
    products = [p for p in products if p["ndc11"] != product["ndc11"]] + [product]
    products.sort(key=lambda p: p["ndc11"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(products, indent=2, ensure_ascii=False) + "\n")


def report(product: dict[str, Any], warnings: list[str]) -> None:
    rated = {r["unii"] for r in json.loads(RATED.read_text())} if RATED.exists() else None
    print(f"\n{product['brand_name']}  ndc11 {product['ndc11']}  (SPL {product['spl_set_id']} v{product['spl_version']})")
    for i in product["ingredients"]:
        per = f" per {i['per_amount']} {i['per_unit']}" if "per_amount" in i else ""
        flag = "" if rated is None else ("  rated" if i["unii"] in rated else "  NOT RATED")
        print(f"  {i['name']} {i['strength']} {i['unit']}{per}  UNII {i['unii']}{flag}")
    print(f"  uses {product['uses']}  otc_category {product.get('otc_category')}")
    for w in warnings:
        print(f"  warning: {w}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("upc", nargs="?", help="UPC-A or EAN-13 digits from the box")
    ap.add_argument("--ndc", help="NDC with or without hyphens")
    ap.add_argument("--brand", help="search openFDA by brand name and pick a package")
    ap.add_argument("--uses", help="comma list, overrides the suggestion")
    ap.add_argument("--otc-category", help="overrides the suggestion")
    ap.add_argument("--yes", action="store_true", help="accept suggestions without asking")
    ap.add_argument("--save-fixture", type=Path, help="also write raw responses + manifest.json here")
    args = ap.parse_args(argv)
    if sum(x is not None for x in (args.upc, args.ndc, args.brand)) != 1:
        ap.error("give exactly one of: a UPC, --ndc or --brand")

    http = Http(save_fixture=args.save_fixture)
    try:
        if args.upc:
            candidates = candidates_from_upc(args.upc)
        elif args.ndc:
            candidates = normalize_ndc(args.ndc)
        else:
            matches = search_brand(http, args.brand)
            if not matches:
                raise ResolveError(f"no openFDA products named {args.brand!r}")
            for n, (pkg, name, desc) in enumerate(matches):
                print(f"{n:2}  {pkg:14} {name}: {desc}")
            pick = matches[int(input("pick a number: "))][0]
            candidates = normalize_ndc(pick)
        try:
            ndc11, fda = resolve_candidates(http, candidates)
        except NotFound:
            print("not an NDC barcode" if args.upc else f"no openFDA package matches {args.ndc or args.brand}")
            return 2
        product, spl = build_product(http, ndc11, fda)
        confirm(product, spl, args)
        validate("product", product)
    except SchemaValidationError as exc:
        print(f"product doesn't validate, nothing written:\n{exc}", file=sys.stderr)
        return 1
    except ResolveError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    upsert(product)
    if args.save_fixture:
        (args.save_fixture / "expected.json").write_text(json.dumps(product, indent=2, ensure_ascii=False) + "\n")
    (CATALOG / product["ndc11"]).mkdir(parents=True, exist_ok=True)
    report(product, spl["warnings"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
