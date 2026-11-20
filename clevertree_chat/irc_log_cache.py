"""Ephemeral IRC/WS chat log cache + batch enqueue for durable transcript jobs.

Server cache under var/clevertree-live/irc-logs/ may vanish. Durable SoT writes
happen only when the batch accepts an irc_log job into pages/<page>/chat/.
"""

from __future__ import annotations

import json
import os
import threading
import time
import uuid as uuidlib
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from clevertree_chat.irc_client import channel_for_topic

ROOT = Path(__file__).resolve().parents[1]

RING_MAX_LINES = 500
RING_MAX_AGE_S = 48 * 3600
SEGMENT_MAX_BYTES = 256 * 1024
SEGMENT_MAX_AGE_S = 3600

_lock = threading.RLock()
_rings: dict[str, deque[dict[str, Any]]] = {}
_segment_started: dict[str, float] = {}
_segment_bytes: dict[str, int] = {}


def live_root() -> Path:
    env = (os.environ.get("CLEVERTREE_LIVE_ROOT") or "").strip()
    if env:
        path = Path(env)
        path.mkdir(parents=True, exist_ok=True)
        return path
    path = ROOT / "var" / "clevertree-live"
    path.mkdir(parents=True, exist_ok=True)
    return path


def irc_logs_dir(topic: str | None = None) -> Path:
    base = live_root() / "irc-logs"
    base.mkdir(parents=True, exist_ok=True)
    if not topic:
        return base
    safe = _safe_topic(topic)
    path = base / safe
    path.mkdir(parents=True, exist_ok=True)
    return path


def queue_dir() -> Path:
    path = live_root() / "queue" / "irc_log"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _safe_topic(topic: str) -> str:
    t = (topic or "").strip().lower().replace("/", "-")
    t = "".join(ch for ch in t if ch.isalnum() or ch in "-_")[:64]
    return t or "general"


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _ring(topic: str) -> deque[dict[str, Any]]:
    key = _safe_topic(topic)
    if key not in _rings:
        _rings[key] = deque()
    return _rings[key]


def _prune_ring(ring: deque[dict[str, Any]]) -> None:
    cutoff = time.time() - RING_MAX_AGE_S
    while ring and (
        len(ring) > RING_MAX_LINES or float(ring[0].get("_epoch") or 0) < cutoff
    ):
        ring.popleft()


def recent(topic: str, *, limit: int | None = None) -> list[dict[str, Any]]:
    """Recent cached lines for WS replay (newest last). Strips internal _epoch."""
    with _lock:
        ring = list(_ring(topic))
        _prune_ring(_ring(topic))
        ring = list(_ring(topic))
    cap = limit if limit is not None else RING_MAX_LINES
    out = []
    for row in ring[-cap:]:
        clean = {k: v for k, v in row.items() if not str(k).startswith("_")}
        out.append(clean)
    return out


def append_line(
    topic: str,
    *,
    body: str,
    visitor: str,
    source: str = "web",
    nick: str = "",
    channel: str = "",
) -> dict[str, Any] | None:
    """Append one chat line to ring + current JSONL segment. Returns the row."""
    text = (body or "").strip()
    if not text:
        return None
    t = _safe_topic(topic)
    prefix = (os.environ.get("CLEVERTREE_IRC_PREFIX") or "pt").strip() or "pt"
    ch = channel or channel_for_topic(prefix, t)
    row: dict[str, Any] = {
        "ts": _utc_now(),
        "topic": t,
        "channel": ch,
        "visitor": (visitor or "").strip(),
        "nick": (nick or "").strip(),
        "body": text,
        "source": (source or "web").strip() or "web",
        "_epoch": time.time(),
    }
    line = json.dumps({k: v for k, v in row.items() if k != "_epoch"}, separators=(",", ":"))
    raw = (line + "\n").encode("utf-8")

    with _lock:
        ring = _ring(t)
        ring.append(row)
        _prune_ring(ring)

        topic_dir = irc_logs_dir(t)
        current = topic_dir / "current.jsonl"
        if t not in _segment_started:
            _segment_started[t] = time.time()
            _segment_bytes[t] = 0
            if current.is_file():
                _segment_bytes[t] = current.stat().st_size

        with current.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
        _segment_bytes[t] = int(_segment_bytes.get(t) or 0) + len(raw)

        should_rotate = _segment_bytes[t] >= SEGMENT_MAX_BYTES or (
            time.time() - float(_segment_started.get(t) or time.time()) >= SEGMENT_MAX_AGE_S
        )
        if should_rotate:
            _rotate_locked(t)

    return {k: v for k, v in row.items() if k != "_epoch"}


def _rotate_locked(topic: str) -> Path | None:
    """Close current.jsonl → seg-*.jsonl and enqueue irc_log job. Caller holds _lock."""
    t = _safe_topic(topic)
    topic_dir = irc_logs_dir(t)
    current = topic_dir / "current.jsonl"
    if not current.is_file() or current.stat().st_size == 0:
        _segment_started[t] = time.time()
        _segment_bytes[t] = 0
        return None

    seg_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuidlib.uuid4().hex[:8]
    dest = topic_dir / f"seg-{seg_id}.jsonl"
    current.replace(dest)
    _segment_started[t] = time.time()
    _segment_bytes[t] = 0
    _enqueue_segment_locked(t, dest, seg_id)
    return dest


def _enqueue_segment_locked(topic: str, segment: Path, seg_id: str) -> Path:
    t = _safe_topic(topic)
    prefix = (os.environ.get("CLEVERTREE_IRC_PREFIX") or "pt").strip() or "pt"
    job_id = str(uuidlib.uuid4())
    job = {
        "id": job_id,
        "site": "clevertree",
        "kind": "irc_log",
        "topic": t,
        "channel": channel_for_topic(prefix, t),
        "payload_ref": f"intake://irc-logs/{t}/{segment.name}",
        "payload_path": str(segment),
        "segment_id": seg_id,
        "enqueued_at": _utc_now(),
        "rules_ref": "comments:rules.md",
        "status": "pending",
    }
    path = queue_dir() / f"{job_id}.json"
    path.write_text(json.dumps(job, indent=2) + "\n", encoding="utf-8")
    marker = segment.with_suffix(segment.suffix + ".enqueued")
    marker.write_text(job_id + "\n", encoding="utf-8")
    return path


def rotate_if_needed(topic: str | None = None) -> list[Path]:
    """Rotate current segments that exceed size/age. topic=None → all open topics."""
    rotated: list[Path] = []
    with _lock:
        topics = [_safe_topic(topic)] if topic else list(_segment_started.keys())
        # also scan disk for current.jsonl without in-memory state
        if topic is None:
            base = irc_logs_dir()
            if base.is_dir():
                for child in base.iterdir():
                    if child.is_dir() and (child / "current.jsonl").is_file():
                        topics.append(child.name)
            topics = sorted(set(topics))
        for t in topics:
            cur = irc_logs_dir(t) / "current.jsonl"
            if not cur.is_file() or cur.stat().st_size == 0:
                continue
            started = float(_segment_started.get(t) or cur.stat().st_mtime)
            size = int(_segment_bytes.get(t) or cur.stat().st_size)
            if size >= SEGMENT_MAX_BYTES or (time.time() - started) >= SEGMENT_MAX_AGE_S:
                path = _rotate_locked(t)
                if path:
                    rotated.append(path)
    return rotated


def flush_topic(topic: str) -> Path | None:
    """Force-rotate current segment for a topic (drain / shutdown)."""
    with _lock:
        return _rotate_locked(_safe_topic(topic))


def list_pending_jobs() -> list[dict[str, Any]]:
    jobs = []
    q = queue_dir()
    for path in sorted(q.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if str(data.get("status") or "pending") == "pending":
                data["_job_path"] = str(path)
                jobs.append(data)
        except Exception:
            continue
    return jobs


def mark_job(job_path: str | Path, status: str, **extra: Any) -> None:
    path = Path(job_path)
    if not path.is_file():
        return
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return
    data["status"] = status
    data.update(extra)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
