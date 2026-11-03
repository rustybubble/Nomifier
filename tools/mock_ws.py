# /// script
# requires-python = ">=3.11"
# dependencies = ["fastapi", "uvicorn[standard]"]
# ///
"""Nomifier mock recognition server (dev only). `uv run tools/mock_ws.py [--port 8001] [--session x.jsonl] [--delay-ms N]`"""

import argparse
import asyncio
import json
import math
import random
import re
import time
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, ConfigDict, Field
from starlette.websockets import WebSocketDisconnect

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "tools" / "fixtures"
DONE_AFTER_S = 5.0
NAME_RE = re.compile(r"^[A-Za-z0-9_.-]+\.json$")

# (base id, status, product_id, x freq, y freq, phase, width fraction)
SLOTS = [
    (1, "named", "99999000303", 0.31, 0.23, 0.0, 0.16),
    (2, "named", "99999000505", 0.27, 0.35, 1.3, 0.14),
    (3, "named", "99999000606", 0.22, 0.29, 2.6, 0.18),
    (4, "named", "99999000707", 0.37, 0.21, 3.9, 0.13),
    (5, "family", None, 0.25, 0.33, 5.1, 0.15),
    (6, "unknown", None, 0.29, 0.27, 0.7, 0.12),
    (7, "pending", None, 0.33, 0.25, 4.4, 0.17),  # turns named 99999000101 after 2 s
]
VANISH_START, VANISH_EVERY, VANISH_LEN = 10.0, 20.0, 3.0
VANISHABLE = [1, 2, 3, 4]


def data_path(name: str) -> Path | None:
    if not NAME_RE.fullmatch(name):
        return None
    for d in (ROOT / "data", FIXTURES):
        if (d / name).is_file():
            return d / name
    return None


def product_ids() -> set[str]:
    p = data_path("products.json")
    return {x["ndc11"] for x in json.loads(p.read_text())} if p else set()


def synth_tracks(
    t: float, w: int, h: int, frame_idx: int, first_seen: dict
) -> list[dict]:
    """Tracks at connection-time t seconds. Ids change after a slot's vanish/return."""
    out = []
    for base, status, pid, fx, fy, ph, wf in SLOTS:
        gen, hidden = 0, False
        k = 0
        while VANISH_START + VANISH_EVERY * k <= t:
            s = VANISH_START + VANISH_EVERY * k
            if VANISHABLE[k % len(VANISHABLE)] == base:
                if t < s + VANISH_LEN:
                    hidden = True
                else:
                    gen += 1
            k += 1
        if hidden:
            continue
        tid = base + 100 * gen
        family = None
        if status == "pending" and t >= 2.0:
            status, pid = "named", "99999000101"
        if status == "family":
            family = "dev-pain-line"
        bw = wf * w
        bh = bw * 1.5
        cx = w * (0.5 + 0.5 * (1 - 1.3 * wf) * math.sin(t * fx + ph))
        cy = h * (0.5 + 0.5 * (1 - 1.3 * bh / h) * math.sin(t * fy + ph * 1.7))
        x1 = min(max(cx - bw / 2, 0), w - bw)
        y1 = min(max(cy - bh / 2, 0), h - bh)
        first_seen.setdefault(tid, frame_idx)
        out.append(
            {
                "id": tid,
                "box": [
                    round(x1, 1),
                    round(y1, 1),
                    round(x1 + bw, 1),
                    round(min(y1 + bh, h), 1),
                ],
                "status": status,
                "product_id": pid,
                "family": family,
                "similarity": {
                    "named": 0.9,
                    "family": 0.6,
                    "unknown": 0.2,
                    "pending": 0.0,
                }[status],
                "source": "vision",
                "age": frame_idx - first_seen[tid],
            }
        )
    return out


class FindReq(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ndc11: str = Field(pattern=r"^[0-9]{11}$")
    zip: str = Field(pattern=r"^[0-9]{5}$")


class UnknownReq(BaseModel):
    model_config = ConfigDict(extra="forbid")
    crop_url: str


class ApprovalReq(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["approve", "reject"]


def create_app(
    mode="synthetic", session=None, delay_ms=0, clock=time.monotonic
) -> FastAPI:
    app = FastAPI(title="Nomifier mock")
    app.add_middleware(
        CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
    )
    replay = []
    if mode == "replay":
        replay = [
            json.loads(l) for l in Path(session).read_text().splitlines() if l.strip()
        ]
        if not replay:
            raise ValueError("empty session file")
    jobs: dict[str, tuple[float, str]] = {}  # id -> (created, kind)

    @app.websocket("/ws/scan")
    async def scan(ws: WebSocket):
        await ws.accept()
        t0 = clock()
        last_reply = None
        fps = 0.0
        header = None
        idx = 0
        pins: dict[int, str] = {}
        first_seen: dict = {}
        err = lambda m: ws.send_json({"type": "error", "message": m})
        try:
            while True:
                msg = await ws.receive()
                if msg["type"] == "websocket.disconnect":
                    return
                if msg.get("bytes") is not None:
                    if header is None:
                        await err("binary message without a frame header")
                        continue
                    h, header = header, None
                    t = clock() - t0
                    started = time.monotonic()
                    if mode == "replay":
                        reply = dict(replay[idx % len(replay)])
                        reply["tracks"] = [dict(x) for x in reply.get("tracks", [])]
                    else:
                        reply = {
                            "type": "tracks",
                            "dropped": 0,
                            "proc_ms": random.randint(20, 45),
                            "tracks": synth_tracks(t, h["w"], h["h"], idx, first_seen),
                        }
                    idx += 1
                    for tr in reply["tracks"]:
                        if tr["id"] in pins:
                            tr.update(
                                status="named",
                                source="barcode",
                                similarity=1.0,
                                product_id=pins[tr["id"]],
                                family=None,
                            )
                    if delay_ms:
                        await asyncio.sleep(delay_ms / 1000)
                    now = time.monotonic()
                    if last_reply is not None and now > last_reply:
                        inst = 1 / (now - last_reply)
                        fps = inst if fps == 0 else 0.7 * fps + 0.3 * inst
                    last_reply = now
                    reply.update(
                        type="tracks", frame_id=h["frame_id"], fps=round(fps, 1)
                    )
                    reply.setdefault("proc_ms", int((now - started) * 1000))
                    await ws.send_json(reply)
                    continue
                try:
                    m = json.loads(msg.get("text") or "")
                    kind = m["type"]
                except (ValueError, KeyError, TypeError):
                    await err("malformed JSON message")
                    continue
                if kind == "frame":
                    ok = (
                        all(
                            type(m.get(k)) is int and m[k] >= 0
                            for k in ("frame_id", "w", "h")
                        )
                        and m["w"] > 0
                        and m["h"] > 0
                    )
                    if not ok:
                        await err("bad frame header")
                        continue
                    header = m
                elif kind == "pin":
                    if (
                        type(m.get("track_id")) is int
                        and m.get("product_id") in product_ids()
                    ):
                        pins[m["track_id"]] = m["product_id"]
                    else:
                        await err("bad pin: unknown track_id/product_id")
                elif kind == "crop_request":
                    if type(m.get("track_id")) is int:
                        await ws.send_json(
                            {
                                "type": "crop",
                                "track_id": m["track_id"],
                                "crop_url": "/media/mock_crop.svg",
                            }
                        )
                    else:
                        await err("bad crop_request")
                else:
                    await err(f"unknown message type {kind!r}")
        except WebSocketDisconnect:
            return
        except RuntimeError:  # receive() after disconnect
            return

    @app.get("/data/catalog/families.json")
    def families():  # real path per contract; dev copy lives at tools/fixtures/families.json
        real = ROOT / "data" / "catalog" / "families.json"
        return FileResponse(
            real if real.exists() else FIXTURES / "families.json",
            media_type="application/json",
        )

    @app.get("/data/{name}")
    def data(name: str):
        p = data_path(name)
        if p is None:
            raise HTTPException(404)
        return FileResponse(p, media_type="application/json")

    @app.get("/media/mock_crop.svg")
    def crop():
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320">'
            '<rect width="240" height="320" fill="#ddd"/><rect x="8" y="8" width="224" height="304" '
            'fill="none" stroke="#888" stroke-width="4" stroke-dasharray="8"/>'
            '<text x="120" y="165" font-size="24" text-anchor="middle" font-family="sans-serif">MOCK CROP</text></svg>'
        )
        return Response(svg, media_type="image/svg+xml")

    @app.get("/api/health")
    def health():
        return {"ok": True}

    @app.get("/api/vision/health")
    def vision_health():
        return {
            "device": "mock",
            "detector": "mock",
            "embedder": "mock",
            "catalog_size": 7,
            "fps": 0.0,
        }

    def new_job(prefix: str, kind: str) -> str:
        jid = f"{prefix}_{len(jobs) + 1}"
        jobs[jid] = (clock(), kind)
        return jid

    def job(jid: str, kind: str) -> float:
        if jid not in jobs or jobs[jid][1] != kind:
            raise HTTPException(404)
        return jobs[jid][0]

    @app.post("/api/find")
    def find(req: FindReq):
        return {"find_id": new_job("f", "find")}

    @app.post("/api/unknown")
    def unknown(req: UnknownReq):
        return {"job_id": new_job("u", "unknown")}

    @app.get("/api/finds/{fid}")
    def get_find(fid: str):
        if clock() - job(fid, "find") < DONE_AFTER_S:
            return {"find_id": fid, "status": "waiting"}
        return {
            "find_id": fid,
            "status": "done",
            "cart": "pending",
            "evidence_url": None,
            "options": [
                {
                    "store": f"MOCK Pharmacy {i}",
                    "product": f"MOCK product {i}",
                    "ndc11": "99999000303",
                    "price": 4.99 + i,
                    "in_stock": i == 1,
                    "link": "https://example.com/mock",
                }
                for i in (1, 2)
            ],
        }

    @app.get("/api/unknowns/{uid}")
    def get_unknown(uid: str):
        if clock() - job(uid, "unknown") < DONE_AFTER_S:
            return {"job_id": uid, "status": "waiting"}
        return {
            "job_id": uid,
            "status": "done",
            "validated": True,
            "dailymed_setid": None,
            "pr_url": "https://github.com/example/nomifier/pull/0",
            "product": {
                "brand_name": "MOCK",
                "generic_name": "MOCK (not a real product)",
            },
        }

    @app.post("/api/approvals/{aid}")
    def approval(aid: str, req: ApprovalReq):
        return {"ok": True}

    return app


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8001)
    ap.add_argument("--session")
    ap.add_argument("--delay-ms", type=int, default=0)
    a = ap.parse_args()
    import uvicorn

    app = create_app("replay" if a.session else "synthetic", a.session, a.delay_ms)
    print(
        f"Nomifier MOCK server: http://localhost:{a.port}  ws://localhost:{a.port}/ws/scan  "
        f"health http://localhost:{a.port}/api/health  data http://localhost:{a.port}/data/products.json"
    )
    uvicorn.run(app, host="0.0.0.0", port=a.port)


if __name__ == "__main__":
    main()
