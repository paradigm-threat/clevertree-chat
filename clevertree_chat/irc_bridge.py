"""Cleverchat ↔ Ergo IRC sync: PRIVMSG ↔ durable submit; WS fans out via live_runtime."""

from __future__ import annotations

import hashlib
import logging
import os
import threading
import time
import uuid as uuidlib
from typing import Any

from clevertree_chat.irc_client import IrcClient, channel_for_topic, topic_for_channel

log = logging.getLogger("clevertree.irc")

_bridge: "IrcBridge | None" = None
_lock = threading.RLock()


def enabled() -> bool:
    return os.environ.get("CLEVERTREE_IRC_ENABLE", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def get_bridge() -> "IrcBridge | None":
    return _bridge


class IrcBridge:
    def __init__(self) -> None:
        self.host = os.environ.get("CLEVERTREE_IRC_HOST", "flashbackrepository.org").strip()
        self.port = int(os.environ.get("CLEVERTREE_IRC_PORT", "6697") or "6697")
        self.tls = os.environ.get("CLEVERTREE_IRC_TLS", "1").strip().lower() not in {
            "0",
            "false",
            "no",
        }
        self.nick = (os.environ.get("CLEVERTREE_IRC_NICK") or "clevertree-si").strip()[:24]
        self.prefix = (os.environ.get("CLEVERTREE_IRC_PREFIX") or "pt").strip() or "pt"
        self._client: IrcClient | None = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._echo_ids: set[str] = set()  # recent outbound fingerprints to skip echo
        self._joined: set[str] = set()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="irc-bridge", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._client:
            self._client.close()

    def ensure_channel(self, topic: str) -> str:
        ch = channel_for_topic(self.prefix, topic)
        client = self._client
        if client and client.ready and ch not in self._joined:
            client.join(ch)
            self._joined.add(ch)
        return ch

    def announce_submit(self, topic: str, body: str, author: str = "") -> None:
        """Board/API submit → IRC PRIVMSG (skip if we originated from IRC)."""
        text = (body or "").strip()
        if not text:
            return
        fp = _fingerprint(topic, text)
        if fp in self._echo_ids:
            self._echo_ids.discard(fp)
            return
        client = self._client
        if not client or not client.ready:
            return
        ch = self.ensure_channel(topic)
        label = (author or "").strip()
        msg = f"<{label}> {text}" if label else text
        out_fp = _fingerprint(topic, text)
        self._echo_ids.add(out_fp)
        client.privmsg(ch, msg)
        # expire fingerprint shortly
        threading.Timer(30.0, lambda: self._echo_ids.discard(out_fp)).start()

    def _run(self) -> None:
        backoff = 2.0
        while not self._stop.is_set():
            try:
                client = IrcClient(
                    host=self.host,
                    port=self.port,
                    nick=self.nick,
                    user="clevertree",
                    real="Cleverchat durable bridge",
                    tls=self.tls,
                    on_privmsg=self._on_privmsg,
                )
                self._client = client
                client.connect(timeout=25.0)
                backoff = 2.0
                log.info("IRC connected %s:%s as %s", self.host, self.port, client.nick)
                # Seed PT review + starter channels
                for topic in (
                    "general",
                    "5g",
                    "geoengineering",
                    "flock-cameras",
                    "thc-legalization",
                ):
                    self.ensure_channel(topic)
                lobby = channel_for_topic(self.prefix, "")
                client.join(lobby)
                self._joined.add(lobby)
                while not self._stop.is_set() and client.ready:
                    time.sleep(1.0)
                client.close()
            except Exception as exc:
                log.warning("IRC bridge reconnect: %s", exc)
            self._client = None
            self._joined.clear()
            if self._stop.wait(backoff):
                break
            backoff = min(backoff * 1.5, 60.0)

    def _on_privmsg(self, msg: dict[str, str]) -> None:
        nick = (msg.get("nick") or "").strip()
        target = msg.get("target") or ""
        text = (msg.get("text") or "").strip()
        if not text or not target.startswith("#"):
            return
        client = self._client
        if client and nick.lower() == client.nick.lower():
            return
        # Skip CTCP / commands
        if text.startswith("\x01") or text.startswith("!"):
            return
        topic = topic_for_channel(self.prefix, target)
        if not topic:
            return
        # Strip optional <nick> wrapper if someone pasted board format
        body = text
        if body.startswith("<") and "> " in body[:40]:
            body = body.split("> ", 1)[1]
        fp = _fingerprint(topic, body)
        self._echo_ids.add(fp)
        try:
            self._submit_from_irc(topic, body, nick)
        except Exception as exc:
            log.warning("IRC→submit failed: %s", exc)
            self._echo_ids.discard(fp)

    def _submit_from_irc(self, topic: str, body: str, nick: str) -> None:
        from clevertree_chat import live_runtime as live

        visitor = _visitor_for_nick(nick)
        # Ensure page exists
        live.resolve_page(url=f"irc://{self.prefix}/{topic}", visitor=visitor)
        code, result = live.dispatch(
            {
                "action": "submit",
                "topic": topic,
                "visitor": visitor,
                "body": body,
                "name": nick[:40] or None,
            },
            {},
            "",
        )
        if code != 200:
            raise RuntimeError(result.get("error") or f"submit {code}")
        live.fanout_submit(topic, visitor, result if isinstance(result, dict) else {})
        # fanout_submit already broadcasts; ensure channel joined
        self.ensure_channel(topic)


def _fingerprint(topic: str, body: str) -> str:
    raw = f"{topic}\0{body.strip()}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:24]


def _visitor_for_nick(nick: str) -> str:
    """Stable UUID5 for IRC nick → Cleverchat visitor."""
    return str(uuidlib.uuid5(uuidlib.NAMESPACE_URL, f"irc:clevertree:{nick.lower()}"))


def start_bridge() -> IrcBridge | None:
    global _bridge
    if not enabled():
        return None
    with _lock:
        if _bridge is None:
            _bridge = IrcBridge()
            _bridge.start()
        return _bridge


def stop_bridge() -> None:
    global _bridge
    with _lock:
        if _bridge is not None:
            _bridge.stop()
            _bridge = None
