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
VIDEO_URL = (
    "https://myproblem-stills.b-cdn.net/chat-public/mp-general/demo-clip.webm"
)
MARKER = (
    f"Public voice note: {AUDIO_URL} "
    f"[[mp:media kind=audio url={AUDIO_URL} channel=#mp-general]]"
)
VIDEO_MARKER = (
    f"Clip: {VIDEO_URL} "
    f"[[mp:media kind=video url={VIDEO_URL} channel=#mp-general]]"
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

    def test_video_enqueue_priority_and_delay(self):
        with mock.patch.dict(
            "os.environ",
            {"CLEVERTREE_ASR_VIDEO_DELAY_SEC": "90"},
            clear=False,
        ):
            jobs = channel_asr.enqueue_from_body(
                "mp-general", VIDEO_MARKER, visitor="v3", source="web"
            )
            self.assertEqual(len(jobs), 1)
            self.assertEqual(jobs[0]["media_kind"], "video")
            self.assertEqual(jobs[0]["priority"], channel_asr.PRIORITY_VIDEO)
            self.assertIn("not_before", jobs[0])
            # Still delayed → not due yet
            self.assertEqual(channel_asr.list_pending_jobs(), [])
            due = channel_asr.list_pending_jobs(now=jobs[0]["not_before"] + 1)
            self.assertEqual(len(due), 1)

    def test_audio_priority_before_video_in_select(self):
        with mock.patch.dict(
            "os.environ",
            {"CLEVERTREE_ASR_VIDEO_DELAY_SEC": "0", "CLEVERTREE_ASR_VIDEO_LIMIT": "1"},
            clear=False,
        ):
            channel_asr.enqueue_from_body("mp-general", VIDEO_MARKER, visitor="v")
            channel_asr.enqueue_from_body("mp-general", MARKER, visitor="a")
            selected = channel_asr.select_jobs_for_drain(limit=2)
            self.assertEqual(len(selected), 2)
            self.assertEqual(selected[0]["media_kind"], "audio")
            self.assertEqual(selected[1]["media_kind"], "video")

    def test_format_reply_fuses_vl_and_asr(self):
        body = channel_asr._format_reply(
            {"media_kind": "video"},
            transcript="kill power at the switch",
            asr_model="whisper-large-v3-turbo",
            visual="Outdoor coach lantern on brick.",
            visual_model="qwen/qwen3.8-27b",
        )
        self.assertIn("SI video (vl+asr", body)
        self.assertIn("Visual:", body)
        self.assertIn("Speech:", body)

    def test_format_reply_asr_only_fallback(self):
        body = channel_asr._format_reply(
            {"media_kind": "video"},
            transcript="hello",
            asr_model="whisper-large-v3-turbo",
            visual="",
        )
        self.assertIn("SI transcript (video,", body)
        self.assertNotIn("Visual:", body)

    def test_video_process_vl_fallback_to_asr(self):
        with mock.patch.dict(
            "os.environ",
            {
                "CLEVERTREE_ASR_DRY_RUN": "0",
                "CLEVERTREE_ASR_VIDEO_DELAY_SEC": "0",
                "GROQ_API_KEY": "test-key",
            },
            clear=False,
        ):
            jobs = channel_asr.enqueue_from_body(
                "mp-general", VIDEO_MARKER, visitor="v4"
            )
            job = jobs[0]
            with (
                mock.patch.object(channel_asr, "_download") as dl,
                mock.patch.object(
                    channel_asr, "extract_video_frames", return_value=[]
                ),
                mock.patch.object(
                    channel_asr, "extract_audio_mp3", return_value=None
                ),
                mock.patch.object(
                    channel_asr,
                    "_transcribe_media",
                    return_value={
                        "text": "swap the bulb",
                        "model": "whisper-large-v3-turbo",
                        "provider": "groq",
                    },
                ),
                mock.patch.object(
                    channel_asr, "_describe_frames_groq", return_value=None
                ),
            ):
                def fake_dl(url, dest, **kwargs):
                    dest.write_bytes(b"fake-video")
                    return dest

                dl.side_effect = fake_dl
                replies: list[str] = []

                def capture(topic, body, nick):
                    replies.append(body)

                result = channel_asr.process_job(job, reply=capture)
            self.assertTrue(result["ok"])
            self.assertEqual(result.get("analysis"), "asr")
            self.assertTrue(replies)
            self.assertIn("SI transcript (video,", replies[0])


if __name__ == "__main__":
    unittest.main()
