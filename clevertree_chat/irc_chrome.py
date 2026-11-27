"""IRC-derived channel chrome: TOPIC title + METADATA pin → WS payloads.

Privileged TOPIC/pin mutations only (ops / bridge / SI) — never anonymous.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any

from clevertree_chat.irc_client import (
    PIN_MSGID_KEY,
    normalize_channel,
    policy_title_for_channel,
    topic_for_channel,
)

log = logging.getLogger("clevertree.irc.chrome")

_lock = threading.RLock()
# topic slug -> { topic_text, pin: {...}|None, channel }
_chrome: dict[str, dict[str, Any]] = {}
_pin_refresh_at: dict[str, float] = {}
PIN_SI_REFRESH_MIN_S = 45.0


def _prefix() -> str:
    return (os.environ.get("CLEVERTREE_IRC_PREFIX") or "pt").strip() or "pt"


def get_chrome(topic: str) -> dict[str, Any]:
    t = (topic or "").strip().lower() or "web"
    with _lock:
        row = dict(_chrome.get(t) or {})
    if not row:
        from clevertree_chat.irc_client import channel_for_topic

        ch = channel_for_topic(_prefix(), t)
        row = {
            "channel": ch,
            "topic_text": "",
            "pin": None,
        }
    return row


def snapshot_for_hello(topic: str) -> dict[str, Any]:
    """Fields to merge into WS hello."""
    row = get_chrome(topic)
    return {
        "channel": row.get("channel") or "",
        "topic_text": row.get("topic_text") or "",
        "pin": row.get("pin"),
    }


def set_topic_local(topic: str, channel: str, topic_text: str) -> dict[str, Any]:
    t = (topic or "").strip().lower() or topic_for_channel(_prefix(), channel) or "web"
    ch = normalize_channel(channel)
    with _lock:
        row = _chrome.setdefault(
            t, {"channel": ch, "topic_text": "", "pin": None}
        )
        row["channel"] = ch or row.get("channel") or ""
        row["topic_text"] = (topic_text or "").strip()
        out = dict(row)
    _broadcast(t, "topic.update", out)
    return out


def set_pin_local(
    topic: str,
    channel: str,
    *,
    msgid: str,
    body: str = "",
    nick: str = "",
    at: str = "",
) -> dict[str, Any]:
    t = (topic or "").strip().lower() or topic_for_channel(_prefix(), channel) or "web"
    ch = normalize_channel(channel)
    mid = (msgid or "").strip()
    pin = None
    if mid:
        pin = {
            "msgid": mid,
            "body": (body or "").strip(),
            "nick": (nick or "").strip(),
            "at": (at or "").strip(),
        }
        if not pin["body"]:
            try:
                from clevertree_chat import irc_log_cache

                found = irc_log_cache.find_by_msgid(t, mid)
                if found:
                    pin["body"] = str(found.get("body") or found.get("text") or "")
                    pin["nick"] = pin["nick"] or str(found.get("nick") or "")
                    pin["at"] = pin["at"] or str(found.get("ts") or "")
            except Exception:
                pass
    with _lock:
        row = _chrome.setdefault(
            t, {"channel": ch, "topic_text": "", "pin": None}
        )
        row["channel"] = ch or row.get("channel") or ""
        row["pin"] = pin
        out = dict(row)
    _broadcast(t, "pin.update", out)
    _maybe_si_refresh(t, pin)
    return out


def clear_pin_local(topic: str, channel: str = "") -> dict[str, Any]:
    return set_pin_local(topic, channel, msgid="", body="")


def _broadcast(topic: str, typ: str, chrome: dict[str, Any]) -> None:
    try:
        from clevertree_chat.chat_hub import HUB

        HUB.broadcast(
            topic,
            {
                "type": typ,
                "topic": topic,
                "channel": chrome.get("channel") or "",
                "topic_text": chrome.get("topic_text") or "",
                "pin": chrome.get("pin"),
            },
        )
    except Exception as exc:
        log.debug("chrome broadcast failed: %s", exc)


def _maybe_si_refresh(topic: str, pin: dict[str, Any] | None) -> None:
    """Rate-limited soft SI refresh when pin changes (privileged path already gated)."""
    if not pin or not (pin.get("body") or "").strip():
        return
    if os.environ.get("CLEVERTREE_PIN_SI_REFRESH", "1").strip().lower() in {
        "0",
        "false",
        "no",
        "off",
    }:
        return
    now = time.time()
    with _lock:
        last = float(_pin_refresh_at.get(topic) or 0)
        if now - last < PIN_SI_REFRESH_MIN_S:
            return
        _pin_refresh_at[topic] = now
    try:
        from clevertree_chat import investigate

        focus = f"Pinned channel message: {pin.get('body')}"
        investigate.request_investigate(
            topic,
            focus=focus[:500],
            nick="clevertree-si",
            source="pin",
        )
    except Exception as exc:
        log.debug("pin SI refresh skipped: %s", exc)


def is_privileged_actor(*, visitor: str = "", nick: str = "", token: str = "") -> bool:
    """Anonymous cannot set TOPIC/pin. Bridge/SI/ops tokens may."""
    if (token or "").strip() and (token or "").strip() == (
        os.environ.get("CLEVERTREE_IRC_OPS_TOKEN") or ""
    ).strip():
        return bool((os.environ.get("CLEVERTREE_IRC_OPS_TOKEN") or "").strip())
    nick_l = (nick or "").strip().lower()
    bots = {
        n.strip().lower()
        for n in (
            os.environ.get(
                "CLEVERTREE_IRC_BOT_NICKS",
                "clevertree-si,clevertree-ai,clevertree,relay-bot",
            )
            or ""
        ).split(",")
        if n.strip()
    }
    bridge_nick = (os.environ.get("CLEVERTREE_IRC_NICK") or "clevertree-si").strip().lower()
    bots.add(bridge_nick)
    if nick_l and (nick_l in bots or nick_l.split("_")[0] in bots):
        return True
    # Explicit ops visitor allowlist (comma-separated UUIDs)
    allow = {
        v.strip()
        for v in (os.environ.get("CLEVERTREE_IRC_OPS_VISITORS") or "").split(",")
        if v.strip()
    }
    if (visitor or "").strip() and (visitor or "").strip() in allow:
        return True
    return False


def privileged_set_topic(topic: str, text: str, *, actor: dict[str, str] | None = None) -> dict[str, Any]:
    actor = actor or {}
    if not is_privileged_actor(
        visitor=actor.get("visitor") or "",
        nick=actor.get("nick") or "",
        token=actor.get("token") or "",
    ):
        return {"ok": False, "error": "forbidden"}
    from clevertree_chat.irc_bridge import get_bridge
    from clevertree_chat.irc_client import channel_for_topic

    ch = channel_for_topic(_prefix(), topic)
    bridge = get_bridge()
    client = bridge._client if bridge else None
    if client and client.ready:
        client.set_topic(ch, text)
    out = set_topic_local(topic, ch, text)
    return {"ok": True, **out}


def privileged_set_pin(
    topic: str,
    msgid: str,
    *,
    actor: dict[str, str] | None = None,
    body: str = "",
) -> dict[str, Any]:
    actor = actor or {}
    if not is_privileged_actor(
        visitor=actor.get("visitor") or "",
        nick=actor.get("nick") or "",
        token=actor.get("token") or "",
    ):
        return {"ok": False, "error": "forbidden"}
    from clevertree_chat.irc_bridge import get_bridge
    from clevertree_chat.irc_client import channel_for_topic

    ch = channel_for_topic(_prefix(), topic)
    mid = (msgid or "").strip()
    bridge = get_bridge()
    client = bridge._client if bridge else None
    if client and client.ready:
        if mid:
            client.set_pin(ch, mid)
        else:
            client.clear_pin(ch)
    out = set_pin_local(topic, ch, msgid=mid, body=body)
    return {"ok": True, **out}


def seed_topic_if_empty(topic: str, channel: str) -> None:
    """If Ergo TOPIC is empty, seed once from channel-policy title."""
    ch = normalize_channel(channel)
    t = (topic or "").strip().lower() or topic_for_channel(_prefix(), ch) or "web"
    with _lock:
        existing = (_chrome.get(t) or {}).get("topic_text") or ""
    if existing.strip():
        return
    from clevertree_chat.irc_bridge import get_bridge

    bridge = get_bridge()
    client = bridge._client if bridge else None
    if client:
        live = (client.get_topic(ch) or "").strip()
        if live:
            set_topic_local(t, ch, live)
            return
    title = policy_title_for_channel(ch)
    if not title:
        return
    if client and client.ready:
        client.set_topic(ch, title)
    set_topic_local(t, ch, title)


def on_bridge_topic(ev: dict[str, Any]) -> None:
    ch = normalize_channel(str(ev.get("channel") or ""))
    topic = topic_for_channel(_prefix(), ch)
    if not topic:
        return
    set_topic_local(topic, ch, str(ev.get("topic") or ""))


def on_bridge_metadata(ev: dict[str, Any]) -> None:
    key = str(ev.get("key") or "")
    if key != PIN_MSGID_KEY and not key.endswith("/pin-msgid"):
        return
    ch = normalize_channel(str(ev.get("target") or ""))
    topic = topic_for_channel(_prefix(), ch)
    if not topic:
        return
    value = str(ev.get("value") or "").strip()
    if not value:
        clear_pin_local(topic, ch)
        return
    set_pin_local(topic, ch, msgid=value)
