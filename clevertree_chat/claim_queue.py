"""Ephemeral claim queue — room traffic lands here; batch alone files SoT.

When ``CLEVERTREE_ROOM_QUEUE_ONLY`` is on, live submit enqueues claims and
fans out IRC/WS without ``engine._file`` / ``commit_changes``.
"""

from __future__ import annotations

import json
import os
import threading
import uuid as uuidlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from clevertree_chat.irc_log_cache import live_root

_lock = threading.RLock()


def room_queue_only() -> bool:
    """Default on: room is the claim queue; live API does not write comments git."""
    raw = (os.environ.get("CLEVERTREE_ROOM_QUEUE_ONLY") or "1").strip().lower()
    return raw not in {"0", "false", "off", "no"}


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def claims_dir() -> Path:
    path = live_root() / "queue" / "claims"
    path.mkdir(parents=True, exist_ok=True)
    return path


def enqueue_claim(
    *,
    topic: str,
    page: str,
    body: str,
    visitor: str,
    source: str = "web",
    nick: str = "",
    chosen: str | None = None,
    recommended: dict[str, Any] | list[Any] | None = None,
    inbox_refs: list[str] | None = None,
    client_post_id: str = "",
) -> dict[str, Any]:
    """Append a pending claim JSON for batch drain. Never writes comments SoT."""
    claim_id = str(uuidlib.uuid4())
    record = {
        "id": claim_id,
        "site": "clevertree",
        "kind": "claim",
        "page": page,
        "topic": (topic or "").strip(),
        "body": body or "",
        "visitor": visitor or "",
        "nick": nick or "",
        "source": source or "web",
        "chosen": chosen,
        "recommended": recommended or {},
        "inbox_refs": inbox_refs or [],
        "client_post_id": (client_post_id or "")[:128],
        "enqueued_at": _utc_now(),
        "status": "pending",
    }
    path = claims_dir() / f"{claim_id}.json"
    with _lock:
        path.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return record


def list_pending(*, limit: int = 100) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    root = claims_dir()
    for path in sorted(root.glob("*.json"), key=lambda p: p.stat().st_mtime):
        if len(out) >= limit:
            break
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if isinstance(data, dict) and data.get("status") == "pending":
            out.append(data)
    return out


def mark_status(claim_id: str, status: str) -> bool:
    path = claims_dir() / f"{claim_id}.json"
    if not path.is_file():
        return False
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return False
    if not isinstance(data, dict):
        return False
    data["status"] = status
    data["updated_at"] = _utc_now()
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return True
