"""IRC mapping, live resolve domain scope, scripted actions removed."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from clevertree_chat.irc_client import channel_for_topic, topic_for_channel
from clevertree_chat import live_runtime as live
from clevertree_chat.associations import add_alias, empty_graph, link_related, resolve_canonical
from clevertree_chat.spam_court import SpamClocks, lifecycle_state


class IrcMappingTests(unittest.TestCase):
    def test_channel_roundtrip(self):
        self.assertEqual(channel_for_topic("pt", "general"), "#pt-general")
        self.assertEqual(channel_for_topic("pt", "5g"), "#pt-5g")
        self.assertEqual(channel_for_topic("pt", ""), "#pt")
        self.assertEqual(topic_for_channel("pt", "#pt-general"), "general")
        self.assertEqual(topic_for_channel("pt", "#pt"), "general")
        self.assertEqual(topic_for_channel("pt", "#pt-geoengineering"), "geoengineering")
        self.assertIsNone(topic_for_channel("pt", "#flashback"))


class LiveDispatchTests(unittest.TestCase):
    def setUp(self):
        live._service = None
        live._store = None
        live._pages.clear()
        live._visitors.clear()
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self._env = mock.patch.dict(
            "os.environ",
            {
                "CLEVERTREE_COMMENTS_PATH": self._tmp.name,
                "CLEVERTREE_SEED_FIXTURES": "0",
                "CLEVERTREE_IRC_ENABLE": "0",
            },
            clear=False,
        )
        self._env.start()
        self.addCleanup(self._env.stop)

    def test_scripted_actions_rejected(self):
        for action in ("replay", "advance", "play"):
            code, body = live.dispatch({"action": action}, {})
            self.assertEqual(code, 400)
            self.assertIn("scripted", body["error"])

    def test_identify_and_resolve_guided_false(self):
        code, ident = live.dispatch({"action": "identify"}, {})
        self.assertEqual(code, 200)
        visitor = ident["visitor"]
        code, resolved = live.dispatch(
            {
                "action": "resolve",
                "url": "https://api.clevertree.chat/chat/flock-cameras",
                "visitor": visitor,
            },
            {},
        )
        self.assertEqual(code, 200)
        self.assertEqual(resolved["topic"], "flock-cameras")
        self.assertFalse(resolved["guided"])

    def test_domain_scope_collapses_path(self):
        code, a = live.dispatch(
            {
                "action": "resolve",
                "url": "https://www.Example.com/news/a?id=1",
                "page_scope": "domain",
            },
            {},
        )
        code2, b = live.dispatch(
            {
                "action": "resolve",
                "url": "https://example.com/other/path?utm_source=x",
                "page_scope": "domain",
                "visitor": a["visitor"],
            },
            {},
        )
        self.assertEqual(code, 200)
        self.assertEqual(code2, 200)
        self.assertEqual(a["topic"], b["topic"])
        self.assertTrue(a["normalized"].endswith("example.com/"))
        self.assertNotIn("news", a["normalized"])


class AssociationsAndSpamTests(unittest.TestCase):
    def test_alias_and_link(self):
        g = empty_graph()
        add_alias(g, "com/example.com/", "com/m.example.com/")
        link_related(g, "com/example.com/", "com/other.com/")
        self.assertEqual(resolve_canonical(g, "com/m.example.com/"), "com/example.com/")
        self.assertIn("com/other.com/", g["pages"]["com/example.com/"]["links"])

    def test_spam_lifecycle(self):
        clocks = SpamClocks(contest_hours=48, hide_days=7)
        self.assertEqual(lifecycle_state(flagged_at=None), "visible")
        # flagged just now
        from datetime import datetime, timezone

        now = datetime(2026, 11, 15, 12, 0, tzinfo=timezone.utc)
        flagged = "2026-11-15T11:00:00Z"
        self.assertEqual(
            lifecycle_state(flagged_at=flagged, now=now, clocks=clocks), "flagged"
        )
        # past contest, auto-hide
        later = datetime(2026, 11, 18, 12, 0, tzinfo=timezone.utc)
        self.assertEqual(
            lifecycle_state(flagged_at=flagged, now=later, clocks=clocks), "hidden"
        )


if __name__ == "__main__":
    unittest.main()
