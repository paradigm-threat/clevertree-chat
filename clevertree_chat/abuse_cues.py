"""Cheap CPU cues for obvious spam/scam — not a verdict, just SI context.

Batch SI / spam court still own standing policy. These cues only annotate
investigate prompts and ops probes so Free-tier text SI sees likely abuse.
"""

from __future__ import annotations

import re
from typing import Any

_SPAM = re.compile(
    r"("
    r"\b(viagra|cialis|crypto\s*airdrop|free\s*nitro|discord\.gg/\w+)\b|"
    r"\b(click\s*here|limited\s*time|act\s*now|double\s*your\s*money)\b|"
    r"\b(whatsapp\s*\+?\d|telegram\s*@|dm\s*me\s*for\s*(profit|investment))\b|"
    r"https?://\S*(bit\.ly|tinyurl|t\.me/\w+)"
    r")",
    re.I,
)

_FRAUD = re.compile(
    r"("
    r"\b(wire\s*transfer|gift\s*card|western\s*union|zelle\s*me)\b|"
    r"\b(send\s*(btc|eth|usdt|crypto)|seed\s*phrase|private\s*key)\b|"
    r"\b(irs\s*refund|account\s*suspended|verify\s*your\s*(bank|wallet))\b|"
    r"\b(nigerian?\s*prince|inheritance\s*claim)\b"
    r")",
    re.I,
)

_HARASS = re.compile(
    r"("
    r"\b(kill\s*yourself|kys)\b|"
    r"\b(doxx?|swat\s*him|rape\s*threat)\b"
    r")",
    re.I,
)


def scan_line(text: str) -> list[str]:
    """Return cue labels found in one line (may be empty)."""
    body = (text or "").strip()
    if not body:
        return []
    hits: list[str] = []
    if _SPAM.search(body):
        hits.append("spam")
    if _FRAUD.search(body):
        hits.append("scam/fraud")
    if _HARASS.search(body):
        hits.append("harassment")
    return hits


def scan_lines(lines: list[str], *, limit: int = 12) -> list[dict[str, Any]]:
    """Scan recent lines; return up to ``limit`` hits with truncated body."""
    out: list[dict[str, Any]] = []
    for raw in lines:
        hits = scan_line(raw)
        if not hits:
            continue
        out.append({"cues": hits, "line": (raw or "")[:180]})
        if len(out) >= limit:
            break
    return out
