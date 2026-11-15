"""Spam court clocks (architecture locked; batch SI applies flags later).

Defaults from docs/spam.md: contest window X=48h, hide-to-remove Y=7d.
Repos may tighten via rules.md — never invent unsigned policy.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any


DEFAULT_CONTEST_HOURS = 48  # X
DEFAULT_HIDE_DAYS = 7  # Y


@dataclass(frozen=True)
class SpamClocks:
    contest_hours: int = DEFAULT_CONTEST_HOURS
    hide_days: int = DEFAULT_HIDE_DAYS

    @classmethod
    def from_rules(cls, rules: dict[str, Any] | None = None) -> "SpamClocks":
        rules = rules or {}
        spam = rules.get("spam") if isinstance(rules.get("spam"), dict) else rules
        x = int(spam.get("contest_hours") or spam.get("X") or DEFAULT_CONTEST_HOURS)
        y = int(spam.get("hide_days") or spam.get("Y") or DEFAULT_HIDE_DAYS)
        # Repos may tighten (shorten) only — never lengthen past defaults here.
        return cls(contest_hours=min(x, DEFAULT_CONTEST_HOURS), hide_days=min(y, DEFAULT_HIDE_DAYS))


def parse_ts(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        text = str(raw).replace("Z", "+00:00")
        return datetime.fromisoformat(text)
    except Exception:
        return None


def lifecycle_state(
    *,
    flagged_at: str | None,
    hidden_at: str | None = None,
    cleared: bool = False,
    now: datetime | None = None,
    clocks: SpamClocks | None = None,
) -> str:
    """Return visible | flagged | hidden | removed | clear."""
    if cleared:
        return "clear"
    clocks = clocks or SpamClocks()
    now = now or datetime.now(timezone.utc)
    flagged = parse_ts(flagged_at)
    if flagged is None:
        return "visible"
    contest_end = flagged + timedelta(hours=clocks.contest_hours)
    if now < contest_end and not hidden_at:
        return "flagged"
    hidden = parse_ts(hidden_at) or contest_end
    remove_at = hidden + timedelta(days=clocks.hide_days)
    if now < remove_at:
        return "hidden"
    return "removed"
