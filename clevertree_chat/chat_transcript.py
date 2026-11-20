"""Batch accept path: minimize irc_log segments into pages/<page>/chat/ JSONL.

Uses users/index.json short ids — UUID only in the master index.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from clevertree_chat.rules import Rules


def chat_store_mode(rules: Rules) -> str:
    """full | never | summaries — default full when unset."""
    return getattr(rules, "chat_store", "full") or "full"


def minimize_line(row: dict[str, Any], short_id: int) -> dict[str, Any]:
    ts = str(row.get("ts") or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    body = str(row.get("body") or "").strip()
    return {"t": ts, "u": int(short_id), "b": body}


def day_key_from_ts(ts: str) -> str:
    raw = (ts or "")[:10]
    if len(raw) == 10 and raw[4] == "-" and raw[7] == "-":
        return raw
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def accept_irc_log_job(
    debate,
    job: dict[str, Any],
    *,
    rules: Rules | None = None,
) -> dict[str, Any]:
    """Register visitors, append minimized lines under pages/<page>/chat/.

    Returns a result dict: {ok, stored, skipped, reason, path?}.
    """
    mode = chat_store_mode(rules or debate.rules())
    topic = str(job.get("topic") or "").strip()
    if not topic:
        return {"ok": False, "stored": 0, "skipped": 0, "reason": "missing topic"}

    payload = Path(str(job.get("payload_path") or ""))
    if not payload.is_file():
        ref = str(job.get("payload_ref") or "")
        # intake://irc-logs/<topic>/<name>
        if ref.startswith("intake://irc-logs/"):
            from clevertree_chat.irc_log_cache import irc_logs_dir

            parts = ref[len("intake://irc-logs/") :].split("/", 1)
            if len(parts) == 2:
                payload = irc_logs_dir(parts[0]) / parts[1]
        if not payload.is_file():
            return {"ok": False, "stored": 0, "skipped": 0, "reason": "missing payload"}

    if mode == "never":
        return {
            "ok": True,
            "stored": 0,
            "skipped": _count_lines(payload),
            "reason": "chat_store:never",
        }

    if mode == "summaries":
        # Optional later — treat as skip write of raw transcript this pass.
        return {
            "ok": True,
            "stored": 0,
            "skipped": _count_lines(payload),
            "reason": "chat_store:summaries",
        }

    page = topic  # craft + review rooms use page==topic; batch may remap later
    lines_by_day: dict[str, list[str]] = {}
    stored = 0
    skipped = 0
    index_dirty = False

    for row in _iter_jsonl(payload):
        visitor = str(row.get("visitor") or "").strip()
        body = str(row.get("body") or "").strip()
        if not body:
            skipped += 1
            continue
        if not visitor:
            skipped += 1
            continue
        try:
            short_id = debate.ensure_user(visitor)
            index_dirty = True
        except Exception:
            skipped += 1
            continue
        mini = minimize_line(row, short_id)
        day = day_key_from_ts(str(mini["t"]))
        lines_by_day.setdefault(day, []).append(
            json.dumps(mini, separators=(",", ":"))
        )
        stored += 1

    if not lines_by_day:
        return {"ok": True, "stored": 0, "skipped": skipped, "reason": "empty after filter"}

    writes: dict[str, str] = {}
    # Re-read index after ensure_user commits (each ensure may have committed).
    # Final chat files are appended relative to current tree.
    repo_path = Path(debate.repo.path)
    written_paths: list[str] = []
    for day, new_lines in sorted(lines_by_day.items()):
        rel = f"pages/{page}/chat/{day}.jsonl"
        abs_path = repo_path / rel
        prev = ""
        if abs_path.is_file():
            prev = abs_path.read_text(encoding="utf-8")
            if prev and not prev.endswith("\n"):
                prev += "\n"
        elif rel in writes:
            prev = writes[rel]
        writes[rel] = prev + "\n".join(new_lines) + "\n"
        written_paths.append(rel)

    # ensure_user already committed index; only commit chat appends here
    if writes:
        debate.repo.commit_changes(
            writes,
            [],
            f"store irc chat log for {topic}",
            "clevertree-chat-ai",
        )

    return {
        "ok": True,
        "stored": stored,
        "skipped": skipped,
        "paths": written_paths,
        "index_touched": index_dirty,
        "reason": "chat_store:full",
    }


def _count_lines(path: Path) -> int:
    try:
        with path.open(encoding="utf-8") as fh:
            return sum(1 for line in fh if line.strip())
    except Exception:
        return 0


def _iter_jsonl(path: Path):
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except Exception:
                continue
