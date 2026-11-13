"""In-process WebSocket hub + guided demo director for Clevertree Chat."""

from __future__ import annotations

import json
import threading
import time
from typing import Callable

from clevertree_chat.demos import get_demo
from clevertree_chat.demos.personas import JORDAN, MAYA

# visitor-facing authors in guided demos (composer); peers are server-injected
VISITOR_NAMES = {MAYA["name"]}
PEER_NAMES = {JORDAN["name"]}

BroadcastFn = Callable[[str, dict], None]


class ChatHub:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._subs: dict[str, set] = {}  # topic -> set of send callables
        self._timers: dict[str, threading.Timer] = {}
        self._injecting: set[str] = set()

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
        with self._lock:
            timer = self._timers.pop(topic, None)
        if timer:
            timer.cancel()

    def schedule_peer_after_drain(self, topic: str, delay_s: float = 2.4) -> None:
        """If the next scripted beat is a peer, inject it after delay (server-side only)."""
        self.cancel_timer(topic)

        def fire() -> None:
            try:
                self._inject_next_peer(topic)
            finally:
                with self._lock:
                    self._timers.pop(topic, None)

        timer = threading.Timer(delay_s, fire)
        timer.daemon = True
        with self._lock:
            self._timers[topic] = timer
        timer.start()

    def _inject_next_peer(self, topic: str) -> None:
        from api import demo

        with self._lock:
            if topic in self._injecting:
                return
            self._injecting.add(topic)
        try:
            demo_mod = get_demo(topic)
            state = demo.board(topic)
            if state.get("pending"):
                return
            if state["step"] >= len(demo_mod.SCRIPT):
                return
            item = demo_mod.SCRIPT[state["step"]]
            if item["author"]["name"] in VISITOR_NAMES:
                return
            author = item["author"]
            result = demo.submit(
                topic,
                author["uuid"],
                item["body"],
                chosen=item.get("chosen") or None,
                name=author["name"],
            )
            pending = next(c for c in demo.board(topic)["comments"] if c["id"] == demo.board(topic)["pending"])
            pending["author_name"] = author["name"]
            pending["author_uuid"] = author["uuid"]
            pending["author_id"] = author["id"]
            pending["injected"] = True

            self.broadcast(
                topic,
                {
                    "type": "post.live",
                    "topic": topic,
                    "comment": _activity_comment(pending, visitor=""),
                    "view": result["view"],
                },
            )
            time.sleep(1.2)
            drained = demo.drain(topic, author["uuid"])
            self.broadcast(
                topic,
                {
                    "type": "batch.notice",
                    "topic": topic,
                    "notice": drained.get("batch_notice") or drained.get("message") or "",
                    "view": drained["view"],
                },
            )
            self.broadcast(
                topic,
                {"type": "board.snapshot", "topic": topic, "view": drained["view"]},
            )
            # Chain further peer beats if the script stacks them
            demo_mod = get_demo(topic)
            state = demo.board(topic)
            if state["step"] < len(demo_mod.SCRIPT):
                nxt = demo_mod.SCRIPT[state["step"]]
                if nxt["author"]["name"] in PEER_NAMES:
                    self.schedule_peer_after_drain(topic, delay_s=3.5)
        finally:
            with self._lock:
                self._injecting.discard(topic)


HUB = ChatHub()


def script_role(step: dict) -> str:
    name = step["author"]["name"]
    if name in PEER_NAMES:
        return "peer"
    return "visitor"


def _activity_comment(comment: dict, visitor: str) -> dict:
    keys = list(comment.get("keys") or [])
    return {
        "id": comment["id"],
        "author": comment.get("author_name") or "Visitor",
        "author_uuid": comment.get("author_uuid") or "",
        "body": comment.get("body") or "",
        "keys": keys,
        "starting": comment.get("starting") or "uncategorized",
        "placed": bool(comment.get("placed")),
        "mine": bool(visitor) and comment.get("author_uuid") == visitor,
        "injected": bool(comment.get("injected")),
        "kind": "post",
    }


def activity_from_view(view: dict, visitor: str = "") -> list[dict]:
    """Flatten comments into minimized activity rows (newest last)."""
    rows: list[dict] = []
    seen = set()
    sections = view.get("sections") or {}
    # Prefer chronological from a synthetic order: walk all section comments by id
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
        # Prefer trailing digits from seeded ids like "5g-other-7".
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
    notice = view.get("batch_notice") or (view.get("demo") or {}).get("notice") or ""
    if notice:
        rows.append(
            {
                "id": "batch-" + str((view.get("demo") or {}).get("step") or 0),
                "author": "Batch",
                "author_uuid": "",
                "body": notice,
                "keys": [],
                "starting": "",
                "placed": True,
                "mine": False,
                "injected": False,
                "kind": "batch",
            }
        )
    return rows
