"""Guided demo fixtures keyed by topic slug."""

from __future__ import annotations

from clevertree_chat.demos import flock_cameras, thc_legalization

DEMOS = {
    flock_cameras.TOPIC: flock_cameras,
    thc_legalization.TOPIC: thc_legalization,
}

DEFAULT_TOPIC = flock_cameras.TOPIC


def get_demo(topic: str):
    slug = (topic or "").strip() or DEFAULT_TOPIC
    demo = DEMOS.get(slug)
    if demo is None:
        raise ValueError("demo only supports " + ", ".join(sorted(DEMOS)))
    return demo


def known_topics() -> list[str]:
    return sorted(DEMOS)
