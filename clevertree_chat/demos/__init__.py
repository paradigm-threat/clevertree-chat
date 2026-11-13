"""Guided demo fixtures keyed by topic slug + freeform URL boards."""

from __future__ import annotations

from clevertree_chat.demos import flock_cameras, freeform, thc_legalization

DEMOS = {
    flock_cameras.TOPIC: flock_cameras,
    thc_legalization.TOPIC: thc_legalization,
}

DEFAULT_TOPIC = flock_cameras.TOPIC


def get_demo(topic: str):
    slug = (topic or "").strip() or DEFAULT_TOPIC
    demo = DEMOS.get(slug)
    if demo is not None:
        return demo
    # Extension / any-URL boards: empty until typed, no scripted peers.
    return freeform.for_topic(slug)


def known_topics() -> list[str]:
    return sorted(DEMOS)


def is_guided(topic: str) -> bool:
    return (topic or "").strip() in DEMOS
