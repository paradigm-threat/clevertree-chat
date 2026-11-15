#!/usr/bin/env python3
"""Seed a comments checkout with PT review fixtures (durable tree, not RAM)."""

from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from clevertree_chat.engine import Debate  # noqa: E402
from clevertree_chat.pt_seed import MAX_COMMENTS_PER_KEY, REVIEW_TOPICS, fixture_root  # noqa: E402
from clevertree_chat.store import materialize_auth, materialize_comments  # noqa: E402

# Keep Intake seed light — full SoT is CLEVERTREE_COMMENTS_PATH.
MAX_TOTAL = {"5g": 40, "geoengineering": 40, "general": 25}


def seed(dest: Path) -> None:
    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    debate = materialize_comments(dest, {})
    auth = materialize_auth(dest.parent / "auth", {}, b"clevertree-local-pepper")
    debate.attach_auth(auth)
    fixtures = fixture_root()
    if fixtures is None:
        print("no fixtures", file=sys.stderr)
        return
    for topic in REVIEW_TOPICS:
        path = fixtures / f"{topic}.json"
        if not path.is_file():
            continue
        topic_dir = dest / "pages" / topic / "topics" / topic
        if topic_dir.is_dir() and any(topic_dir.iterdir()):
            print(f"skip existing {topic}")
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        cap = MAX_TOTAL.get(topic, 30)
        per_key: dict[str, int] = {}
        count = 0
        for row in payload.get("comments") or []:
            if count >= cap:
                break
            body = (row.get("body") or "").strip()
            if not body:
                continue
            keys = row.get("keys") or []
            starting = (row.get("starting") or "").strip()
            key = starting if starting and starting != "uncategorized" else (keys[0] if keys else "")
            if key:
                limit = MAX_COMMENTS_PER_KEY.get(topic, 50)
                if per_key.get(key, 0) >= min(8, limit):
                    continue
                per_key[key] = per_key.get(key, 0) + 1
            visitor = (row.get("author_uuid") or "").strip() or str(uuid.uuid4())
            name = (row.get("author_name") or "Anonymous").strip() or "Anonymous"
            try:
                # File uncategorized; drain assigns keys (chosen must already exist).
                debate.submit(
                    visitor,
                    page=topic,
                    topic=topic,
                    body=body,
                    chosen=None,
                )
                debate.set_name(visitor, name)
                count += 1
            except Exception as exc:
                print(f"skip comment on {topic}: {exc}", file=sys.stderr)
        try:
            debate.drain()
        except Exception as exc:
            print(f"drain {topic}: {exc}", file=sys.stderr)
        print(f"seeded {topic}")


if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "var" / "clevertree-live" / "comments"
    seed(out)
