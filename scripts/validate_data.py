"""Validate Nomifier's knowledge files. Exit 0 only if every check passes.

    uv run python scripts/validate_data.py            # all checks
    uv run python scripts/validate_data.py --review   # also print ingredient x persona points with the quote behind each row

Checks (plan A3 step 6, plus the citation rules from step 1):
- data/term_tables.json validates against Nomi's term-tables schema.
- every product in data/products.json validates against Nomi's product schema; ndc11s are unique.
- every citation id used by a term or hard stop exists in the citations map.
- every fda_label citation has a section and a short exact quote (A reviews each against DailyMed).
- every UNII in a term row or hard stop is in data/rated_ingredients.json.
- the scoring constants are the frozen ones (base 100, bands 75/50, max_plus_stacking 5).
- templates.json has a sentence for every <dimension>_<low|moderate|high> and hard-stop template in use;
  questions.json has questions for every dimension in use; both use only the {ingredient} placeholder.
- label_status.json (if present) has a valid status, url and checked_at per known ndc11.
- scripts/score.py reproduces every vector in data/golden.json.
A file that doesn't exist yet is reported as SKIP, not as an error (Coverage Clerk runs this on product-only PRs).
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

from nomi_schema.validate import errors as schema_errors

sys.path.insert(0, str(Path(__file__).resolve().parent))
import score as scoring  # noqa: E402

DATA = scoring.DATA
FROZEN = {
    "base_score": 100,
    "tier_bands": {"green_min": 75, "yellow_min": 50},
    "combine": {"method": "max_plus_stacking", "stacking_points": 5},
}
BANDS = ("low", "moderate", "high")
LABEL_STATUSES = {"ok", "label_updated", "recall"}


class Report:
    def __init__(self) -> None:
        self.problems: list[str] = []

    def fail(self, msg: str) -> None:
        self.problems.append(msg)
        print(f"FAIL {msg}")

    def ok(self, msg: str) -> None:
        print(f"ok   {msg}")

    def skip(self, msg: str) -> None:
        print(f"SKIP {msg}")


def _load(name: str) -> Any | None:
    path = DATA / name
    return json.loads(path.read_text()) if path.exists() else None


def check_products(r: Report, products: list[dict[str, Any]] | None) -> None:
    if products is None:
        return r.skip("data/products.json not written yet (A2)")
    seen = set()
    for p in products:
        for e in schema_errors("product", p):
            r.fail(f"products.json {p.get('ndc11', '?')}: {e}")
        if p.get("ndc11") in seen:
            r.fail(f"products.json: duplicate ndc11 {p['ndc11']}")
        seen.add(p.get("ndc11"))
    r.ok(f"products.json: {len(products)} products checked")


def check_term_tables(r: Report, tt: dict[str, Any] | None, rated: set[str] | None) -> None:
    if tt is None:
        return r.skip("data/term_tables.json not written yet (A3)")
    for e in schema_errors("term-tables", tt):
        r.fail(f"term_tables.json: {e}")
    for key, want in FROZEN.items():
        if tt.get(key) != want:
            r.fail(f"term_tables.json: {key} is {tt.get(key)!r}, contract says {want!r}")

    citations = tt.get("citations", {})
    used = [(f"term {t.get('unii')}/{t.get('dimension')}", c) for t in tt.get("terms", []) for c in t.get("citation_ids", [])]
    used += [(f"hard stop {s.get('id')}", c) for s in tt.get("hard_stops", []) for c in s.get("citation_ids", [])]
    for where, cid in used:
        if cid not in citations:
            r.fail(f"term_tables.json: {where} cites missing {cid}")
    for cid, cit in citations.items():
        if cit.get("source") == "fda_label" and not (cit.get("section") and cit.get("quote")):
            r.fail(f"term_tables.json: citation {cid} (fda_label) needs a section and a short exact quote")

    if rated is None:
        r.skip("data/rated_ingredients.json not written yet (A3)")
    else:
        uniis = {t["unii"] for t in tt.get("terms", [])} | {s["unii"] for s in tt.get("hard_stops", []) if "unii" in s}
        for u in sorted(uniis - rated):
            r.fail(f"term_tables.json: UNII {u} has rows but isn't in rated_ingredients.json")
    r.ok(f"term_tables.json: {len(tt.get('terms', []))} terms, {len(tt.get('hard_stops', []))} hard stops, {len(citations)} citations")


def check_rated(r: Report, raw: Any) -> set[str] | None:
    if raw is None:
        return None
    uniis = set()
    for n, item in enumerate(raw):
        if not (isinstance(item, dict) and set(item) == {"unii", "name"} and re.fullmatch(r"[A-Z0-9]{10}", str(item["unii"]))):
            r.fail(f"rated_ingredients.json[{n}]: expected {{unii, name}} with a 10-character UNII, got {item!r}")
            continue
        uniis.add(item["unii"])
    r.ok(f"rated_ingredients.json: {len(uniis)} ingredients")
    return uniis


def _placeholders_ok(text: str) -> bool:
    return set(re.findall(r"\{([^}]*)\}", text)) <= {"ingredient"}


def check_text_files(r: Report, tt: dict[str, Any] | None) -> None:
    templates, questions = _load("templates.json"), _load("questions.json")
    dims = sorted({t["dimension"] for t in tt.get("terms", [])}) if tt else []
    if templates is None:
        r.skip("data/templates.json not written yet (A3)")
    else:
        needed = {f"{d}_{b}" for d in dims for b in BANDS} | {s["message_template_id"] for s in (tt or {}).get("hard_stops", [])}
        for key in sorted(needed - set(templates)):
            r.fail(f"templates.json: no sentence for {key}")
        for key, text in templates.items():
            if not _placeholders_ok(text):
                r.fail(f"templates.json: {key} uses a placeholder other than {{ingredient}}")
        r.ok(f"templates.json: {len(templates)} templates")
    if questions is None:
        r.skip("data/questions.json not written yet (A3)")
    else:
        for d in dims:
            if not questions.get(d):
                r.fail(f"questions.json: no questions for {d}")
        for d, qs in questions.items():
            for q in qs:
                if not _placeholders_ok(q):
                    r.fail(f"questions.json: a {d} question uses a placeholder other than {{ingredient}}")
        r.ok(f"questions.json: {len(questions)} dimensions")


def check_label_status(r: Report, products: list[dict[str, Any]] | None) -> None:
    status = _load("label_status.json")
    if status is None:
        return r.skip("data/label_status.json not written yet (A7)")
    known = {p["ndc11"] for p in products or []}
    for ndc11, entry in status.items():
        if products is not None and ndc11 not in known:
            r.fail(f"label_status.json: {ndc11} isn't in products.json")
        if entry.get("status") not in LABEL_STATUSES:
            r.fail(f"label_status.json: {ndc11} status {entry.get('status')!r} not in {sorted(LABEL_STATUSES)}")
        if not str(entry.get("url", "")).startswith("https://") or not entry.get("checked_at"):
            r.fail(f"label_status.json: {ndc11} needs an https url and checked_at")
    r.ok(f"label_status.json: {len(status)} products")


def check_golden(r: Report) -> None:
    path = DATA / "golden.json"
    if not path.exists():
        return r.skip("data/golden.json not written yet (A3)")
    vectors = json.loads(path.read_text())
    tables = {v.get("tables", "repo") for v in vectors}
    if "repo" in tables and not (DATA / "term_tables.json").exists():
        return r.fail("golden.json has repo vectors but data/term_tables.json is missing")
    for f in scoring.check_golden(path):
        r.fail(f"golden.json: {f}")
    r.ok(f"golden.json: {len(vectors)} vectors scored")


def review_table(tt: dict[str, Any], rated_raw: list[dict[str, str]] | None) -> None:
    names = {i["unii"]: i["name"] for i in rated_raw or []}
    citations = tt["citations"]
    print("\nREVIEW: open each DailyMed label and confirm the quote word for word.\n")
    print(f"{'ingredient':24} {'persona':14} {'modifier':22} {'dimension':26} {'pts':>3}  source")
    for t in sorted(tt["terms"], key=lambda t: (names.get(t["unii"], t["unii"]), t["persona"], t["dimension"])):
        mod = t.get("condition") or t.get("medication_type") or "(base)"
        print(f"{names.get(t['unii'], t['unii'])[:24]:24} {t['persona']:14} {mod:22} {t['dimension']:26} {t['points']:>3}")
        for cid in t["citation_ids"]:
            c = citations.get(cid, {})
            link = f"https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid={c['document_id']}" if c.get("source") == "fda_label" else c.get("url", "")
            print(f"{'':90}{c.get('source')} {c.get('section', '')}: \"{c.get('quote', '')}\" {link}")
    for s in tt["hard_stops"]:
        print(f"HARD STOP {s['id']}: {s.get('unii') or s.get('ndc11')} personas={s.get('personas', 'all')} "
              f"{s.get('condition') or s.get('medication_type') or ''} -> red  ({', '.join(s['citation_ids'])})")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Validate Nomifier's knowledge files.")
    ap.add_argument("--review", action="store_true", help="print the review table for A's citation check")
    args = ap.parse_args(argv)

    r = Report()
    products, tt, rated_raw = _load("products.json"), _load("term_tables.json"), _load("rated_ingredients.json")
    rated = check_rated(r, rated_raw)
    check_products(r, products)
    check_term_tables(r, tt, rated)
    check_text_files(r, tt)
    check_label_status(r, products)
    check_golden(r)
    if args.review and tt is not None:
        review_table(tt, rated_raw)
    print(f"\n{'PASS' if not r.problems else f'{len(r.problems)} problem(s)'}")
    return 1 if r.problems else 0


if __name__ == "__main__":
    sys.exit(main())
