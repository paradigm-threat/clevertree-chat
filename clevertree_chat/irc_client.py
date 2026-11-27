"""Minimal TLS/plain IRC client for the Cleverchat ↔ Ergo bridge."""

from __future__ import annotations

import select
import socket
import ssl
import threading
import time
from collections.abc import Callable
from typing import Any

# Soft cap for outbound PRIVMSG (Ergo/IRCv3 hard ceiling ~512 bytes with prefix).
IRC_PRIVMSG_SOFT_MAX = 400


def normalize_channel(raw: str) -> str:
    c = (raw or "").strip().lower().lstrip("#")
    c = "".join(ch for ch in c if ch.isalnum() or ch in "_-./")[:64]
    return ("#" + c) if c else ""


class IrcClient:
    """Blocking connect + background reader. Stdlib only."""

    def __init__(
        self,
        *,
        host: str,
        port: int = 6697,
        nick: str = "clevertree",
        user: str = "clevertree",
        real: str = "Cleverchat IRC bridge",
        tls: bool = True,
        on_privmsg: Callable[[dict[str, str]], None] | None = None,
        on_registered: Callable[[], None] | None = None,
    ) -> None:
        self.host = host
        self.port = int(port)
        self.nick = nick[:24] or "clevertree"
        self.user = user
        self.real = real
        self.tls = tls
        self.on_privmsg = on_privmsg
        self.on_registered = on_registered
        self._sock: socket.socket | None = None
        self._buf = ""
        self._ready = threading.Event()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self.channels: set[str] = set()

    @property
    def ready(self) -> bool:
        return self._ready.is_set()

    def connect(self, timeout: float = 20.0) -> None:
        raw = socket.create_connection((self.host, self.port), timeout=timeout)
        if self.tls:
            ctx = ssl.create_default_context()
            raw = ctx.wrap_socket(raw, server_hostname=self.host)
        raw.settimeout(None)
        self._sock = raw
        self._stop.clear()
        self._ready.clear()
        self.raw(f"NICK {self.nick}")
        self.raw(f"USER {self.user} 0 * :{self.real}")
        self._thread = threading.Thread(target=self._read_loop, name="irc-reader", daemon=True)
        self._thread.start()
        if not self._ready.wait(timeout):
            raise TimeoutError("IRC register timeout")

    def close(self) -> None:
        self._stop.set()
        sock = self._sock
        self._sock = None
        if sock is not None:
            try:
                sock.close()
            except Exception:
                pass
        self._ready.clear()

    def raw(self, line: str) -> None:
        sock = self._sock
        if sock is None:
            return
        data = (line.rstrip("\r\n") + "\r\n").encode("utf-8", errors="replace")
        with self._lock:
            try:
                sock.sendall(data)
            except Exception:
                pass

    def join(self, channel: str) -> None:
        ch = normalize_channel(channel)
        if not ch:
            return
        self.raw(f"JOIN {ch}")
        self.channels.add(ch)

    def privmsg(self, target: str, text: str) -> None:
        ch = normalize_channel(target) if target.startswith("#") or "/" not in target else target
        if not ch:
            return
        # IRC line length soft limit (~512 byte protocol ceiling incl. prefix).
        body = (text or "").replace("\r", " ").replace("\n", " ").strip()
        if not body:
            return
        if len(body) > IRC_PRIVMSG_SOFT_MAX:
            body = body[: IRC_PRIVMSG_SOFT_MAX - 3] + "…"
        self.raw(f"PRIVMSG {ch} :{body}")

    def _read_loop(self) -> None:
        sock = self._sock
        if sock is None:
            return
        while not self._stop.is_set():
            try:
                ready, _, _ = select.select([sock], [], [], 1.0)
                if not ready:
                    continue
                chunk = sock.recv(4096)
                if not chunk:
                    break
                self._buf += chunk.decode("utf-8", errors="replace")
                while "\n" in self._buf:
                    line, self._buf = self._buf.split("\n", 1)
                    if line.endswith("\r"):
                        line = line[:-1]
                    self._handle_line(line)
            except Exception:
                if self._stop.is_set():
                    break
                time.sleep(0.5)
                break

    def _handle_line(self, line: str) -> None:
        if line.startswith("PING "):
            self.raw("PONG " + line[5:])
            return
        if not line.startswith(":"):
            return
        try:
            prefix, cmd, rest = _split_irc(line)
        except ValueError:
            return
        nick = prefix.split("!", 1)[0]
        if cmd == "001":
            self._ready.set()
            if self.on_registered:
                self.on_registered()
            return
        if cmd == "433":
            base = self.nick.rstrip("0123456789_")
            self.nick = (base + "_" + str(int(time.time()) % 90 + 10))[:24]
            self.raw(f"NICK {self.nick}")
            return
        if cmd == "JOIN":
            ch = (rest[1:] if rest.startswith(":") else rest.split(" ", 1)[0]).lower()
            self.channels.add(ch)
            return
        if cmd == "PRIVMSG" and self.on_privmsg:
            sp = rest.find(" :")
            target = rest[:sp] if sp >= 0 else rest.split(" ", 1)[0]
            text = rest[sp + 2 :] if sp >= 0 else ""
            self.on_privmsg(
                {"nick": nick, "target": target, "text": text, "prefix": prefix}
            )


def _split_irc(line: str) -> tuple[str, str, str]:
    # :prefix CMD rest
    space = line.find(" ")
    if space < 0:
        raise ValueError("bad line")
    prefix = line[1:space]
    rest0 = line[space + 1 :]
    space2 = rest0.find(" ")
    if space2 < 0:
        return prefix, rest0, ""
    return prefix, rest0[:space2], rest0[space2 + 1 :]


# Craft / collection rooms + public catch-all. Prefer channel-policy.json at deploy.
CRAFT_CHANNELS: dict[str, str] = {
    "mp-general": "#mp-general",
    "ga-savannah-cat-rescue": "#ga-savannah-cat-rescue",
    "web": "#web",
}

PUBLIC_WEB_CHANNEL = "#web"


def _pt_consolidated() -> bool:
    """Paradigm Threat: one IRC channel for the whole repo (topics via context tags)."""
    import os

    return os.environ.get("CLEVERTREE_IRC_CONSOLIDATE_PT", "1").strip().lower() not in {
        "0",
        "false",
        "no",
        "off",
    }


def channel_for_topic(prefix: str, topic: str) -> str:
    """Map a Cleverchat topic slug to IRC channel.

    Craft collections: CRAFT_CHANNELS override.
    PT (prefix pt) with consolidate (default on): always #pt — page identity via [[t:]] tags.
    Legacy: #prefix-topic when CLEVERTREE_IRC_CONSOLIDATE_PT=0.
    """
    t = (topic or "").strip().lower().replace("/", "-")
    t = "".join(ch for ch in t if ch.isalnum() or ch in "-_")[:48]
    if t in CRAFT_CHANNELS:
        return CRAFT_CHANNELS[t]
    p = "".join(ch for ch in (prefix or "pt").lower() if ch.isalnum())[:8] or "pt"
    if t == "web":
        return PUBLIC_WEB_CHANNEL
    if p == "pt" and _pt_consolidated():
        return f"#{p}"
    if not t or t in {"lobby", "home"}:
        return f"#{p}"
    return f"#{p}-{t}"


def topic_for_channel(prefix: str, channel: str) -> str | None:
    """Inverse of channel_for_topic. Returns None if channel is not ours.

    Consolidated #pt maps to general; finer topic comes from [[t:N]] in the body.
    #web maps to topic slug ``web``; domain comes from [[d:]] in the body.
    """
    ch_norm = normalize_channel(channel)
    for topic, craft_ch in CRAFT_CHANNELS.items():
        if normalize_channel(craft_ch) == ch_norm:
            return topic
    p = "".join(ch for ch in (prefix or "pt").lower() if ch.isalnum())[:8] or "pt"
    ch = ch_norm.lstrip("#")
    if ch == "web":
        return "web"
    if ch == p:
        return "general"
    if p == "pt" and _pt_consolidated():
        # Legacy #pt-* still accepted as inbound during migration → treat as general room
        if ch.startswith("pt-"):
            return "general"
        return None
    head = p + "-"
    if ch.startswith(head):
        slug = ch[len(head) :]
        return slug or "general"
    return None


def parse_context_tags(text: str) -> dict[str, Any]:
    """Extract trailing/wire context tags from a PRIVMSG body."""
    import re

    out: dict[str, Any] = {"topic_id": None, "domain": None, "collection": None, "raw": []}
    for m in re.finditer(r"\[\[(t|d|c):([^\]]+)\]\]", text or "", flags=re.I):
        kind, body = m.group(1).lower(), m.group(2).strip()
        out["raw"].append(m.group(0))
        if kind == "t":
            try:
                out["topic_id"] = int(body)
            except ValueError:
                out["topic_id"] = body
        elif kind == "d":
            host = body.lower().replace("https://", "").replace("http://", "").split("/")[0]
            if host.startswith("www."):
                host = host[4:]
            out["domain"] = host
        elif kind == "c":
            out["collection"] = body
    return out


def ensure_trailing_tag(text: str, tag: str) -> str:
    """Append ``tag`` at end if missing."""
    body = (text or "").rstrip()
    tag = (tag or "").strip()
    if not tag:
        return body
    if tag in body:
        return body
    return f"{body} {tag}".strip() if body else tag
