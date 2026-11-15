"""Post-drain hooks: associations, spam court, optional live fetch, IRC asks."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from clevertree_chat.associations import (
    ASSOCIATIONS_FILE,
    add_alias,
    dump_graph,
    ensure_page,
    load_graph,
)
from clevertree_chat.fetch import fetch_enabled, fetch_url
from clevertree_chat.spam_court import SpamClocks, lifecycle_state

_URL_RE = re.compile(r"https?://[^\s)<>\"']+")
_Q_BULLET = re.compile(r"^-\s+(.+)$", re.M)


def after_drain(debate, *, topics: list[str] | None = None) -> dict[str, Any]:
    """Run best-effort hooks after a successful heuristic drain."""
    root = Path(debate.repo.path)
    notes: dict[str, Any] = {
        "associations": _refresh_associations(debate, root),
        "spam": _apply_spam_court(debate, root),
        "fetch": _fetch_suggested_counters(debate, root, topics or []),
        "questions": _collect_questions(root, topics or []),
    }
    _announce_questions_irc(notes.get("questions") or [])
    return notes


def _rules_dict(debate) -> dict[str, Any]:
    if not hasattr(debate, "rules"):
        return {}
    try:
        rules = debate.rules()
    except Exception:
        return {}
    if isinstance(rules, dict):
        return rules
    # Rules dataclass has no spam fields; defaults apply.
    return {}


def _refresh_associations(debate, root: Path) -> dict[str, Any]:
    graph = load_graph(root)
    pages_root = root / "pages"
    added = 0
    page_ids: list[str] = []
    if pages_root.is_dir():
        for page_dir in pages_root.iterdir():
            if not page_dir.is_dir() or page_dir.name.startswith("."):
                continue
            page_id = page_dir.name
            page_ids.append(page_id)
            kind = "url" if "." in page_id else "topic"
            ensure_page(graph, page_id, kind=kind)
            added += 1
    # Fold www. twin under bare host when both exist.
    ids = set(page_ids)
    for pid in page_ids:
        if pid.startswith("www.") and pid[4:] in ids:
            add_alias(graph, pid[4:], pid)
        elif f"www.{pid}" in ids and "." in pid:
            add_alias(graph, pid, f"www.{pid}")
    before = (root / ASSOCIATIONS_FILE).read_text() if (root / ASSOCIATIONS_FILE).is_file() else ""
    after = dump_graph(graph)
    if after != before:
        debate.repo.commit_changes(
            {ASSOCIATIONS_FILE: after},
            [],
            "batch refresh associations",
            "clevertree-chat-ai",
        )
    return {"pages": len(graph.get("pages") or {}), "touched": added}


def _apply_spam_court(debate, root: Path) -> dict[str, Any]:
    """Write spam-state.json beside flagged comments using court clocks."""
    clocks = SpamClocks.from_rules(_rules_dict(debate))
    updated = 0
    scanned = 0
    pages = root / "pages"
    if not pages.is_dir():
        return {"scanned": 0, "updated": 0}
    for meta in pages.rglob("spam.json"):
        scanned += 1
        try:
            data = json.loads(meta.read_text())
        except Exception:
            continue
        state = lifecycle_state(
            flagged_at=data.get("flagged_at") or data.get("flagged"),
            hidden_at=data.get("hidden_at"),
            cleared=bool(data.get("cleared")),
            clocks=clocks,
        )
        out = meta.with_name("spam-state.json")
        payload = {
            "state": state,
            "clocks": {
                "contest_hours": clocks.contest_hours,
                "hide_days": clocks.hide_days,
            },
        }
        text = json.dumps(payload, indent=2, sort_keys=True) + "\n"
        if not out.is_file() or out.read_text() != text:
            rel = out.relative_to(root).as_posix()
            debate.repo.commit_changes(
                {rel: text}, [], "batch spam court tick", "clevertree-chat-ai"
            )
            updated += 1
    return {"scanned": scanned, "updated": updated}


def _fetch_suggested_counters(debate, root: Path, topics: list[str]) -> dict[str, Any]:
    if not fetch_enabled():
        return {"enabled": False, "fetched": 0}
    fetched = 0
    writes: dict[str, str] = {}
    for path in root.rglob("suggested-counter.md"):
        if topics:
            # pages/<page>/topics/<topic>/...
            parts = path.relative_to(root).parts
            topic = parts[3] if len(parts) > 3 else ""
            if topic and topic not in topics and not any(t in path.as_posix() for t in topics):
                continue
        body = path.read_text(encoding="utf-8", errors="replace")
        urls = _URL_RE.findall(body)
        if not urls:
            continue
        results = [fetch_url(u).as_dict() for u in urls[:3]]
        out = path.with_name("suggested-counter.fetch.json")
        payload = {"url_count": len(urls), "results": results}
        text = json.dumps(payload, indent=2, sort_keys=True) + "\n"
        if not out.is_file() or out.read_text() != text:
            writes[out.relative_to(root).as_posix()] = text
            fetched += 1
    if writes:
        debate.repo.commit_changes(writes, [], "batch cite live counters", "clevertree-chat-ai")
    return {"enabled": True, "fetched": fetched}


def _collect_questions(root: Path, topics: list[str]) -> list[dict[str, str]]:
    asks: list[dict[str, str]] = []
    for path in root.rglob("questions.md"):
        parts = path.relative_to(root).as_posix()
        if topics and not any(f"/topics/{t}/" in parts or parts.endswith(f"/topics/{t}/questions.md") for t in topics):
            # Also allow page==topic review rooms
            if not any(f"pages/{t}/" in parts for t in topics):
                continue
        text = path.read_text(encoding="utf-8", errors="replace")
        bullets = _Q_BULLET.findall(text)
        if not bullets:
            continue
        topic = "unknown"
        segs = parts.split("/")
        if "topics" in segs:
            i = segs.index("topics")
            if i + 1 < len(segs):
                topic = segs[i + 1]
        asks.append({"topic": topic, "path": parts, "question": bullets[0][:280]})
    return asks[:20]


def _announce_questions_irc(asks: list[dict[str, str]]) -> None:
    if not asks:
        return
    try:
        from clevertree_chat import irc_bridge
    except Exception:
        return
    if not irc_bridge.enabled():
        return
    bridge = irc_bridge.get_bridge()
    if bridge is None:
        return
    for row in asks[:5]:
        topic = row.get("topic") or "general"
        q = row.get("question") or ""
        if not q:
            continue
        try:
            bridge.announce_submit(
                topic,
                f"SI ask: {q} — reply with: !answer <fact>",
                author="clevertree-si",
            )
        except Exception:
            pass
