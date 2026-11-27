"""Minimal TLS/plain IRC client for the Cleverchat ↔ Ergo bridge.

Supports IRCv3 message-tags (msgid), TOPIC, and draft/metadata-2 for
channel pin pointers (`clevertree/pin-msgid`).
"""

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

# Channel METADATA key: value is the msgid of the pinned PRIVMSG.
PIN_MSGID_KEY = "clevertree/pin-msgid"

CAP_REQ = (
    "message-tags",
    "server-time",
    "batch",
    "draft/metadata-2",
    "echo-message",
)


def normalize_channel(raw: str) -> str:
    c = (raw or "").strip().lower().lstrip("#")
    c = "".join(ch for ch in c if ch.isalnum() or ch in "_-./")[:64]
    return ("#" + c) if c else ""


def parse_tags(raw: str) -> tuple[dict[str, str], str]:
    """Parse IRCv3 @tags; return (tags, remainder without leading @tags)."""
    if not raw.startswith("@"):
        return {}, raw
    space = raw.find(" ")
    if space < 0:
        return {}, raw
    tag_blob = raw[1:space]
    rest = raw[space + 1 :]
    tags: dict[str, str] = {}
    for part in tag_blob.split(";"):
        if not part:
            continue
        if "=" in part:
            k, v = part.split("=", 1)
            tags[k] = _unescape_tag_value(v)
        else:
            tags[part] = ""
    return tags, rest


def _unescape_tag_value(value: str) -> str:
    # IRCv3 tag escape: \\ \: \s \r \n
    out = []
    i = 0
    while i < len(value):
        ch = value[i]
        if ch == "\\" and i + 1 < len(value):
            nxt = value[i + 1]
            out.append({":": ";", "s": " ", "r": "\r", "n": "\n", "\\": "\\"}.get(nxt, nxt))
            i += 2
            continue
        out.append(ch)
        i += 1
    return "".join(out)


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
        on_privmsg: Callable[[dict[str, Any]], None] | None = None,
        on_registered: Callable[[], None] | None = None,
        on_topic: Callable[[dict[str, Any]], None] | None = None,
        on_metadata: Callable[[dict[str, Any]], None] | None = None,
        on_numeric: Callable[[dict[str, Any]], None] | None = None,
    ) -> None:
        self.host = host
        self.port = int(port)
        self.nick = nick[:24] or "clevertree"
        self.user = user
        self.real = real
        self.tls = tls
        self.on_privmsg = on_privmsg
        self.on_registered = on_registered
        self.on_topic = on_topic
        self.on_metadata = on_metadata
        self.on_numeric = on_numeric
        self._sock: socket.socket | None = None
        self._buf = ""
        self._ready = threading.Event()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self.channels: set[str] = set()
        self.caps: set[str] = set()
        self._cap_done = False
        # channel -> topic text
        self.topics: dict[str, str] = {}
        # channel -> pin msgid (from METADATA)
        self.pin_msgids: dict[str, str] = {}

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
        self._cap_done = False
        self.caps.clear()
        # CAP first, then NICK/USER (Ergo accepts CAP before registration).
        self.raw("CAP LS 302")
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
        # Ask for current TOPIC and pin metadata after join.
        self.raw(f"TOPIC {ch}")
        if "draft/metadata-2" in self.caps or "metadata" in self.caps:
            self.raw(f"METADATA {ch} SUB {PIN_MSGID_KEY}")
            self.raw(f"METADATA {ch} GET {PIN_MSGID_KEY}")

    def privmsg(self, target: str, text: str) -> None:
        ch = normalize_channel(target) if target.startswith("#") or "/" not in target else target
        if not ch:
            return
        body = (text or "").replace("\r", " ").replace("\n", " ").strip()
        if not body:
            return
        if len(body) > IRC_PRIVMSG_SOFT_MAX:
            body = body[: IRC_PRIVMSG_SOFT_MAX - 3] + "…"
        self.raw(f"PRIVMSG {ch} :{body}")

    def set_topic(self, channel: str, text: str) -> None:
        """Set channel TOPIC (ops / privileged nick only)."""
        ch = normalize_channel(channel)
        if not ch:
            return
        body = (text or "").replace("\r", " ").replace("\n", " ").strip()
        self.raw(f"TOPIC {ch} :{body}")

    def get_topic(self, channel: str) -> str:
        return self.topics.get(normalize_channel(channel), "")

    def set_pin(self, channel: str, msgid: str) -> None:
        """Point channel pin METADATA at a PRIVMSG msgid."""
        ch = normalize_channel(channel)
        mid = (msgid or "").strip()
        if not ch or not mid:
            return
        self.raw(f"METADATA {ch} SET {PIN_MSGID_KEY} :{mid}")

    def clear_pin(self, channel: str) -> None:
        ch = normalize_channel(channel)
        if not ch:
            return
        self.raw(f"METADATA {ch} SET {PIN_MSGID_KEY}")

    def get_pin_msgid(self, channel: str) -> str:
        return self.pin_msgids.get(normalize_channel(channel), "")

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
        if not line:
            return
        tags, line = parse_tags(line)
        if line.startswith("PING "):
            self.raw("PONG " + line[5:])
            return
        if line.upper().startswith("CAP "):
            self._handle_cap(line)
            return
        if not line.startswith(":"):
            # METADATA server messages may arrive without leading nick prefix on some nets;
            # Ergo uses :server METADATA …
            if line.upper().startswith("METADATA "):
                self._handle_metadata(tags, "", "METADATA", line[9:])
            return
        try:
            prefix, cmd, rest = _split_irc(line)
        except ValueError:
            return
        nick = prefix.split("!", 1)[0]
        cmd_u = cmd.upper()

        if cmd_u == "001":
            if not self._cap_done:
                self.raw("CAP END")
                self._cap_done = True
            self._ready.set()
            if self.on_registered:
                self.on_registered()
            return
        if cmd_u == "433":
            base = self.nick.rstrip("0123456789_")
            self.nick = (base + "_" + str(int(time.time()) % 90 + 10))[:24]
            self.raw(f"NICK {self.nick}")
            return
        if cmd_u == "JOIN":
            ch = (rest[1:] if rest.startswith(":") else rest.split(" ", 1)[0]).lower()
            self.channels.add(ch)
            if "draft/metadata-2" in self.caps or "metadata" in self.caps:
                self.raw(f"METADATA {ch} SUB {PIN_MSGID_KEY}")
                self.raw(f"METADATA {ch} GET {PIN_MSGID_KEY}")
            return
        if cmd_u == "TOPIC":
            self._handle_topic_cmd(nick, rest)
            return
        if cmd_u == "332":  # RPL_TOPIC
            # 332 nick #channel :topic
            parts = rest.split(" ", 2)
            if len(parts) >= 3:
                ch = normalize_channel(parts[1])
                topic = parts[2][1:] if parts[2].startswith(":") else parts[2]
                self.topics[ch] = topic
                if self.on_topic:
                    self.on_topic(
                        {"channel": ch, "topic": topic, "nick": nick, "numeric": "332"}
                    )
            return
        if cmd_u == "331":  # RPL_NOTOPIC
            parts = rest.split(" ", 2)
            if len(parts) >= 2:
                ch = normalize_channel(parts[1])
                self.topics[ch] = ""
                if self.on_topic:
                    self.on_topic(
                        {"channel": ch, "topic": "", "nick": nick, "numeric": "331"}
                    )
            return
        if cmd_u == "METADATA":
            self._handle_metadata(tags, nick, cmd_u, rest)
            return
        # Ergo / draft metadata numerics (best-effort)
        if cmd_u in {"761", "762", "766", "768", "769"} or cmd_u.startswith("FAIL"):
            if self.on_numeric:
                self.on_numeric(
                    {"numeric": cmd_u, "nick": nick, "rest": rest, "tags": tags}
                )
            # 761/RPL_KEYVALUE style: nick target key visibility :value
            self._maybe_keyvalue(cmd_u, rest)
            return
        if cmd_u == "PRIVMSG" and self.on_privmsg:
            sp = rest.find(" :")
            target = rest[:sp] if sp >= 0 else rest.split(" ", 1)[0]
            text = rest[sp + 2 :] if sp >= 0 else ""
            self.on_privmsg(
                {
                    "nick": nick,
                    "target": target,
                    "text": text,
                    "prefix": prefix,
                    "msgid": tags.get("msgid") or tags.get("draft/msgid") or "",
                    "tags": tags,
                }
            )

    def _handle_cap(self, line: str) -> None:
        # CAP * LS :…   CAP * ACK :…   CAP * NAK :…
        parts = line.split(" ", 3)
        if len(parts) < 3:
            return
        sub = parts[2].upper()
        payload = parts[3] if len(parts) > 3 else ""
        if payload.startswith(":"):
            payload = payload[1:]
        if sub == "LS":
            available = set(payload.split())
            want = [c for c in CAP_REQ if c in available or c.split("=")[0] in available]
            # Also match unprefixed metadata if advertised
            for a in available:
                if a.startswith("draft/metadata") or a.startswith("metadata"):
                    if a not in want:
                        want.append(a.split("=")[0] if "=" in a else a)
            if want:
                self.raw("CAP REQ :" + " ".join(want))
            else:
                self.raw("CAP END")
                self._cap_done = True
            return
        if sub == "ACK":
            for c in payload.split():
                self.caps.add(c.split("=")[0])
            self.raw("CAP END")
            self._cap_done = True
            return
        if sub == "NAK":
            self.raw("CAP END")
            self._cap_done = True

    def _handle_topic_cmd(self, nick: str, rest: str) -> None:
        # TOPIC #channel :text
        sp = rest.find(" :")
        if sp >= 0:
            ch = normalize_channel(rest[:sp])
            topic = rest[sp + 2 :]
        else:
            bits = rest.split(" ", 1)
            ch = normalize_channel(bits[0])
            topic = bits[1] if len(bits) > 1 else ""
        self.topics[ch] = topic
        if self.on_topic:
            self.on_topic({"channel": ch, "topic": topic, "nick": nick, "numeric": ""})

    def _handle_metadata(
        self, tags: dict[str, str], nick: str, cmd: str, rest: str
    ) -> None:
        # METADATA #channel key visibility :value
        # or METADATA #channel key * :
        bits = rest.split(" ", 3)
        if len(bits) < 2:
            return
        target = normalize_channel(bits[0]) if bits[0].startswith("#") else bits[0]
        key = bits[1]
        value = ""
        if len(bits) >= 4:
            value = bits[3][1:] if bits[3].startswith(":") else bits[3]
        elif len(bits) == 3 and bits[2].startswith(":"):
            value = bits[2][1:]
        if key == PIN_MSGID_KEY or key.endswith("/pin-msgid"):
            ch = normalize_channel(target)
            if value:
                self.pin_msgids[ch] = value
            else:
                self.pin_msgids.pop(ch, None)
        if self.on_metadata:
            self.on_metadata(
                {
                    "target": target,
                    "key": key,
                    "value": value,
                    "nick": nick,
                    "tags": tags,
                    "cmd": cmd,
                }
            )

    def _maybe_keyvalue(self, numeric: str, rest: str) -> None:
        # Best-effort: <me> #channel key visibility :value
        parts = rest.split(" ", 4)
        if len(parts) < 4:
            return
        target = parts[1]
        key = parts[2]
        value = parts[4][1:] if len(parts) > 4 and parts[4].startswith(":") else (
            parts[3][1:] if parts[3].startswith(":") else ""
        )
        if not target.startswith("#"):
            return
        if key == PIN_MSGID_KEY or key.endswith("/pin-msgid"):
            ch = normalize_channel(target)
            if value:
                self.pin_msgids[ch] = value
            else:
                self.pin_msgids.pop(ch, None)
            if self.on_metadata:
                self.on_metadata(
                    {
                        "target": ch,
                        "key": key,
                        "value": value,
                        "nick": "",
                        "tags": {},
                        "cmd": numeric,
                    }
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


def policy_title_for_channel(channel: str) -> str:
    """One-time TOPIC seed from channel-policy.json (empty TOPIC only)."""
    import json
    from pathlib import Path

    ch = normalize_channel(channel)
    root = Path(__file__).resolve().parents[1]
    path = root / "fronts" / "room" / "channel-policy.json"
    if not path.is_file():
        return ""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return ""
    repos = data.get("repos") or {}
    # myproblem named channels
    mp = (repos.get("myproblem") or {}).get("channels") or {}
    if isinstance(mp, dict):
        for _slug, meta in mp.items():
            if not isinstance(meta, dict):
                continue
            if normalize_channel(str(meta.get("irc_channel") or "")) == ch:
                return str(meta.get("title") or "").strip()
    if ch == "#web":
        return "Clevertree Chat"
    if ch == "#pt":
        return "Paradigm Threat"
    if ch == "#mp-general":
        return "MyProblem general"
    return ""
