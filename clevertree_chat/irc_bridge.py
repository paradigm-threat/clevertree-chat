"""Cleverchat ↔ Ergo IRC sync: PRIVMSG ↔ durable submit; WS fans out via live_runtime."""

from __future__ import annotations

import hashlib
import logging
import os
import threading
import time
import uuid as uuidlib
from pathlib import Path
from typing import Any

from clevertree_chat.irc_client import (
    IrcClient,
    PUBLIC_WEB_CHANNEL,
    channel_for_topic,
    ensure_trailing_tag,
    parse_context_tags,
    topic_for_channel,
)

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
        # Linode Ergo hub (mesh1/mesh2 proxy the same network). Override if needed.
        self.host = os.environ.get("CLEVERTREE_IRC_HOST", "pub1.relaygateway.net").strip()
        self.port = int(os.environ.get("CLEVERTREE_IRC_PORT", "6697") or "6697")
        self.tls = os.environ.get("CLEVERTREE_IRC_TLS", "1").strip().lower() not in {
            "0",
            "false",
            "no",
        }
        self.nick = (os.environ.get("CLEVERTREE_IRC_NICK") or "clevertree-si").strip()[:24]
        self.prefix = (os.environ.get("CLEVERTREE_IRC_PREFIX") or "pt").strip() or "pt"
        # Nicks that must never re-trigger AI / bridge actions (own + future AI).
        raw_bots = os.environ.get(
            "CLEVERTREE_IRC_BOT_NICKS",
            "clevertree-si,clevertree-ai,clevertree,relay-bot",
        )
        self._bot_nicks = {
            n.strip().lower() for n in raw_bots.split(",") if n.strip()
        } | {self.nick.lower()}
        self._client: IrcClient | None = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._echo_ids: set[str] = set()  # recent outbound fingerprints to skip echo
        self._joined: set[str] = set()
        self._seeded_topics: set[str] = set()

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
            self._seed_topic_once(topic, ch)
        return ch

    def _seed_topic_once(self, topic: str, channel: str) -> None:
        key = (topic or "").strip().lower()
        if key in self._seeded_topics:
            return
        self._seeded_topics.add(key)
        try:
            from clevertree_chat import irc_chrome

            irc_chrome.seed_topic_if_empty(topic, channel)
        except Exception as exc:
            log.debug("TOPIC seed skipped: %s", exc)

    def announce_submit(
        self,
        topic: str,
        body: str,
        author: str = "",
        *,
        topic_id: int | None = None,
        domain: str = "",
    ) -> None:
        """Room/API submit → IRC PRIVMSG (skip if we originated from IRC)."""
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
        tags = parse_context_tags(text)
        if ch == PUBLIC_WEB_CHANNEL:
            host = (domain or tags.get("domain") or "").strip()
            if host:
                text = ensure_trailing_tag(text, f"[[d:{host}]]")
        else:
            tid = topic_id if topic_id is not None else tags.get("topic_id")
            if tid is None and (topic or "").strip().lower() in {"", "general", "lobby"}:
                tid = 0
            if tid is not None and tags.get("topic_id") is None:
                text = ensure_trailing_tag(text, f"[[t:{tid}]]")
        label = (author or "").strip()
        wire = _irc_wire_body(text, author=label)
        out_fp = _fingerprint(topic, text)
        self._echo_ids.add(out_fp)
        client.privmsg(ch, wire)
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
                    on_topic=self._on_topic,
                    on_metadata=self._on_metadata,
                )
                self._client = client
                client.connect(timeout=25.0)
                backoff = 2.0
                log.info("IRC connected %s:%s as %s", self.host, self.port, client.nick)
                # PT #pt, MyProblem craft rooms, public #web, SongWalker, SNESology.
                for topic in (
                    "general",
                    "mp-general",
                    "ga-savannah-cat-rescue",
                    "web",
                    "songwalker",
                    "snesology",
                ):
                    self.ensure_channel(topic)
                lobby = channel_for_topic(self.prefix, "")
                client.join(lobby)
                self._joined.add(lobby)
                self._seed_topic_once("general", lobby)
                while not self._stop.is_set() and client.ready:
                    time.sleep(1.0)
                client.close()
            except Exception as exc:
                log.warning("IRC bridge reconnect: %s", exc)
            self._client = None
            self._joined.clear()
            self._seeded_topics.clear()
            if self._stop.wait(backoff):
                break
            backoff = min(backoff * 1.5, 60.0)

    def _on_topic(self, ev: dict[str, Any]) -> None:
        try:
            from clevertree_chat import irc_chrome

            irc_chrome.on_bridge_topic(ev)
        except Exception as exc:
            log.debug("topic handler: %s", exc)

    def _on_metadata(self, ev: dict[str, Any]) -> None:
        try:
            from clevertree_chat import irc_chrome

            irc_chrome.on_bridge_metadata(ev)
        except Exception as exc:
            log.debug("metadata handler: %s", exc)

    def _on_privmsg(self, msg: dict[str, Any]) -> None:
        nick = (msg.get("nick") or "").strip()
        target = msg.get("target") or ""
        text = (msg.get("text") or "").strip()
        msgid = (msg.get("msgid") or "").strip()
        if not text or not target.startswith("#"):
            return
        client = self._client
        nick_l = nick.lower()
        if client and nick_l == client.nick.lower():
            return
        # Never act on bridge / AI bot traffic (incl. nick collision suffixes stripped loosely)
        base_nick = nick_l.split("_")[0] if nick_l else ""
        if nick_l in self._bot_nicks or base_nick in self._bot_nicks:
            # Still cache msgid for pin resolution when bots speak.
            topic_bot = topic_for_channel(self.prefix, target)
            if topic_bot and msgid:
                try:
                    from clevertree_chat import irc_log_cache

                    irc_log_cache.append_line(
                        topic_bot,
                        body=text,
                        visitor="",
                        source="irc",
                        nick=nick,
                        channel=target,
                        msgid=msgid,
                    )
                except Exception:
                    pass
            return
        # Skip CTCP
        if text.startswith("\x01"):
            return
        topic = topic_for_channel(self.prefix, target)
        if not topic:
            return
        # Cache wire line + msgid for pin resolution
        try:
            from clevertree_chat import irc_log_cache

            irc_log_cache.append_line(
                topic,
                body=text,
                visitor="",
                source="irc",
                nick=nick,
                channel=target,
                msgid=msgid,
            )
        except Exception:
            pass
        # Owner answer → fold into rules / KB (not a debate post)
        lower = text.lower()
        if lower.startswith("!answer ") or lower.startswith("si answer:"):
            answer = text.split(" ", 1)[1].strip() if " " in text else ""
            if lower.startswith("si answer:"):
                answer = text.split(":", 1)[1].strip()
            if answer:
                try:
                    self._fold_owner_answer(topic, answer, nick)
                except Exception as exc:
                    log.warning("IRC answer fold failed: %s", exc)
            return
        # Manual text SI — Free-tier gated; never a debate claim
        if lower == "!investigate" or lower.startswith("!investigate "):
            try:
                self._request_investigate(topic, text, nick)
            except Exception as exc:
                log.warning("IRC investigate failed: %s", exc)
            return
        # Other !commands stay out of the debate map
        if text.startswith("!"):
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

    def _request_investigate(self, topic: str, text: str, nick: str) -> None:
        from clevertree_chat import investigate
        from clevertree_chat.channel_asr import default_channel_reply

        focus = investigate.parse_command(text)
        if focus is None:
            return
        # Wire line already cached in _on_privmsg (with msgid when present).
        result = investigate.request_investigate(
            topic,
            focus=focus,
            nick=nick,
            source="irc",
            reply=default_channel_reply,
        )
        if result.get("ok"):
            # Kick an immediate drain so the reply isn't stuck on the 10s tick.
            try:
                from clevertree_chat.live_runtime import drain_investigate_jobs

                drain_investigate_jobs(limit=1)
            except Exception as exc:
                log.warning("investigate drain kick failed: %s", exc)

    def _fold_owner_answer(self, topic: str, answer: str, nick: str) -> None:
        """Append human answer into owner-answers.md and a rules.md note."""
        from clevertree_chat import live_runtime as live

        service = live.open_service()
        root = Path(service.debate.repo.path)
        page = topic  # review rooms use page==topic
        base = root / "pages" / page / "topics" / topic
        base.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        line = f"- ({stamp}) <{nick}> {answer.strip()}\n"
        answers_rel = f"pages/{page}/topics/{topic}/owner-answers.md"
        answers_path = root / answers_rel
        prev = answers_path.read_text(encoding="utf-8") if answers_path.is_file() else "# Owner answers\n\n"
        if not prev.endswith("\n"):
            prev += "\n"
        writes: dict[str, str] = {answers_rel: prev + line}
        rules_rel = "rules.md"
        rules_path = root / rules_rel
        rules_prev = (
            rules_path.read_text(encoding="utf-8")
            if rules_path.is_file()
            else "# Debate rules\n\n"
        )
        note = f"\n## Owner answer ({topic})\n\n{answer.strip()}\n"
        if note.strip() not in rules_prev:
            writes[rules_rel] = rules_prev.rstrip() + "\n" + note
        service.debate.repo.commit_changes(
            writes, [], f"fold IRC owner answer for {topic}", nick[:40] or "irc"
        )
        live._persist()
        client = self._client
        if client and client.ready:
            ch = self.ensure_channel(topic)
            client.privmsg(ch, f"Noted owner answer from {nick}. Folded into rules.")

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
        live.fanout_submit(
            topic,
            visitor,
            result if isinstance(result, dict) else {},
            source="irc",
            nick=nick,
        )
        # fanout_submit already broadcasts + logs; ensure channel joined
        self.ensure_channel(topic)


def _irc_wire_body(text: str, *, author: str = "") -> str:
    """Body for IRC wire. Long SI replies become a ≤400-char teaser; full text stays in room log."""
    from clevertree_chat.irc_client import IRC_PRIVMSG_SOFT_MAX

    raw = (text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    label = (author or "").strip()
    # Prefixed SI deep dives: short teaser so PRIVMSG is not a wall of text.
    first = raw.split("\n", 1)[0].strip()
    lower_first = first.lower()
    if lower_first.startswith("si batch:") or lower_first.startswith("si investigate"):
        head = first
        if len(head) > 180:
            head = head[:177] + "…"
        teaser = f"{head} — Full steps in the room."
        if len(teaser) > IRC_PRIVMSG_SOFT_MAX:
            teaser = teaser[: IRC_PRIVMSG_SOFT_MAX - 3] + "…"
        return teaser
    body = " ".join(line.strip() for line in raw.split("\n") if line.strip())
    msg = f"<{label}> {body}" if label else body
    if len(msg) > IRC_PRIVMSG_SOFT_MAX:
        # Generic long posts: truncate on the wire (room keeps full via log/WS).
        msg = msg[: IRC_PRIVMSG_SOFT_MAX - 3] + "…"
    return msg


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
