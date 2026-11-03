# /// script
# requires-python = ">=3.11"
# dependencies = ["fastapi", "httpx", "pytest", "uvicorn[standard]"]
# ///
import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent))
import mock_ws


@pytest.fixture
def client():
    return TestClient(mock_ws.create_app())


def roundtrip(ws, fid=5, w=640, h=480):
    ws.send_json({"type": "frame", "frame_id": fid, "w": w, "h": h, "ts": 1})
    ws.send_bytes(b"\xff\xd8jpeg")
    return ws.receive_json()


def test_tracks_roundtrip(client):
    with client.websocket_connect("/ws/scan") as ws:
        r = roundtrip(ws, 42, 640, 480)
        assert r["type"] == "tracks" and r["frame_id"] == 42 and r["dropped"] == 0
        assert len(r["tracks"]) >= 6
        for t in r["tracks"]:
            x1, y1, x2, y2 = t["box"]
            assert 0 <= x1 < x2 <= 640 and 0 <= y1 < y2 <= 480
        assert {t["status"] for t in r["tracks"]} == {
            "named",
            "family",
            "unknown",
            "pending",
        }
        assert roundtrip(ws, 43)["frame_id"] == 43


def test_pin_and_crop_and_errors(client):
    with client.websocket_connect("/ws/scan") as ws:
        tid = next(t["id"] for t in roundtrip(ws)["tracks"] if t["status"] == "unknown")
        ws.send_json({"type": "pin", "track_id": tid, "product_id": "99999000505"})
        t = next(t for t in roundtrip(ws, 6)["tracks"] if t["id"] == tid)
        assert (t["status"], t["source"], t["similarity"], t["product_id"]) == (
            "named",
            "barcode",
            1.0,
            "99999000505",
        )
        ws.send_json({"type": "crop_request", "track_id": tid})
        assert ws.receive_json() == {
            "type": "crop",
            "track_id": tid,
            "crop_url": "/media/mock_crop.svg",
        }
        ws.send_text("not json")
        assert ws.receive_json()["type"] == "error"
        ws.send_json({"type": "pin", "track_id": tid, "product_id": "00000000000"})
        assert ws.receive_json()["type"] == "error"
        assert roundtrip(ws, 7)["frame_id"] == 7  # still open


def test_replay(tmp_path):
    f = tmp_path / "s.jsonl"
    f.write_text(
        json.dumps(
            {
                "type": "tracks",
                "frame_id": 0,
                "proc_ms": 9,
                "fps": 1,
                "dropped": 0,
                "tracks": [],
            }
        )
        + "\n"
    )
    with TestClient(mock_ws.create_app("replay", str(f))).websocket_connect(
        "/ws/scan"
    ) as ws:
        r = roundtrip(ws, 99)
        assert r["frame_id"] == 99 and r["proc_ms"] == 9


def test_data(client):
    r = client.get("/data/products.json")
    assert r.status_code == 200 and r.json()[0]["ndc11"].startswith("99999")
    assert client.get("/data/nope.json").status_code == 404
    assert client.get("/data/..%2FREADME.md").status_code == 404
    assert client.get("/data/%2e%2e%2ftools%2Fmock_ws.py").status_code == 404
    assert client.get("/data/README.md").status_code == 404
    assert "MOCK CROP" in client.get("/media/mock_crop.svg").text


def test_find_flow():
    now = [100.0]
    c = TestClient(mock_ws.create_app(clock=lambda: now[0]))
    fid = c.post("/api/find", json={"ndc11": "99999000303", "zip": "30332"}).json()[
        "find_id"
    ]
    assert fid == "f_1"
    assert c.get(f"/api/finds/{fid}").json()["status"] == "waiting"
    now[0] += 5.1
    r = c.get(f"/api/finds/{fid}").json()
    assert r["status"] == "done" and len(r["options"]) == 2 and r["cart"] == "pending"
    uid = c.post("/api/unknown", json={"crop_url": "/media/x.jpg"}).json()["job_id"]
    now[0] += 5.1
    assert c.get(f"/api/unknowns/{uid}").json()["product"]["brand_name"] == "MOCK"
    assert c.post("/api/approvals/x", json={"decision": "approve"}).json() == {
        "ok": True
    }


def test_validation(client):
    assert (
        client.post(
            "/api/find", json={"ndc11": "99999000303", "zip": "30332", "name": "x"}
        ).status_code
        == 422
    )
    assert (
        client.post("/api/find", json={"ndc11": "123", "zip": "30332"}).status_code
        == 422
    )
    assert (
        client.post(
            "/api/find", json={"ndc11": "99999000303", "zip": "3033"}
        ).status_code
        == 422
    )
    assert (
        client.post("/api/unknown", json={"crop_url": "/a", "extra": 1}).status_code
        == 422
    )
    assert (
        client.post(
            "/api/approvals/1", json={"decision": "approve", "x": 1}
        ).status_code
        == 422
    )
    assert client.get("/api/health").json() == {"ok": True}
