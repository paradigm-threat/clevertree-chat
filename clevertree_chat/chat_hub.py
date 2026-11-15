"""In-process WebSocket hub for Clevertree Chat (no scripted peer injection)."""

from __future__ import annotations

import json
import threading
from typing import Callable

BroadcastFn = Callable[[str, dict], None]


class ChatHub:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._subs: dict[str, set] = {}  # topic -> set of send callables

    def subscribe(self, topic: str, send: Callable[[str], None]) -> None:
        with self._lock:
            self._subs.setdefault(topic, set()).add(send)

    def unsubscribe(self, topic: str, send: Callable[[str], None]) -> None:
        with self._lock:
            bucket = self._subs.get(topic)
            if not bucket:
                return
            bucket.discard(send)
            if not bucket:
                self._subs.pop(topic, None)

    def broadcast(self, topic: str, event: dict) -> None:
        raw = json.dumps(event, separators=(",", ":"))
        with self._lock:
            sends = list(self._subs.get(topic) or ())
        dead = []
        for send in sends:
            try:
                send(raw)
            except Exception:
                dead.append(send)
        for send in dead:
            self.unsubscribe(topic, send)

    def cancel_timer(self, topic: str) -> None:
        """No-op kept for callers that cleared guided inject timers."""
        return None


HUB = ChatHub()


def activity_from_view(view: dict, visitor: str = "") -> list[dict]:
    """Flatten comments into minimized activity rows (newest last)."""
    rows: list[dict] = []
    seen = set()
    sections = view.get("sections") or {}
    bag = []
    for section in sections.values():
        for comment in section.get("comments") or []:
            cid = comment.get("id")
            if cid in seen:
                continue
            seen.add(cid)
            bag.append(comment)

    def _id_sort(comment: dict):
        raw = str(comment.get("id") or "0")
        if raw.isdigit():
            return (0, int(raw), "")
        tail = raw.rsplit("-", 1)[-1]
        if tail.isdigit():
            return (0, int(tail), raw)
        return (1, 0, raw)

    bag.sort(key=_id_sort)
    for comment in bag:
        keys = list(comment.get("keys") or [])
        rows.append(
            {
                "id": comment.get("id"),
                "author": comment.get("author") or "Visitor",
                "author_uuid": comment.get("author_uuid") or "",
                "body": comment.get("text") or "",
                "keys": [k for k in keys if k != "uncategorized"],
                "starting": comment.get("starting") or "uncategorized",
                "placed": True,
                "mine": bool(comment.get("mine")),
                "injected": False,
                "kind": "post",
            }
        )
    for notice in view.get("notices") or []:
        text = notice if isinstance(notice, str) else str(notice.get("text") or notice)
        if not text:
            continue
        rows.append(
            {
                "id": "notice-" + str(len(rows)),
                "author": "Batch",
                "author_uuid": "",
                "body": text,
                "keys": [],
                "starting": "",
                "placed": True,
                "mine": False,
                "injected": False,
                "kind": "batch",
            }
        )
    return rows
