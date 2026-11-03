# Nomifier

**Nomify everything in view, live.** A live AR medicine scanner built on BDBI's [Nomi](https://github.com/gt-big-data/nomi).
See `Nomifier - final writeup.md` (the plan) and `Nomifier - 3-person implementation plan.md` (who builds what).

## Run it

```bash
uv sync
uv run uvicorn server.main:app --host 127.0.0.1 --port 8000
tailscale serve --bg 8000
```

Then open `https://<machine>.<tailnet>.ts.net` on the iPhone.

Tests: `uv run pytest`.
