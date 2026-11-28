"""fanout_submit echoes client_id on post.live for optimistic UI settle."""

from __future__ import annotations

import tempfile
import unittest
from unittest import mock

from clevertree_chat import live_runtime as live


class FanoutClientIdTests(unittest.TestCase):
    def setUp(self):
        live._service = None
        live._store = None
        live._pages.clear()
        live._visitors.clear()
        live.stop_drain_worker()
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self._live = tempfile.TemporaryDirectory()
        self.addCleanup(self._live.cleanup)
        self._env = mock.patch.dict(
            "os.environ",
            {
                "CLEVERTREE_COMMENTS_PATH": self._tmp.name,
                "CLEVERTREE_LIVE_ROOT": self._live.name,
                "CLEVERTREE_SEED_FIXTURES": "0",
                "CLEVERTREE_IRC_ENABLE": "0",
            },
            clear=False,
        )
        self._env.start()
        self.addCleanup(self._env.stop)

    def tearDown(self):
        live.stop_drain_worker()

    def test_fanout_includes_client_id(self):
        seen = []

        def capture(topic, payload):
            seen.append((topic, payload))

        with mock.patch.object(live.HUB, "broadcast", side_effect=capture):
            live.fanout_submit(
                "#web",
                "visitor-1",
                {"body": "hello pending", "comment_id": "c1", "starting": "other"},
                source="ws",
                nick="you",
                client_id="ct-test-123",
            )

        self.assertEqual(len(seen), 1)
        topic, payload = seen[0]
        self.assertEqual(topic, "#web")
        self.assertEqual(payload.get("type"), "post.live")
        self.assertEqual(payload.get("client_id"), "ct-test-123")
        self.assertEqual(payload.get("chat_line", {}).get("client_id"), "ct-test-123")
        self.assertEqual(payload.get("chat_line", {}).get("body"), "hello pending")

    def test_fanout_omits_empty_client_id(self):
        seen = []

        def capture(topic, payload):
            seen.append(payload)

        with mock.patch.object(live.HUB, "broadcast", side_effect=capture):
            live.fanout_submit(
                "#web",
                "visitor-1",
                {"body": "no id", "comment_id": "c2"},
                source="ws",
                nick="you",
                client_id="",
            )

        self.assertEqual(len(seen), 1)
        self.assertNotIn("client_id", seen[0])
        self.assertNotIn("client_id", seen[0].get("chat_line") or {})


if __name__ == "__main__":
    unittest.main()
