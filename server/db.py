"""SQLite store for Bot jobs (Aisle Finder finds, Coverage Clerk unknowns) and approvals.

One file, data/nomifier.db by default (env NOMIFIER_DB overrides it). Records hold only what the Bots get:
product IDs, ZIP codes, crop URLs and the Bots' results. Never anything about a person's health.
"""

import json
import os
import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

Kind = Literal["find", "unknown"]
Status = Literal["waiting", "done", "failed"]

_PREFIX = {"find": "f", "unknown": "u"}
_DEFAULT_PATH = Path(__file__).resolve().parent.parent / "data" / "nomifier.db"
_lock = threading.Lock()


def _path() -> Path:
    return Path(os.environ.get("NOMIFIER_DB", _DEFAULT_PATH))


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    """Opens the database, commits on success, rolls back on error, and always closes."""
    path = _path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS records (
            seq        INTEGER PRIMARY KEY AUTOINCREMENT,
            id         TEXT UNIQUE,
            kind       TEXT NOT NULL,
            status     TEXT NOT NULL,
            request    TEXT NOT NULL,
            result     TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS approvals (
            seq        INTEGER PRIMARY KEY AUTOINCREMENT,
            find_id    TEXT NOT NULL,
            decision   TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        """
    )
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def _public(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "status": row["status"],
        "result": json.loads(row["result"]) if row["result"] else None,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def create(kind: Kind, request: dict[str, Any]) -> str:
    """Creates a waiting record and returns its id, e.g. "f_1" or "u_3"."""
    now = _now()
    with _lock, _connect() as conn:
        cur = conn.execute(
            "INSERT INTO records (kind, status, request, created_at, updated_at) VALUES (?, 'waiting', ?, ?, ?)",
            (kind, json.dumps(request), now, now),
        )
        record_id = f"{_PREFIX[kind]}_{cur.lastrowid}"
        conn.execute("UPDATE records SET id = ? WHERE seq = ?", (record_id, cur.lastrowid))
    return record_id


def get(kind: Kind, record_id: str) -> dict[str, Any] | None:
    with _lock, _connect() as conn:
        row = conn.execute("SELECT * FROM records WHERE id = ? AND kind = ?", (record_id, kind)).fetchone()
    return _public(row) if row else None


def finish(
    kind: Kind, record_id: str, status: Status, result: dict[str, Any], only_if_waiting: bool = False
) -> bool:
    """Sets a record's status and result. Returns False if no such record (or, with only_if_waiting, if the
    record already finished: a Bot callback that beat a slow webhook error must not be overwritten)."""
    query = "UPDATE records SET status = ?, result = ?, updated_at = ? WHERE id = ? AND kind = ?"
    if only_if_waiting:
        query += " AND status = 'waiting'"
    with _lock, _connect() as conn:
        cur = conn.execute(query, (status, json.dumps(result), _now(), record_id, kind))
    return cur.rowcount == 1


def add_approval(find_id: str, decision: str) -> None:
    with _lock, _connect() as conn:
        conn.execute(
            "INSERT INTO approvals (find_id, decision, created_at) VALUES (?, ?, ?)", (find_id, decision, _now())
        )
