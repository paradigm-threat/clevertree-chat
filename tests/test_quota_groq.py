"""Soft Groq budgets + retry-after parsing."""

from __future__ import annotations

import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from clevertree_chat import channel_media_review, irc_log_cache, providers, quota


class RetryAfterTests(unittest.TestCase):
    def test_parse_try_again_in(self):
        body = (
            'Rate limit reached ... Please try again in 2.185714285s. '
            "Need more tokens?"
        )
        self.assertAlmostEqual(providers.parse_retry_after_s(body), 2.185714285, places=5)

    def test_parse_default(self):
        self.assertEqual(providers.parse_retry_after_s("no hint", default=12), 12.0)


class VisionQuotaTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)
        irc_log_cache._rings.clear()
        self._env = mock.patch.dict(
            "os.environ",
            {
                "CLEVERTREE_LIVE_ROOT": str(self.root),
                "CLEVERTREE_VISION_SOFT_RPM": "2",
                "CLEVERTREE_VISION_SOFT_RPD": "5",
                "CLEVERTREE_VISION_COOLDOWN_FLOOR_S": "5",
            },
            clear=False,
        )
        self._env.start()
        self.addCleanup(self._env.stop)

    def test_rpm_cap(self):
        self.assertTrue(quota.check_vision()["ok"])
        self.assertTrue(quota.consume_vision()["ok"])
        self.assertTrue(quota.consume_vision()["ok"])
        gate = quota.check_vision()
        self.assertFalse(gate["ok"])
        self.assertEqual(gate["reason"], "vision_rpm_soft")

    def test_cooldown(self):
        until = quota.set_vision_cooldown(8)
        self.assertGreater(until, time.time())
        gate = quota.check_vision()
        self.assertFalse(gate["ok"])
        self.assertEqual(gate["reason"], "vision_cooldown")
        st = quota.status()
        self.assertIn("vision", st)
        self.assertGreaterEqual(st["vision"]["cooldown_remaining_s"], 1)

    def test_not_before_skips_job(self):
        img = "https://myproblem-stills.b-cdn.net/chat-public/web/ee.png"
        body = f"[[mp:media kind=image url={img} channel=#web review=pending]]"
        jobs = channel_media_review.enqueue_from_body("web", body, source="web")
        self.assertEqual(len(jobs), 1)
        channel_media_review.mark_job(
            jobs[0]["_job_path"],
            "pending",
            not_before=time.time() + 60,
        )
        pending = channel_media_review.list_pending_jobs()
        self.assertEqual(pending, [])


if __name__ == "__main__":
    unittest.main()
