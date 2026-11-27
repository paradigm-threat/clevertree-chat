"""IRC TOPIC + METADATA pin → SI chrome (no redundant repo pin SoT)."""

from __future__ import annotations

import unittest
from unittest import mock

from clevertree_chat.irc_client import parse_tags, policy_title_for_channel
from clevertree_chat import irc_chrome


class ParseTagsTests(unittest.TestCase):
    def test_msgid_tag(self) -> None:
        tags, rest = parse_tags(
            "@msgid=ABC123;time=2026-01-01T00:00:00.000Z :n!u@h PRIVMSG #web :hi"
        )
        self.assertEqual(tags.get("msgid"), "ABC123")
        self.assertTrue(rest.startswith(":n!u@h"))


class PolicyTitleTests(unittest.TestCase):
    def test_web_seed(self) -> None:
        self.assertEqual(policy_title_for_channel("#web"), "Clevertree Chat")

    def test_pt_seed(self) -> None:
        self.assertEqual(policy_title_for_channel("#pt"), "Paradigm Threat")


class ChromeAuthTests(unittest.TestCase):
    def test_anonymous_forbidden(self) -> None:
        self.assertFalse(irc_chrome.is_privileged_actor(visitor="anon-uuid", nick=""))

    def test_bridge_nick_allowed(self) -> None:
        self.assertTrue(irc_chrome.is_privileged_actor(nick="clevertree-si"))

    def test_set_topic_rejects_anonymous(self) -> None:
        out = irc_chrome.privileged_set_topic(
            "web", "Nope", actor={"visitor": "x", "nick": "rando"}
        )
        self.assertFalse(out.get("ok"))
        self.assertEqual(out.get("error"), "forbidden")

    def test_set_pin_rejects_anonymous(self) -> None:
        out = irc_chrome.privileged_set_pin(
            "web", "msgid1", actor={"visitor": "x", "nick": "rando"}
        )
        self.assertFalse(out.get("ok"))
        self.assertEqual(out.get("error"), "forbidden")


class ChromeStateTests(unittest.TestCase):
    def test_topic_and_pin_local(self) -> None:
        with mock.patch.object(irc_chrome, "_broadcast"):
            irc_chrome.set_topic_local("web", "#web", "Clevertree Chat")
            irc_chrome.set_pin_local(
                "web",
                "#web",
                msgid="MSG1",
                body="Pinned headline",
                nick="ops",
            )
            snap = irc_chrome.snapshot_for_hello("web")
        self.assertEqual(snap["topic_text"], "Clevertree Chat")
        self.assertEqual(snap["pin"]["msgid"], "MSG1")
        self.assertEqual(snap["pin"]["body"], "Pinned headline")

    def test_apply_room_chrome_uses_irc(self) -> None:
        from clevertree_chat.live_runtime import _apply_room_chrome

        with mock.patch.object(
            irc_chrome,
            "snapshot_for_hello",
            return_value={
                "channel": "#web",
                "topic_text": "From TOPIC",
                "pin": {"msgid": "M", "body": "Pin body", "nick": "a", "at": ""},
            },
        ):
            view: dict = {}
            _apply_room_chrome("web", view, fallback_title="web")
        self.assertEqual(view["title"], "From TOPIC")
        self.assertEqual(view["subtitle"], "Pin body")


if __name__ == "__main__":
    unittest.main()
