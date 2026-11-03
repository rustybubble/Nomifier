import json
from collections.abc import Iterator
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from server import bots
from server.main import app

ROOT = Path(__file__).resolve().parents[2]
SAMPLE_PRODUCT = json.loads((ROOT / "vendor/nomi/samples/product.json").read_text())
BOT_TOKEN = "test-bot-token"


class Webhooks:
    """Records every webhook POST; `fail` makes them answer 500, `error` makes them raise."""

    def __init__(self) -> None:
        self.calls: list[dict] = []
        self.fail = False
        self.error: Exception | None = None

    def handler(self, request: httpx.Request) -> httpx.Response:
        if self.error is not None:
            raise self.error
        self.calls.append(
            {"url": str(request.url), "auth": request.headers.get("authorization"), "json": json.loads(request.content)}
        )
        return httpx.Response(500 if self.fail else 200, json={"ok": not self.fail})


@pytest.fixture
def webhooks(monkeypatch: pytest.MonkeyPatch) -> Webhooks:
    hooks = Webhooks()
    monkeypatch.setattr(bots, "TRANSPORT", httpx.MockTransport(hooks.handler))
    return hooks


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, webhooks: Webhooks) -> Iterator[TestClient]:
    data_dir = tmp_path / "data"
    media_dir = tmp_path / "media"
    data_dir.mkdir()
    media_dir.mkdir()
    (data_dir / "products.json").write_text(json.dumps([SAMPLE_PRODUCT]))
    (media_dir / "c_12_1730594400.jpg").write_bytes(b"\xff\xd8fake-jpeg")
    monkeypatch.setattr(bots, "DATA_DIR", data_dir)
    monkeypatch.setattr(bots, "MEDIA_DIR", media_dir)
    monkeypatch.setenv("NOMIFIER_DB", str(tmp_path / "test.db"))
    monkeypatch.setenv("BOT_TOKEN", BOT_TOKEN)
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://b.tailnet.ts.net/")
    monkeypatch.setenv("AISLE_FINDER_WEBHOOK_URL", "https://bots.example/aisle-finder")
    monkeypatch.setenv("AISLE_FINDER_WEBHOOK_KEY", "af-key")
    monkeypatch.setenv("COVERAGE_CLERK_WEBHOOK_URL", "https://bots.example/coverage-clerk")
    monkeypatch.setenv("COVERAGE_CLERK_WEBHOOK_KEY", "cc-key")
    with TestClient(app) as c:
        yield c
