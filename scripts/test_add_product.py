"""Offline tests for scripts/add_product.py.

The end-to-end test replays REAL openFDA + DailyMed responses recorded on a machine with internet:

    uv run python scripts/add_product.py 350580449028 --yes --save-fixture scripts/fixtures/tylenol

It skips until scripts/fixtures/*/manifest.json exists. The parser test below uses a small SYNTHETIC SPL snippet
that follows the HL7 v3 structure DailyMed serves; it checks our XPaths, not any real label's content.
"""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import add_product as ap  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = Path(__file__).resolve().parent / "fixtures"


@pytest.mark.parametrize("case", [c for c in json.loads((ROOT / "vendor/nomi/barcodes.json").read_text()) if c["status"] == "ok"])
def test_upc_candidates_match_nomi_and_hyphenate_back(case):
    pairs = ap.candidates_from_upc(case["input"])
    assert [n for n, _ in pairs] == case["candidates"]
    for ndc11, hyphenated in pairs:
        assert len(hyphenated.replace("-", "")) == 10
        assert hyphenated in ap.hyphenate(ndc11)
        assert ap.normalize_ndc(hyphenated) == [(ndc11, hyphenated)]


@pytest.mark.parametrize("case", [c for c in json.loads((ROOT / "vendor/nomi/barcodes.json").read_text()) if c["status"] != "ok"])
def test_bad_barcodes_are_refused(case):
    with pytest.raises(ap.ResolveError):
        ap.candidates_from_upc(case["input"])


def test_normalize_ndc_forms():
    assert ap.normalize_ndc("50580-449-02") == [("50580044902", "50580-449-02")]
    assert ap.normalize_ndc("0045-0449-01") == [("00045044901", "0045-0449-01")]
    # 11 digits without hyphens can be ambiguous; openFDA decides which package exists.
    assert ap.normalize_ndc("50580044902") == [("50580044902", "50580-449-02"), ("50580044902", "50580-0449-2")]
    assert ap.normalize_ndc("5058044902") == ap.split_ndc10("5058044902")
    with pytest.raises(ap.ResolveError):
        ap.normalize_ndc("123-45-6")


def test_marketing_category_mapping():
    assert ap.map_marketing_category("OTC MONOGRAPH DRUG") == "otc_monograph_drug"
    assert ap.map_marketing_category("NDA AUTHORIZED GENERIC") == "nda_authorized_generic"
    assert ap.map_marketing_category("UNAPPROVED HOMEOPATHIC") == "unapproved_homeopathic"
    assert ap.map_marketing_category("EMERGENCY USE AUTHORIZATION") == "other"
    assert ap.map_marketing_category(None) == "other"


SYNTHETIC_SPL = """<?xml version="1.0" encoding="UTF-8"?>
<document xmlns="urn:hl7-org:v3">
  <component><structuredBody>
    <component><section>
      <subject><manufacturedProduct><manufacturedProduct>
        <code code="99999-001" codeSystem="2.16.840.1.113883.6.69"/>
        <name>Synthetic Cold Liquid</name>
        <ingredient classCode="ACTIB">
          <quantity><numerator value="325" unit="mg"/><denominator value="15" unit="mL"/></quantity>
          <ingredientSubstance>
            <code code="362O9ITL9D" codeSystem="2.16.840.1.113883.4.9"/>
            <name>ACETAMINOPHEN</name>
            <activeMoiety><activeMoiety>
              <code code="362O9ITL9D" codeSystem="2.16.840.1.113883.4.9"/><name>ACETAMINOPHEN</name>
            </activeMoiety></activeMoiety>
          </ingredientSubstance>
        </ingredient>
        <ingredient classCode="ACTIB">
          <quantity><numerator value="12.5" unit="mg"/><denominator value="15" unit="mL"/></quantity>
          <ingredientSubstance>
            <code code="SALTUNII00" codeSystem="2.16.840.1.113883.4.9"/>
            <name>DOXYLAMINE SUCCINATE</name>
            <activeMoiety><activeMoiety>
              <code code="MOIETY0000" codeSystem="2.16.840.1.113883.4.9"/><name>DOXYLAMINE</name>
            </activeMoiety></activeMoiety>
          </ingredientSubstance>
        </ingredient>
        <ingredient classCode="IACT"><ingredientSubstance><name>WATER</name></ingredientSubstance></ingredient>
      </manufacturedProduct></manufacturedProduct></subject>
    </section></component>
    <component><section><code code="55105-1" codeSystem="2.16.840.1.113883.6.1"/>
      <text>Pain reliever/fever reducer. Antihistamine.</text></section></component>
    <component><section><code code="34067-9" codeSystem="2.16.840.1.113883.6.1"/>
      <text>temporarily relieves minor aches and pains, headache, sneezing, runny nose, cough</text></section></component>
  </structuredBody></component>
</document>"""


def test_parse_spl_paths():
    spl = ap.parse_spl(SYNTHETIC_SPL, "99999-001")
    assert spl["ingredients"] == [
        {"unii": "362O9ITL9D", "name": "acetaminophen", "strength": 325, "unit": "mg", "per_amount": 15, "per_unit": "mL"},
        # The active MOIETY's UNII, not the salt's: naproxen sodium and naproxen share rows.
        {"unii": "MOIETY0000", "name": "doxylamine succinate", "strength": 12.5, "unit": "mg", "per_amount": 15, "per_unit": "mL"},
    ]
    assert spl["inactive_ingredients"] == [{"name": "water"}]
    assert ap.suggest_category(spl["purpose"]) == "internal_analgesics"
    assert ap.suggest_uses(spl["purpose"] + " " + spl["uses_text"]) == ["pain", "fever", "allergy", "cough"]


def test_upsert_sorts_and_replaces(tmp_path):
    path = tmp_path / "products.json"
    ap.upsert({"ndc11": "2", "v": 1}, path)
    ap.upsert({"ndc11": "1", "v": 1}, path)
    ap.upsert({"ndc11": "2", "v": 2}, path)
    assert json.loads(path.read_text()) == [{"ndc11": "1", "v": 1}, {"ndc11": "2", "v": 2}]


RECORDED = sorted(FIXTURES.glob("*/manifest.json"))


@pytest.mark.skipif(not RECORDED, reason="no recorded fixtures yet: run add_product.py --save-fixture scripts/fixtures/<name>")
@pytest.mark.parametrize("manifest", RECORDED, ids=lambda p: p.parent.name)
def test_replay_real_responses(manifest, monkeypatch):
    from nomi_schema.validate import validate

    urls = {url: manifest.parent / name for url, name in json.loads(manifest.read_text()).items()}
    http = ap.Http(offline=urls)
    expected = json.loads((manifest.parent / "expected.json").read_text())
    ndc11, fda = ap.resolve_candidates(http, ap.normalize_ndc(expected["ndc11"]))
    product, _ = ap.build_product(http, ndc11, fda)
    product["uses"], product["otc_category"] = expected["uses"], expected["otc_category"]
    validate("product", product)
    assert product == expected
