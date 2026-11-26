"""Manual !investigate parse, quota, and no debate-dirty side effects."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from clevertree_chat import investigate, quota


class InvestigateParseTests(unittest.TestCase):
    def test_parse_bare(self):
        self.assertEqual(investigate.parse_command("!investigate"), "")
        self.assertEqual(investigate.parse_command("!Investigate"), "")

    def test_parse_focus(self):
        self.assertEqual(
            investigate.parse_command("!investigate spam claim about fees"),
            "spam claim about fees",
        )

    def test_parse_rejects_other(self):
        self.assertIsNone(investigate.parse_command("hello"))
        self.assertIsNone(investigate.parse_command("!answer stuff"))
        self.assertIsNone(investigate.parse_command("investigate please"))


class QuotaInvestigateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.env = mock.patch.dict(
            "os.environ",
            {
                "CLEVERTREE_LIVE_ROOT": str(self.root),
                "CLEVERTREE_INVESTIGATE_COOLDOWN_S": "600",
                "CLEVERTREE_INVESTIGATE_DAILY_MAX": "2",
                "CLEVERTREE_INVESTIGATE": "1",
            },
            clear=False,
        )
        self.env.start()
        self.addCleanup(self.env.stop)
        # Point live_root at tmp via irc_log_cache
        self.live = mock.patch(
            "clevertree_chat.quota.live_root",
            return_value=self.root,
        )
        self.live.start()
        self.addCleanup(self.live.stop)
        self.live2 = mock.patch(
            "clevertree_chat.investigate.live_root",
            return_value=self.root,
        )
        self.live2.start()
        self.addCleanup(self.live2.stop)

    def test_cooldown_deny(self):
        first = quota.consume_investigate("mp-general")
        self.assertTrue(first["ok"])
        second = quota.consume_investigate("mp-general")
        self.assertFalse(second["ok"])
        self.assertEqual(second["reason"], "cooldown")
        self.assertIn("cooling down", second["message"])

    def test_daily_max(self):
        with mock.patch.dict(
            "os.environ",
            {"CLEVERTREE_INVESTIGATE_COOLDOWN_S": "0", "CLEVERTREE_INVESTIGATE_DAILY_MAX": "2"},
            clear=False,
        ):
            self.assertTrue(quota.consume_investigate("a")["ok"])
            self.assertTrue(quota.consume_investigate("b")["ok"])
            third = quota.consume_investigate("c")
            self.assertFalse(third["ok"])
            self.assertEqual(third["reason"], "daily_max")


class InvestigateEnqueueTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.env = mock.patch.dict(
            "os.environ",
            {
                "CLEVERTREE_INVESTIGATE": "1",
                "CLEVERTREE_INVESTIGATE_COOLDOWN_S": "0",
                "CLEVERTREE_INVESTIGATE_DAILY_MAX": "48",
            },
            clear=False,
        )
        self.env.start()
        self.addCleanup(self.env.stop)
        for target in (
            "clevertree_chat.quota.live_root",
            "clevertree_chat.investigate.live_root",
            "clevertree_chat.irc_log_cache.live_root",
        ):
            p = mock.patch(target, return_value=self.root)
            p.start()
            self.addCleanup(p.stop)

    def test_request_enqueues_kind(self):
        replies: list[tuple] = []

        def reply(topic, body, nick):
            replies.append((topic, body, nick))

        # Patch recent context empty
        with mock.patch("clevertree_chat.investigate.recent", return_value=[]):
            result = investigate.request_investigate(
                "mp-general",
                focus="fees",
                nick="ari",
                reply=reply,
            )
        self.assertTrue(result["ok"])
        job_id = result["job_id"]
        path = self.root / "queue" / "investigate" / f"{job_id}.json"
        self.assertTrue(path.is_file())
        data = json.loads(path.read_text())
        self.assertEqual(data["kind"], "investigate")
        self.assertEqual(data["status"], "pending")
        self.assertEqual(data["focus"], "fees")
        # No debate job.json minted
        self.assertFalse((self.root / "pages").exists())


if __name__ == "__main__":
    unittest.main()
