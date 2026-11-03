"""Bot API (contracts/api.md, REST section): the phone asks, a Grok Bot works, the Bot calls back.

Privacy rule: requests, webhook payloads, stored records and log lines carry only product IDs (NDC11), ZIP codes,
crop URLs, approval decisions and the Bots' results. Nothing about the person. server/tests/test_privacy.py
enforces this; keep every outgoing payload in a build_*_payload function so the test can see it.
"""

import hmac
import json
import logging
import os
from pathlib import Path
from typing import Any, Literal

import httpx
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException
from pydantic import AliasChoices, BaseModel, ConfigDict, Field

from server import db

log = logging.getLogger("nomifier.bots")
router = APIRouter(prefix="/api")

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
MEDIA_DIR = ROOT / "media"
WEBHOOK_TIMEOUT_S = 10.0
# Tests swap in an httpx.MockTransport here.
TRANSPORT: httpx.AsyncBaseTransport | None = None


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _callback_url(path: str) -> str:
    return _env("PUBLIC_BASE_URL").rstrip("/") + path


# ---------- request bodies (extra fields are rejected) ----------


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class FindRequest(_Strict):
    ndc11: str = Field(pattern=r"^[0-9]{11}$")
    zip: str = Field(pattern=r"^[0-9]{5}$")


class UnknownRequest(_Strict):
    crop_url: str = Field(pattern=r"^/media/[A-Za-z0-9._-]+$")


class ApprovalRequest(_Strict):
    decision: Literal["approve", "reject"]


class FindOption(_Strict):
    store: str
    product: str
    # The Aisle Finder instruction calls it ndc11_if_shown; the contract calls it ndc11. Accept both.
    ndc11: str | None = Field(default=None, validation_alias=AliasChoices("ndc11", "ndc11_if_shown"))
    price: float | str | None = None
    in_stock: bool | None = None
    link: str


class FindCallback(_Strict):
    options: list[FindOption]
    cart: str
    evidence_url: str | None = None


class UnknownCallback(_Strict):
    pr_url: str
    product: dict[str, Any]
    validated: bool
    dailymed_setid: str


class UnknownNotIdentified(_Strict):
    status: Literal["not_identified"]
    reason: str


# ---------- outgoing webhook payloads ----------


def _load_products() -> dict[str, dict[str, Any]]:
    path = DATA_DIR / "products.json"
    if not path.exists():
        return {}
    return {p["ndc11"]: p for p in json.loads(path.read_text())}


def build_find_payload(find_id: str, product: dict[str, Any], zip_code: str) -> dict[str, Any]:
    return {
        "find_id": find_id,
        "ndc11": product["ndc11"],
        "brand_name": product.get("brand_name"),
        "ingredients": [
            {"name": i.get("name"), "strength": i.get("strength"), "unit": i.get("unit")}
            for i in product.get("ingredients", [])
        ],
        "zip": zip_code,
        "callback_url": _callback_url(f"/api/finds/{find_id}"),
    }


def build_unknown_payload(job_id: str, crop_url: str) -> dict[str, Any]:
    return {
        "job_id": job_id,
        "crop_url": _env("PUBLIC_BASE_URL").rstrip("/") + crop_url,
        "repo": _env("NOMIFIER_REPO", "rustybubble/nomifier"),
        "callback_url": _callback_url(f"/api/unknowns/{job_id}"),
    }


def build_approval_payload(find_id: str, decision: str) -> dict[str, Any]:
    return {"find_id": find_id, "decision": decision}


async def _post_webhook(url_var: str, key_var: str, payload: dict[str, Any]) -> None:
    """POSTs payload to the Bot's webhook. Raises with a readable message on any failure."""
    url = _env(url_var)
    if not url:
        raise RuntimeError(f"{url_var} is not set")
    headers = {"Authorization": f"Bearer {_env(key_var)}"}
    async with httpx.AsyncClient(timeout=WEBHOOK_TIMEOUT_S, transport=TRANSPORT) as client:
        resp = await client.post(url, json=payload, headers=headers)
    if resp.status_code >= 400:
        raise RuntimeError(f"webhook answered HTTP {resp.status_code}")


async def _forward(kind: db.Kind, record_id: str, url_var: str, key_var: str, payload: dict[str, Any]) -> None:
    try:
        await _post_webhook(url_var, key_var, payload)
        log.info("forwarded %s %s", kind, record_id)
    except Exception as exc:  # any network or config failure marks the record failed, never crashes
        error = str(exc) or type(exc).__name__
        log.warning("forwarding %s %s failed: %s", kind, record_id, error)
        db.finish(kind, record_id, "failed", {"error": error}, only_if_waiting=True)


def _require_bot_token(authorization: str | None) -> None:
    token = _env("BOT_TOKEN")
    supplied = (authorization or "").removeprefix("Bearer ").strip()
    # An unset BOT_TOKEN rejects every callback rather than accepting an empty token.
    if not token or not hmac.compare_digest(supplied.encode(), token.encode()):
        raise HTTPException(status_code=401, detail="bad bot token")


def _get_or_404(kind: db.Kind, record_id: str) -> dict[str, Any]:
    record = db.get(kind, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"no {kind} {record_id}")
    return record


# ---------- routes ----------


@router.post("/find")
async def create_find(body: FindRequest, background: BackgroundTasks) -> dict[str, str]:
    product = _load_products().get(body.ndc11)
    if product is None:
        raise HTTPException(status_code=404, detail="product not in data/products.json")
    find_id = db.create("find", {"ndc11": body.ndc11, "zip": body.zip})
    payload = build_find_payload(find_id, product, body.zip)
    background.add_task(_forward, "find", find_id, "AISLE_FINDER_WEBHOOK_URL", "AISLE_FINDER_WEBHOOK_KEY", payload)
    return {"find_id": find_id}


@router.post("/unknown")
async def create_unknown(body: UnknownRequest, background: BackgroundTasks) -> dict[str, str]:
    file = MEDIA_DIR / body.crop_url.removeprefix("/media/")
    if not file.is_file():
        raise HTTPException(status_code=404, detail="crop not found in media/")
    job_id = db.create("unknown", {"crop_url": body.crop_url})
    payload = build_unknown_payload(job_id, body.crop_url)
    background.add_task(
        _forward, "unknown", job_id, "COVERAGE_CLERK_WEBHOOK_URL", "COVERAGE_CLERK_WEBHOOK_KEY", payload
    )
    return {"job_id": job_id}


@router.get("/finds/{find_id}")
def get_find(find_id: str) -> dict[str, Any]:
    return _get_or_404("find", find_id)


@router.get("/unknowns/{job_id}")
def get_unknown(job_id: str) -> dict[str, Any]:
    return _get_or_404("unknown", job_id)


@router.post("/finds/{find_id}")
def find_callback(find_id: str, body: FindCallback, authorization: str | None = Header(default=None)) -> dict:
    _require_bot_token(authorization)
    _get_or_404("find", find_id)
    db.finish("find", find_id, "done", body.model_dump())
    return {"ok": True}


@router.post("/unknowns/{job_id}")
def unknown_callback(
    job_id: str,
    body: UnknownCallback | UnknownNotIdentified,
    authorization: str | None = Header(default=None),
) -> dict:
    _require_bot_token(authorization)
    _get_or_404("unknown", job_id)
    db.finish("unknown", job_id, "done", body.model_dump())
    return {"ok": True}


@router.post("/approvals/{find_id}")
async def approve(find_id: str, body: ApprovalRequest) -> dict[str, Any]:
    record = _get_or_404("find", find_id)
    if record["status"] != "done":
        raise HTTPException(status_code=409, detail="Aisle Finder hasn't reported options yet")
    db.add_approval(find_id, body.decision)
    try:
        await _post_webhook(
            "AISLE_FINDER_WEBHOOK_URL", "AISLE_FINDER_WEBHOOK_KEY", build_approval_payload(find_id, body.decision)
        )
    except Exception as exc:
        log.warning("forwarding approval for %s failed: %s", find_id, exc)
        return {"ok": True, "forwarded": False, "error": str(exc) or type(exc).__name__}
    return {"ok": True, "forwarded": True}
