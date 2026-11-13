"""URL-safe one-liner keys. A sentence is not a key."""

from __future__ import annotations

import re

MAX_KEY_WORDS = 4

_SLUG_RE = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")


def slugify(text: str) -> str:
    """Lowercase, spaces and other separators become single hyphens."""
    lowered = text.strip().lower()
    lowered = lowered.replace("\u2019", "").replace("'", "")
    slug = re.sub(r"[^a-z0-9]+", "-", lowered).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    return slug


def assert_short_key(slug: str) -> str:
    """Reject anything that is not a short URL-safe one-liner."""
    if not slug or not _SLUG_RE.fullmatch(slug):
        raise ValueError(f"key is not url-safe: {slug!r}")
    if slug != slug.lower():
        raise ValueError(f"key must be lowercase: {slug!r}")
    if len(slug.split("-")) > MAX_KEY_WORDS:
        raise ValueError("sentence-length slug rejected")
    return slug


def is_sentence_slug(slug: str) -> bool:
    try:
        assert_short_key(slug)
    except ValueError as exc:
        return "sentence-length" in str(exc)
    return False
