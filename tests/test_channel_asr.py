"""[[mp:media]] parse + channel ASR enqueue/drain (no tip mint)."""

from __future__ import annotations

import json
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest import mock

from clevertree_chat import channel_asr, channel_media, irc_log_cache


AUDIO_URL = (
    "https://myproblem-stills.b-cdn.net/chat-public/mp-general/demo-voice.webm"
)
MARKER = (
    f"Public voice note: {AUDIO_URL} "
    f"[[mp:media kind=audio url={AUDIO_URL} channel=#mp-general]]"
)


class ChannelMediaParseTests(unittest.TestCase):
    def test_parse_marker(self):
        items = channel_media.parse_media_markers(MARKER)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["kind"], "audio")
        self.assertEqual(items[0]["url"], AUDIO_URL)
        self.assertEqual(items[0]["channel"], "#mp-general")

    def test_bare_bunny_url(self):
        items = channel_media.extract_channel_media(
            f"heard this {AUDIO_URL} in the room"
        )
        self.assertEqual(len(items), 1)
        self.assertTrue(channel_media.asr_eligible(items[0]))

    def test_file_not_asr_eligible(self):
        items = channel_media.extract_channel_media(
            "[[mp:media kind=file url=https://myproblem-stills.b-cdn.net/chat-public/x.pdf channel=#mp-general]]"
        )
        self.assertEqual(len(items), 1)
        self.assertFalse(channel_media.asr_eligible(items[0]))


class ChannelAsrQueueTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)
        irc_log_cache._rings.clear()
        irc_log_cache._segment_started.clear()
        irc_log_cache._segment_bytes.clear()
        self._env = mock.patch.dict(
            "os.environ",
            {
                "CLEVERTREE_LIVE_ROOT": str(self.root),
                "CLEVERTREE_CHANNEL_ASR": "1",
                "CLEVERTREE_ASR_DRY_RUN": "1",
                "GROQ_API_KEY": "",
            },
            clear=False,
        )
        self._env.start()
        self.addCleanup(self._env.stop)

    def test_enqueue_from_marker(self):
        jobs = channel_asr.enqueue_from_body(
            "mp-general",
            MARKER,
            visitor=str(uuid.uuid4()),
            source="web",
            nick="demo",
        )
        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["kind"], "channel_asr")
        self.assertEqual(jobs[0]["site"], "myproblem")
        self.assertEqual(jobs[0]["url"], AUDIO_URL)
        self.assertEqual(jobs[0]["status"], "pending")
        pending = channel_asr.list_pending_jobs()
        self.assertEqual(len(pending), 1)

    def test_dedupe_same_url(self):
        channel_asr.enqueue_from_body("mp-general", MARKER, visitor="a")
        again = channel_asr.enqueue_from_body("mp-general", MARKER, visitor="b")
        self.assertEqual(again, [])
        self.assertEqual(len(channel_asr.list_pending_jobs()), 1)

    def test_si_source_skipped(self):
        jobs = channel_asr.enqueue_from_body(
            "mp-general", MARKER, source="si", nick="clevertree-si"
        )
        self.assertEqual(jobs, [])

    def test_dry_run_drain_replies(self):
        channel_asr.enqueue_from_body("mp-general", MARKER, visitor="v1")
        replies: list[tuple[str, str, str]] = []

        def capture(topic: str, body: str, nick: str) -> None:
            replies.append((topic, body, nick))

        results = channel_asr.process_pending(limit=5, reply=capture)
        self.assertEqual(len(results), 1)
        self.assertTrue(results[0]["ok"])
        self.assertEqual(results[0]["status"], "dry-run")
        self.assertEqual(len(replies), 1)
        self.assertIn("SI transcript", replies[0][1])
        self.assertIn("dry-run", replies[0][1])
        # Job file marked dry-run — no longer pending
        self.assertEqual(channel_asr.list_pending_jobs(), [])
        job_path = Path(self.root) / "queue" / "channel_asr"
        files = list(job_path.glob("*.json"))
        self.assertEqual(len(files), 1)
        data = json.loads(files[0].read_text(encoding="utf-8"))
        self.assertEqual(data["status"], "dry-run")
        self.assertNotIn("tip", json.dumps(data).lower())

    def test_awaiting_key_leaves_pending(self):
        with mock.patch.dict(
            "os.environ",
            {"CLEVERTREE_ASR_DRY_RUN": "0", "GROQ_API_KEY": ""},
            clear=False,
        ):
            channel_asr.enqueue_from_body("mp-general", MARKER, visitor="v2")
            results = channel_asr.process_pending(limit=5, reply=None)
            self.assertEqual(len(results), 1)
            self.assertTrue(results[0].get("pending"))
            self.assertEqual(len(channel_asr.list_pending_jobs()), 1)


if __name__ == "__main__":
    unittest.main()
