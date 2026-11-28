"""Channel tracked-problem rows for the SI panel (display / batch-owned status)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parents[1]
_DEMO_PATH = _ROOT / "fronts" / "room" / "tracked-problems.demo.json"

_STATUS_OPEN = "open"
_STATUS_SOLVED = "solved"


def _norm_topic(topic: str) -> str:
    t = str(topic or "").strip()
    if t.startswith("#"):
        t = t[1:]
    return t


def load_demo_catalog(path: Path | None = None) -> dict[str, list[dict[str, Any]]]:
    p = path or _DEMO_PATH
    if not p.is_file():
        return {}
    try:
        data = json.loads(p.read_text(encoding="utf-8") or "{}")
    except Exception:
        return {}
    by_topic = data.get("by_topic") if isinstance(data, dict) else None
    if not isinstance(by_topic, dict):
        return {}
    out: dict[str, list[dict[str, Any]]] = {}
    for key, rows in by_topic.items():
        topic = _norm_topic(str(key))
        if not topic or not isinstance(rows, list):
            continue
        cleaned = [r for r in (_normalize_row(row) for row in rows) if r]
        if cleaned:
            out[topic] = cleaned
    return out


def _normalize_row(row: Any) -> dict[str, Any] | None:
    if not isinstance(row, dict):
        return None
    pid = str(row.get("id") or "").strip()
    title = str(row.get("title") or "").strip()
    if not pid or not title:
        return None
    status = str(row.get("status") or _STATUS_OPEN).strip().lower()
    if status in {"unsolved", "active", "open"}:
        status = _STATUS_OPEN
    elif status in {"solved", "done", "closed"}:
        status = _STATUS_SOLVED
    else:
        status = _STATUS_OPEN
    tip = row.get("tip_slug")
    tip_slug = str(tip).strip() if tip else None
    return {
        "id": pid,
        "title": title,
        "status": status,
        "updated_at": str(row.get("updated_at") or "").strip() or None,
        "summary": str(row.get("summary") or "").strip() or None,
        "tip_slug": tip_slug or None,
        "source": str(row.get("source") or "seed").strip() or "seed",
    }


def sort_tracked_problems(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Open first, then solved; newest updated_at within each group."""
    opens = [r for r in rows if str(r.get("status")) == _STATUS_OPEN]
    solved = [r for r in rows if str(r.get("status")) != _STATUS_OPEN]
    opens_sorted = sorted(opens, key=lambda r: str(r.get("updated_at") or ""), reverse=True)
    solved_sorted = sorted(solved, key=lambda r: str(r.get("updated_at") or ""), reverse=True)
    return opens_sorted + solved_sorted


def merge_tip_resolutions(
    rows: list[dict[str, Any]],
    tip_resolutions: dict[str, str] | None,
) -> list[dict[str, Any]]:
    """Overlay batch tip/ticket resolution onto rows that carry tip_slug."""
    if not tip_resolutions:
        return list(rows)
    out: list[dict[str, Any]] = []
    for row in rows:
        item = dict(row)
        slug = item.get("tip_slug")
        if slug and slug in tip_resolutions:
            res = str(tip_resolutions[slug] or "").strip().lower()
            if res in {"solved", "done", "closed"}:
                item["status"] = _STATUS_SOLVED
                item["source"] = "tip"
            elif res in {"unsolved", "open", "active"}:
                item["status"] = _STATUS_OPEN
                item["source"] = "tip"
        out.append(item)
    return out


def tracked_problems_for_topic(
    topic: str,
    *,
    tip_resolutions: dict[str, str] | None = None,
    catalog: dict[str, list[dict[str, Any]]] | None = None,
) -> list[dict[str, Any]]:
    cat = catalog if catalog is not None else load_demo_catalog()
    rows = list(cat.get(_norm_topic(topic)) or [])
    rows = merge_tip_resolutions(rows, tip_resolutions)
    return sort_tracked_problems(rows)
