"""Freeform URL-page boards for the extension (empty until typed).

No scripted peers. Filing uses light keyword heuristics; otherwise uncategorized.
"""

from __future__ import annotations

TOPIC = None  # dynamic — set per factory instance

POSITIONS: dict[str, str] = {
    "uncategorized": "These posts do not form one distinct argument yet.",
}

SUGGESTIONS: dict[str, dict] = {}

SCRIPT: list[dict] = []


def preview_suggestion(body: str, existing: list[str]) -> str | None:
    text = (body or "").lower()
    for key in existing:
        token = key.replace("-", " ")
        if token and token in text:
            return key
        if key.replace("-", "") and key.replace("-", "") in text.replace(" ", "").replace("-", ""):
            return key
    return None


def freeform_drain(text: str, state: dict) -> list[str]:
    lower = (text or "").lower()
    if len(lower.strip()) < 3:
        return ["uncategorized"]
    # Prefer an existing key if the body echoes it.
    for key in state.get("keys") or []:
        if key == "uncategorized":
            continue
        label = key.replace("-", " ")
        if label and label in lower:
            return [key]
    # Mint a short provisional key from the first few words when nothing matches.
    words = [w for w in "".join(ch if ch.isalnum() or ch.isspace() else " " for ch in lower).split() if len(w) > 2]
    if not words:
        return ["uncategorized"]
    slug = "-".join(words[:3])[:40].strip("-")
    if not slug:
        return ["uncategorized"]
    return [slug]


def after_freeform(state: dict) -> None:
    return None


def for_topic(topic: str):
    """Return a module-like demo object bound to a URL-derived topic slug."""

    class _Demo:
        TOPIC = topic
        POSITIONS = POSITIONS
        SUGGESTIONS = SUGGESTIONS
        SCRIPT = SCRIPT
        preview_suggestion = staticmethod(preview_suggestion)
        freeform_drain = staticmethod(freeform_drain)
        after_freeform = staticmethod(after_freeform)

    return _Demo()
