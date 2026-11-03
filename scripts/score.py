"""Python twin of Nomi's scoring function (Nomi docs/system-design.md section 6.2). Lookups and arithmetic only.

C4's on-phone engine (web/src/scoring/) must give the same answer for every vector in data/golden.json.

    uv run python scripts/score.py --ndc 50580044902 --persona adult_65_plus --condition hypertension
    uv run python scripts/score.py --golden            # check every vector in data/golden.json

Rules (plan C4 + Nomi 6.2):
- Per dimension, each active ingredient's points = its base row (unii, dimension, persona) plus every row for the
  same unii/dimension/persona whose condition or medication_type is in the profile.
- Ingredients combine per term_tables.combine: max | max_plus_stacking (max + stacking_points for each other
  ingredient with points on that dimension) | sum.
- score = clamp(base_score - total, 0, 100); tier from tier_bands; any matching hard stop forces red.
- A hard stop matches on unii (any active ingredient) or ndc11; personas omitted = all personas;
  condition / medication_type, if given, must be in the profile.
- Any active ingredient whose UNII isn't in rated_ingredients -> {"status": "unrated", "missing": [...]}, never a tier.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
NOMI_SAMPLES = ROOT / "vendor" / "nomi" / "samples"

Profile = dict[str, Any]  # {"persona": str, "conditions": [str], "medication_types": [str]}


def band(points: int) -> str:
    """Explanation template band (plan C4): < 15 low, < 35 moderate, else high."""
    return "low" if points < 15 else "moderate" if points < 35 else "high"


def _combine(points: list[int], combine: dict[str, Any]) -> int:
    scoring = [p for p in points if p > 0]
    if not scoring:
        return 0
    method = combine["method"]
    if method == "max":
        return max(scoring)
    if method == "sum":
        return sum(scoring)
    if method == "max_plus_stacking":
        return max(scoring) + combine.get("stacking_points", 0) * (len(scoring) - 1)
    raise ValueError(f"unknown combine method {method!r}")


def _row_applies(row: dict[str, Any], profile: Profile) -> bool:
    if row["persona"] != profile["persona"]:
        return False
    if "condition" in row:
        return row["condition"] in profile.get("conditions", [])
    if "medication_type" in row:
        return row["medication_type"] in profile.get("medication_types", [])
    return True  # the base row


def _hard_stop_applies(stop: dict[str, Any], product: dict[str, Any], profile: Profile) -> bool:
    uniis = {i["unii"] for i in product["ingredients"]}
    if "unii" in stop and stop["unii"] not in uniis:
        return False
    if "ndc11" in stop and stop["ndc11"] != product["ndc11"]:
        return False
    if "personas" in stop and profile["persona"] not in stop["personas"]:
        return False
    if "condition" in stop and stop["condition"] not in profile.get("conditions", []):
        return False
    if "medication_type" in stop and stop["medication_type"] not in profile.get("medication_types", []):
        return False
    return True


def _fill(template: str | None, names: list[str]) -> str | None:
    return template.replace("{ingredient}", " and ".join(names)) if template is not None else None


def score(
    product: dict[str, Any],
    profile: Profile,
    term_tables: dict[str, Any],
    rated_uniis: set[str],
    templates: dict[str, str] | None = None,
) -> dict[str, Any]:
    missing = [i["unii"] for i in product["ingredients"] if i["unii"] not in rated_uniis]
    if missing:
        return {"ndc11": product["ndc11"], "status": "unrated", "missing": missing}

    templates = templates or {}
    citations = term_tables["citations"]
    names = {i["unii"]: i["name"] for i in product["ingredients"]}
    uniis = list(names)
    dimensions = sorted({r["dimension"] for r in term_tables["terms"] if r["unii"] in names})

    contributions, explanation = [], []
    total = 0
    for dim in dimensions:
        per_ingredient: dict[str, int] = {}
        cite_ids: list[str] = []
        for unii in uniis:
            rows = [r for r in term_tables["terms"] if r["unii"] == unii and r["dimension"] == dim and _row_applies(r, profile)]
            per_ingredient[unii] = sum(r["points"] for r in rows)
            for r in rows:
                cite_ids += [c for c in r["citation_ids"] if c not in cite_ids]
        points = _combine(list(per_ingredient.values()), term_tables["combine"])
        if points == 0:
            continue
        total += points
        hit = [u for u in uniis if per_ingredient[u] > 0]
        cites = [citations[c] for c in cite_ids]
        contributions.append({"dimension": dim, "points": points, "ingredient_uniis": hit, "citations": cites})
        template_id = f"{dim}_{band(points)}"
        explanation.append(
            {"template_id": template_id, "text": _fill(templates.get(template_id), [names[u] for u in hit]), "citations": cites}
        )

    stops = [s for s in term_tables["hard_stops"] if _hard_stop_applies(s, product, profile)]
    value = max(0, min(100, term_tables["base_score"] - total))
    bands = term_tables["tier_bands"]
    tier = "red" if stops else "green" if value >= bands["green_min"] else "yellow" if value >= bands["yellow_min"] else "red"
    stop_explanations = [
        {
            "template_id": s["message_template_id"],
            "text": _fill(templates.get(s["message_template_id"]), [names[s["unii"]]] if "unii" in s else list(names.values())),
            "citations": [citations[c] for c in s["citation_ids"]],
        }
        for s in stops
    ]
    return {
        "ndc11": product["ndc11"],
        "profile": profile,
        "score": value,
        "tier": tier,
        "contributions": contributions,
        "hard_stops_triggered": [s["id"] for s in stops],
        "explanation": stop_explanations + explanation,  # hard stop reasons first
        "review_status": product.get("review_status", "unreviewed"),
        "model_version": term_tables["model_version"],
    }


# ---------- data loading and golden vectors ----------


def load_dataset(tables: str = "repo") -> dict[str, Any]:
    """'repo' = data/*.json; 'nomi_sample' = Nomi's own sample term table and product (vendor/nomi/samples)."""
    if tables == "nomi_sample":
        tt = json.loads((NOMI_SAMPLES / "term-tables.json").read_text())
        products = [json.loads((NOMI_SAMPLES / "product.json").read_text())]
        # Nomi's sample has no rated list; every UNII it has rows for counts as reviewed.
        rated = {r["unii"] for r in tt["terms"]} | {s["unii"] for s in tt["hard_stops"] if "unii" in s}
        templates: dict[str, str] = {}
    elif tables == "repo":
        tt = json.loads((DATA / "term_tables.json").read_text())
        products = json.loads((DATA / "products.json").read_text())
        rated = {r["unii"] for r in json.loads((DATA / "rated_ingredients.json").read_text())}
        templates_path = DATA / "templates.json"
        templates = json.loads(templates_path.read_text()) if templates_path.exists() else {}
    else:
        raise ValueError(f"unknown tables {tables!r}")
    return {"term_tables": tt, "products": {p["ndc11"]: p for p in products}, "rated": rated, "templates": templates}


def check_golden(path: Path = DATA / "golden.json") -> list[str]:
    """Scores every vector; returns a list of mismatch messages (empty = all match).

    A vector is {ndc11, profile, expected: {score, tier} | {status: "unrated"}, tables?: "repo" | "nomi_sample"}.
    """
    failures, cache = [], {}
    for n, vec in enumerate(json.loads(path.read_text())):
        tables = vec.get("tables", "repo")
        if tables not in cache:
            cache[tables] = load_dataset(tables)
        ds = cache[tables]
        product = ds["products"].get(vec["ndc11"])
        if product is None:
            failures.append(f"vector {n}: ndc11 {vec['ndc11']} not in {tables} products")
            continue
        got = score(product, vec["profile"], ds["term_tables"], ds["rated"], ds["templates"])
        got_short = {"status": "unrated"} if got.get("status") == "unrated" else {"score": got["score"], "tier": got["tier"]}
        if got_short != vec["expected"]:
            failures.append(f"vector {n} ({vec.get('note', vec['ndc11'])}): expected {vec['expected']}, got {got_short}")
    return failures


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Score a product for a profile (Nomi 6.2), or check data/golden.json.")
    ap.add_argument("--golden", nargs="?", const=str(DATA / "golden.json"), help="check golden vectors")
    ap.add_argument("--ndc", help="ndc11 to score")
    ap.add_argument("--persona", default="adult_18_64")
    ap.add_argument("--condition", action="append", default=[], dest="conditions")
    ap.add_argument("--medication-type", action="append", default=[], dest="medication_types")
    ap.add_argument("--tables", default="repo", choices=["repo", "nomi_sample"])
    args = ap.parse_args(argv)

    if args.golden:
        failures = check_golden(Path(args.golden))
        for f in failures:
            print(f"FAIL {f}")
        print(f"golden: {'all match' if not failures else f'{len(failures)} mismatch(es)'}")
        return 1 if failures else 0
    if not args.ndc:
        ap.error("give --ndc or --golden")
    ds = load_dataset(args.tables)
    product = ds["products"].get(args.ndc)
    if product is None:
        print(f"{args.ndc} not in products", file=sys.stderr)
        return 1
    profile = {"persona": args.persona, "conditions": args.conditions, "medication_types": args.medication_types}
    print(json.dumps(score(product, profile, ds["term_tables"], ds["rated"], ds["templates"]), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
