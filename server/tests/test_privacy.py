"""Privacy rule (plan section 3): no request, WebSocket message, Bot payload or log line may carry persona, condition
or medication-type keys or values. The profile lives on the phone; the server only ever sees product IDs.

(a) No request model or webhook payload in server/ has a profile-shaped field.
(b) No Nomi persona / condition / medication_type value appears as a string literal in server code.
(c) web/src/api.ts (C's single network module) contains none of those keys or values.
"""

import ast
import inspect
import json
import re
from pathlib import Path
from typing import Any

import pytest
from pydantic import AliasChoices, BaseModel

from server import bots, db, main
from server.tests.conftest import SAMPLE_PRODUCT

ROOT = Path(__file__).resolve().parents[2]
COMMON = json.loads((ROOT / "vendor/nomi/schemas/common.schema.json").read_text())["$defs"]

FORBIDDEN_KEYS = {
    "persona",
    "personas",
    "profile",
    "profiles",
    "condition",
    "conditions",
    "medication",
    "medications",
    "medication_type",
    "medication_types",
}
FORBIDDEN_VALUES = set(COMMON["persona"]["enum"]) | set(COMMON["condition"]["enum"]) | set(
    COMMON["medication_type"]["enum"]
)
SERVER_MODULES = [bots, db, main]
SERVER_FILES = sorted(p for p in (ROOT / "server").glob("*.py"))


def _word_hits(text: str, words: set[str]) -> set[str]:
    return {w for w in words if re.search(rf"(?<![A-Za-z0-9_]){re.escape(w)}(?![A-Za-z0-9_])", text)}


def _model_field_names(model: type[BaseModel]) -> set[str]:
    names = set()
    for name, field in model.model_fields.items():
        names.add(name)
        if isinstance(field.alias, str):
            names.add(field.alias)
        alias = field.validation_alias
        if isinstance(alias, str):
            names.add(alias)
        elif isinstance(alias, AliasChoices):
            names.update(c for c in alias.choices if isinstance(c, str))
    return names


def _all_keys(value: Any) -> set[str]:
    if isinstance(value, dict):
        return set(value) | {k for v in value.values() for k in _all_keys(v)}
    if isinstance(value, list):
        return {k for v in value for k in _all_keys(v)}
    return set()


def _string_literals(source: str) -> list[str]:
    """Every string constant in the source except docstrings."""
    tree = ast.parse(source)
    docstrings = {
        id(node.body[0].value)
        for node in ast.walk(tree)
        if isinstance(node, ast.Module | ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef)
        and node.body
        and isinstance(node.body[0], ast.Expr)
        and isinstance(node.body[0].value, ast.Constant)
    }
    return [
        n.value
        for n in ast.walk(tree)
        if isinstance(n, ast.Constant) and isinstance(n.value, str) and id(n) not in docstrings
    ]


def _literal_violations(source: str) -> set[str]:
    hits = set()
    for s in _string_literals(source):
        hits |= _word_hits(s, FORBIDDEN_VALUES)
        if s in FORBIDDEN_KEYS:
            hits.add(s)
    return hits


# ---------- (a) request models and webhook payloads ----------


def _server_models() -> list[type[BaseModel]]:
    return [
        obj
        for module in SERVER_MODULES
        for _, obj in inspect.getmembers(module, inspect.isclass)
        if issubclass(obj, BaseModel) and obj.__module__ == module.__name__
    ]


def test_found_the_request_models():
    names = {m.__name__ for m in _server_models()}
    assert {"FindRequest", "UnknownRequest", "ApprovalRequest", "FindCallback", "UnknownCallback"} <= names


@pytest.mark.parametrize("model", _server_models(), ids=lambda m: m.__name__)
def test_request_models_have_no_profile_fields(model):
    assert not (_model_field_names(model) & FORBIDDEN_KEYS)
    assert model.model_config.get("extra") == "forbid", "request bodies must refuse unknown fields"


def test_webhook_payloads_have_no_profile_data(monkeypatch):
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://b.tailnet.ts.net")
    builders = [name for name in dir(bots) if name.startswith("build_") and name.endswith("_payload")]
    assert sorted(builders) == ["build_approval_payload", "build_find_payload", "build_unknown_payload"], (
        "a new webhook payload builder needs a case in this test"
    )
    # A product file that (wrongly) carried profile data must not leak it into the payload.
    leaky_product = {**SAMPLE_PRODUCT, "persona": "adult_65_plus", "conditions": ["hypertension"]}
    payloads = [
        bots.build_find_payload("f_1", leaky_product, "30332"),
        bots.build_unknown_payload("u_1", "/media/c_1.jpg"),
        bots.build_approval_payload("f_1", "approve"),
    ]
    for payload in payloads:
        assert not (_all_keys(payload) & FORBIDDEN_KEYS), payload
        assert not _word_hits(json.dumps(payload), FORBIDDEN_VALUES), payload


# ---------- (b) string literals in server code ----------


@pytest.mark.parametrize("path", SERVER_FILES, ids=lambda p: p.name)
def test_no_profile_literals_in_server_code(path):
    assert not _literal_violations(path.read_text()), f"{path.name} names profile data"


# ---------- (c) the PWA's network module ----------


def test_web_api_module_sends_no_profile_data():
    api_ts = ROOT / "web/src/api.ts"
    if not api_ts.exists():
        pytest.skip("web/src/api.ts not written yet (C3)")
    text = api_ts.read_text()
    hits = _word_hits(text, FORBIDDEN_KEYS | FORBIDDEN_VALUES)
    assert not hits, f"web/src/api.ts mentions {sorted(hits)}"


# ---------- the checks themselves catch violations ----------


def test_scanner_catches_planted_violations():
    bad = 'def f(p):\n    """Mentions hypertension in a docstring, which is allowed."""\n    return {"persona": p, "x": "glaucoma"}\n'
    assert _literal_violations(bad) == {"persona", "glaucoma"}
    assert _word_hits('send({ conditions: ["kidney_disease"] })', FORBIDDEN_KEYS | FORBIDDEN_VALUES) == {
        "conditions",
        "kidney_disease",
    }
    assert not _word_hits("profileChip personable", FORBIDDEN_KEYS)

    class Leaky(BaseModel):
        ndc11: str
        meds: list[str] = []

    Leaky.model_fields["meds"].validation_alias = "medications"
    assert _model_field_names(Leaky) & FORBIDDEN_KEYS == {"medications"}
