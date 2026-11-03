import httpx
import pytest

from server.tests.conftest import BOT_TOKEN, SAMPLE_PRODUCT

NDC = SAMPLE_PRODUCT["ndc11"]
AUTH = {"Authorization": f"Bearer {BOT_TOKEN}"}
FIND_RESULT = {
    "options": [
        {
            "store": "CVS, 10th St",
            "product": "CVS Health Acetaminophen 500 mg",
            "ndc11_if_shown": "59779011111",
            "price": 6.49,
            "in_stock": True,
            "link": "https://www.cvs.com/shop/example",
        }
    ],
    "cart": "pending",
    "evidence_url": "https://grok.example/run/1",
}


def test_health(client):
    assert client.get("/api/health").json() == {"ok": True}


def test_find_round_trip(client, webhooks):
    find_id = client.post("/api/find", json={"ndc11": NDC, "zip": "30332"}).json()["find_id"]
    assert find_id == "f_1"

    [call] = webhooks.calls
    assert call["url"] == "https://bots.example/aisle-finder"
    assert call["auth"] == "Bearer af-key"
    assert call["json"] == {
        "find_id": "f_1",
        "ndc11": NDC,
        "brand_name": SAMPLE_PRODUCT["brand_name"],
        "ingredients": [{"name": "acetaminophen", "strength": 500, "unit": "mg"}],
        "zip": "30332",
        "callback_url": "https://b.tailnet.ts.net/api/finds/f_1",
    }
    assert client.get(f"/api/finds/{find_id}").json()["status"] == "waiting"

    assert client.post(f"/api/finds/{find_id}", json=FIND_RESULT, headers=AUTH).status_code == 200
    record = client.get(f"/api/finds/{find_id}").json()
    assert record["status"] == "done"
    assert record["result"]["options"][0]["ndc11"] == "59779011111"
    assert record["result"]["cart"] == "pending"
    assert set(record) == {"id", "status", "result", "created_at", "updated_at"}


def test_approval_forwards_decision(client, webhooks):
    find_id = client.post("/api/find", json={"ndc11": NDC, "zip": "30332"}).json()["find_id"]
    # Too early: the Bot hasn't reported options yet.
    assert client.post(f"/api/approvals/{find_id}", json={"decision": "approve"}).status_code == 409

    client.post(f"/api/finds/{find_id}", json=FIND_RESULT, headers=AUTH)
    resp = client.post(f"/api/approvals/{find_id}", json={"decision": "approve"})
    assert resp.json() == {"ok": True, "forwarded": True}
    assert webhooks.calls[-1]["json"] == {"find_id": find_id, "decision": "approve"}
    assert client.post(f"/api/approvals/{find_id}", json={"decision": "maybe"}).status_code == 422
    assert client.post("/api/approvals/f_999", json={"decision": "reject"}).status_code == 404


def test_unknown_round_trip(client, webhooks):
    job_id = client.post("/api/unknown", json={"crop_url": "/media/c_12_1730594400.jpg"}).json()["job_id"]
    assert job_id == "u_1"
    [call] = webhooks.calls
    assert call["auth"] == "Bearer cc-key"
    assert call["json"] == {
        "job_id": "u_1",
        "crop_url": "https://b.tailnet.ts.net/media/c_12_1730594400.jpg",
        "repo": "rustybubble/nomifier",
        "callback_url": "https://b.tailnet.ts.net/api/unknowns/u_1",
    }

    done = {
        "pr_url": "https://github.com/rustybubble/nomifier/pull/9",
        "product": SAMPLE_PRODUCT,
        "validated": True,
        "dailymed_setid": SAMPLE_PRODUCT["spl_set_id"],
    }
    assert client.post(f"/api/unknowns/{job_id}", json=done, headers=AUTH).status_code == 200
    record = client.get(f"/api/unknowns/{job_id}").json()
    assert record["status"] == "done"
    assert record["result"]["pr_url"].endswith("/pull/9")


def test_unknown_not_identified(client):
    job_id = client.post("/api/unknown", json={"crop_url": "/media/c_12_1730594400.jpg"}).json()["job_id"]
    body = {"status": "not_identified", "reason": "label too blurry to read the strength"}
    assert client.post(f"/api/unknowns/{job_id}", json=body, headers=AUTH).status_code == 200
    assert client.get(f"/api/unknowns/{job_id}").json()["result"] == body


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Bearer wrong"}, {"Authorization": BOT_TOKEN + "x"}],
)
def test_callbacks_need_bot_token(client, headers):
    find_id = client.post("/api/find", json={"ndc11": NDC, "zip": "30332"}).json()["find_id"]
    assert client.post(f"/api/finds/{find_id}", json=FIND_RESULT, headers=headers).status_code == 401
    job_id = client.post("/api/unknown", json={"crop_url": "/media/c_12_1730594400.jpg"}).json()["job_id"]
    body = {"status": "not_identified", "reason": "x"}
    assert client.post(f"/api/unknowns/{job_id}", json=body, headers=headers).status_code == 401


def test_unset_bot_token_rejects_everything(client, monkeypatch):
    monkeypatch.setenv("BOT_TOKEN", "")
    find_id = client.post("/api/find", json={"ndc11": NDC, "zip": "30332"}).json()["find_id"]
    assert client.post(f"/api/finds/{find_id}", json=FIND_RESULT, headers={"Authorization": "Bearer "}).status_code == 401


@pytest.mark.parametrize(
    "body",
    [
        {"ndc11": "5058044902", "zip": "30332"},  # 10 digits
        {"ndc11": "5058004490a", "zip": "30332"},
        {"ndc11": NDC, "zip": "3033"},
        {"ndc11": NDC, "zip": "30332-1234"},
        {"ndc11": NDC, "zip": "30332", "persona": "adult_65_plus"},  # extra fields are refused
    ],
)
def test_find_validation(client, body):
    assert client.post("/api/find", json=body).status_code == 422


def test_find_unknown_product_404(client):
    assert client.post("/api/find", json={"ndc11": "00000000000", "zip": "30332"}).status_code == 404


@pytest.mark.parametrize("crop_url", ["/tmp/x.jpg", "/media/../server/main.py", "/media/sub/../../x.jpg"])
def test_unknown_rejects_paths_outside_media(client, crop_url):
    assert client.post("/api/unknown", json={"crop_url": crop_url}).status_code == 422


def test_unknown_missing_crop_404(client):
    assert client.post("/api/unknown", json={"crop_url": "/media/nope.jpg"}).status_code == 404


def test_webhook_http_error_marks_failed(client, webhooks):
    webhooks.fail = True
    find_id = client.post("/api/find", json={"ndc11": NDC, "zip": "30332"}).json()["find_id"]
    record = client.get(f"/api/finds/{find_id}").json()
    assert record["status"] == "failed"
    assert "HTTP 500" in record["result"]["error"]


def test_webhook_network_error_marks_failed(client, webhooks):
    webhooks.error = httpx.ConnectTimeout("timed out")
    job_id = client.post("/api/unknown", json={"crop_url": "/media/c_12_1730594400.jpg"}).json()["job_id"]
    record = client.get(f"/api/unknowns/{job_id}").json()
    assert record["status"] == "failed"
    assert "timed out" in record["result"]["error"]


def test_missing_webhook_url_marks_failed(client, monkeypatch):
    monkeypatch.setenv("AISLE_FINDER_WEBHOOK_URL", "")
    find_id = client.post("/api/find", json={"ndc11": NDC, "zip": "30332"}).json()["find_id"]
    assert client.get(f"/api/finds/{find_id}").json()["result"] == {"error": "AISLE_FINDER_WEBHOOK_URL is not set"}


def test_unknown_record_404(client):
    assert client.get("/api/finds/f_404").status_code == 404
    assert client.get("/api/unknowns/f_1").status_code == 404
