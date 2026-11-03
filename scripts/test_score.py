"""Tests for scripts/score.py and scripts/validate_data.py. All tables here are SYNTHETIC (fake UNIIs, no real
clinical values): they exercise the arithmetic, not the knowledge base."""

import itertools
import json
import random
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import score as s  # noqa: E402
import validate_data as vd  # noqa: E402

A, B, C = "AAAAAAAAA1", "BBBBBBBBB2", "CCCCCCCCC3"
CIT = {"cit_1": {"source": "fda_label", "document_id": "doc-1", "section": "Warnings", "quote": "q"}}


def tables(terms, hard_stops=(), method="max_plus_stacking", stacking=5):
    return {
        "model_version": "test",
        "rubric_version": "test",
        "base_score": 100,
        "tier_bands": {"green_min": 75, "yellow_min": 50},
        "combine": {"method": method, "stacking_points": stacking},
        "terms": [{"citation_ids": ["cit_1"], **t} for t in terms],
        "hard_stops": [{"result": "red", "message_template_id": "hs_msg", "citation_ids": ["cit_1"], **h} for h in hard_stops],
        "citations": CIT,
    }


def product(*uniis, ndc11="00000000001"):
    return {"ndc11": ndc11, "ingredients": [{"unii": u, "name": f"ing{u[-1]}", "strength": 1, "unit": "mg"} for u in uniis]}


def prof(persona="adult_65_plus", conditions=(), meds=()):
    return {"persona": persona, "conditions": list(conditions), "medication_types": list(meds)}


ALL = {A, B, C}


def test_base_row_and_tiers():
    tt = tables([{"unii": A, "dimension": "sedation_falls", "persona": "adult_65_plus", "points": 20}])
    r = s.score(product(A), prof(), tt, ALL)
    assert (r["score"], r["tier"]) == (80, "green")
    assert r["contributions"] == [{"dimension": "sedation_falls", "points": 20, "ingredient_uniis": [A], "citations": [CIT["cit_1"]]}]
    assert r["explanation"][0]["template_id"] == "sedation_falls_moderate"
    # other persona: no rows apply
    assert s.score(product(A), prof("adult_18_64"), tt, ALL)["score"] == 100


@pytest.mark.parametrize(
    "points,tier", [(25, "green"), (26, "yellow"), (50, "yellow"), (51, "red"), (100, "red")]
)
def test_tier_band_edges(points, tier):
    # Spread the points over dimensions (each row is at most 40, like severity 3).
    rows = [{"unii": A, "dimension": dim, "persona": "adult_65_plus", "points": p}
            for dim, p in zip(["liver", "kidney", "gi_bleeding"], _split(points))]
    r = s.score(product(A), prof(), tables(rows), ALL)
    assert (r["score"], r["tier"]) == (100 - points, tier)


def _split(total):
    parts = []
    while total > 0:
        parts.append(min(40, total))
        total -= parts[-1]
    return parts


def test_clamps_at_zero():
    rows = [{"unii": A, "dimension": d, "persona": "adult_65_plus", "points": 40} for d in ["liver", "kidney", "gi_bleeding"]]
    assert s.score(product(A), prof(), tables(rows), ALL)["score"] == 0


def test_condition_and_medication_modifiers_add_to_the_base_row():
    tt = tables([
        {"unii": A, "dimension": "cardiovascular_bp", "persona": "adult_65_plus", "points": 8},
        {"unii": A, "dimension": "cardiovascular_bp", "persona": "adult_65_plus", "condition": "hypertension", "points": 20},
        {"unii": A, "dimension": "gi_bleeding", "persona": "adult_65_plus", "medication_type": "anticoagulants", "points": 40},
        {"unii": A, "dimension": "cardiovascular_bp", "persona": "adult_18_64", "condition": "hypertension", "points": 40},
    ])
    assert s.score(product(A), prof(), tt, ALL)["score"] == 92
    assert s.score(product(A), prof(conditions=["hypertension"]), tt, ALL)["score"] == 72
    r = s.score(product(A), prof(conditions=["hypertension"], meds=["anticoagulants"]), tt, ALL)
    assert (r["score"], r["tier"]) == (32, "red")


# max = 20 | max_plus_stacking = 20 + 5 for each of the 2 other scoring ingredients = 30 | sum = 36
@pytest.mark.parametrize("method,expected", [("max", 80), ("max_plus_stacking", 70), ("sum", 64)])
def test_combine_methods(method, expected):
    rows = [
        {"unii": A, "dimension": "sedation_falls", "persona": "adult_65_plus", "points": 20},
        {"unii": B, "dimension": "sedation_falls", "persona": "adult_65_plus", "points": 8},
        {"unii": C, "dimension": "sedation_falls", "persona": "adult_65_plus", "points": 8},
    ]
    r = s.score(product(A, B, C), prof(), tables(rows, method=method), ALL)
    assert r["score"] == expected
    assert r["contributions"][0]["ingredient_uniis"] == [A, B, C]


def test_stacking_ignores_ingredients_without_points():
    rows = [{"unii": A, "dimension": "liver", "persona": "adult_65_plus", "points": 20},
            {"unii": B, "dimension": "kidney", "persona": "adult_65_plus", "points": 8}]
    assert s.score(product(A, B), prof(), tables(rows), ALL)["score"] == 72  # no stacking across dimensions


def test_hard_stops():
    stops = [
        {"id": "hs_any_persona", "unii": B},
        {"id": "hs_65_only", "unii": A, "personas": ["adult_65_plus"]},
        {"id": "hs_needs_condition", "unii": C, "condition": "glaucoma"},
        {"id": "hs_needs_med", "unii": C, "medication_type": "anticoagulants"},
        {"id": "hs_product", "ndc11": "00000000009"},
    ]
    tt = tables([], stops)
    assert s.score(product(B), prof("adult_18_64"), tt, ALL)["hard_stops_triggered"] == ["hs_any_persona"]
    assert s.score(product(A), prof("adult_18_64"), tt, ALL)["tier"] == "green"
    r = s.score(product(A), prof(), tt, ALL)
    assert (r["score"], r["tier"], r["hard_stops_triggered"]) == (100, "red", ["hs_65_only"])
    assert r["explanation"][0]["template_id"] == "hs_msg"  # hard stop reason first
    assert s.score(product(C), prof(), tt, ALL)["tier"] == "green"
    assert s.score(product(C), prof(conditions=["glaucoma"]), tt, ALL)["hard_stops_triggered"] == ["hs_needs_condition"]
    assert s.score(product(C), prof(meds=["anticoagulants"]), tt, ALL)["hard_stops_triggered"] == ["hs_needs_med"]
    assert s.score(product(A, ndc11="00000000009"), prof("adult_18_64"), tt, ALL)["hard_stops_triggered"] == ["hs_product"]


def test_unrated_never_gets_a_tier():
    tt = tables([{"unii": A, "dimension": "liver", "persona": "adult_65_plus", "points": 8}])
    r = s.score(product(A, B), prof(), tt, {A})
    assert r == {"ndc11": "00000000001", "status": "unrated", "missing": [B]}
    # rated with no rows is a real 100, not unrated
    assert s.score(product(B), prof(), tt, {A, B})["score"] == 100


def test_templates_fill_ingredient_names():
    rows = [{"unii": A, "dimension": "liver", "persona": "adult_65_plus", "points": 40},
            {"unii": B, "dimension": "liver", "persona": "adult_65_plus", "points": 8}]
    r = s.score(product(A, B), prof(), tables(rows), ALL, {"liver_high": "Contains {ingredient}."})
    assert r["explanation"][0] == {"template_id": "liver_high", "text": "Contains ing1 and ing2.", "citations": [CIT["cit_1"]]}


@pytest.mark.parametrize("points,b", [(8, "low"), (14, "low"), (15, "moderate"), (34, "moderate"), (35, "high")])
def test_bands(points, b):
    assert s.band(points) == b


def test_property_adding_a_condition_or_medication_never_raises_a_score():
    rng = random.Random(7)
    personas = ["adult_18_64", "adult_65_plus"]
    conds = ["hypertension", "kidney_disease", "glaucoma", "enlarged_prostate"]
    dims = ["liver", "kidney", "gi_bleeding", "sedation_falls", "cardiovascular_bp"]
    for _ in range(200):
        rows = []
        for u, d, p in itertools.product([A, B, C], dims, personas):
            if rng.random() < 0.3:
                rows.append({"unii": u, "dimension": d, "persona": p, "points": rng.choice([8, 20, 40])})
            if rng.random() < 0.2:
                rows.append({"unii": u, "dimension": d, "persona": p, "condition": rng.choice(conds), "points": rng.choice([8, 20, 40])})
            if rng.random() < 0.1:
                rows.append({"unii": u, "dimension": d, "persona": p, "medication_type": "anticoagulants", "points": 20})
        tt = tables(rows, method=rng.choice(["max", "max_plus_stacking", "sum"]))
        prod = product(*rng.sample([A, B, C], rng.randint(1, 3)))
        base = prof(rng.choice(personas), rng.sample(conds, rng.randint(0, 2)))
        before = s.score(prod, base, tt, ALL)["score"]
        more = {**base, "conditions": base["conditions"] + [c for c in conds if c not in base["conditions"]][:1]}
        assert s.score(prod, more, tt, ALL)["score"] <= before
        with_med = {**base, "medication_types": ["anticoagulants"]}
        assert s.score(prod, with_med, tt, ALL)["score"] <= before


def test_repo_golden_vectors_match():
    assert s.check_golden() == []


# ---------- validate_data ----------


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(s, "DATA", tmp_path)
    monkeypatch.setattr(vd, "DATA", tmp_path)
    return tmp_path


def _write(d, name, obj):
    (d / name).write_text(json.dumps(obj))


def test_validator_passes_good_data_and_catches_bad(data_dir, capsys):
    tt = tables([{"unii": A, "dimension": "liver", "persona": "adult_65_plus", "points": 8}])
    tt["citations"] = {"cit_1": {"source": "fda_label", "document_id": "11111111-2222-3333-4444-555555555555", "section": "Warnings", "quote": "Liver warning"}}
    _write(data_dir, "term_tables.json", tt)
    _write(data_dir, "rated_ingredients.json", [{"unii": A, "name": "ingA"}])
    _write(data_dir, "templates.json", {"liver_low": "{ingredient} a", "liver_moderate": "b", "liver_high": "c"})
    _write(data_dir, "questions.json", {"liver": ["Is {ingredient} ok?"]})
    assert vd.main([]) == 0

    tt["citations"]["cit_1"].pop("quote")
    tt["terms"].append({"unii": B, "dimension": "liver", "persona": "adult_65_plus", "points": 8, "citation_ids": ["nope"]})
    tt["base_score"] = 90
    _write(data_dir, "term_tables.json", tt)
    _write(data_dir, "templates.json", {"liver_low": "{drug}"})
    capsys.readouterr()
    assert vd.main([]) == 1
    out = capsys.readouterr().out
    for expected in ["needs a section and a short exact quote", "cites missing nope", "UNII BBBBBBBBB2 has rows",
                     "base_score is 90", "no sentence for liver_high", "placeholder other than"]:
        assert expected in out, expected
