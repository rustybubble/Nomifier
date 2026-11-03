"""Nomifier FastAPI app: REST API, Bot callbacks, static data and the PWA, all on one origin.

Run: uv run uvicorn server.main:app --host 127.0.0.1 --port 8000
"""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from server import bots

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
MEDIA_DIR = ROOT / "media"
WEB_DIST = ROOT / "web" / "dist"

app = FastAPI(title="Nomifier")

cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
if cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


# A4: Bot API (find / unknown / callbacks / approvals).
app.include_router(bots.router)

# B2: the recognition server mounts WebSocket /ws/scan here, e.g.
#   from vision.realtime import router as scan_router
#   app.include_router(scan_router)

MEDIA_DIR.mkdir(exist_ok=True)
app.mount("/data", StaticFiles(directory=DATA_DIR, check_dir=False), name="data")
app.mount("/media", StaticFiles(directory=MEDIA_DIR), name="media")
# Mounted last: "/" catches everything else. Serves C's production build (pnpm --dir web build).
app.mount("/", StaticFiles(directory=WEB_DIST, html=True, check_dir=False), name="web")
