"""Allowlist + marker review + media-review enqueue (no live Bunny required)."""

from __future__ import annotations

import tempfile
import unittest
import uuid
from pathlib import Path
from unittest import mock

from clevertree_chat import bunny_upload, channel_media, channel_media_review, irc_log_cache
from clevertree_chat.media_allowlist import MAX_BYTES, classify_upload


PNG_1X1 = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
    b"\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)


class AllowlistTests(unittest.TestCase):
    def test_png_ok(self):
        r = classify_upload(
            filename="a.png",
            content_type="image/png",
            data=PNG_1X1,
        )
        self.assertTrue(r["ok"])
        self.assertEqual(r["kind"], "image")
        self.assertEqual(r["ext"], "png")

    def test_plain_text_ok(self):
        r = classify_upload(
            filename="note.txt",
            content_type="text/plain",
            data=b"hello room\n",
        )
        self.assertTrue(r["ok"])
        self.assertEqual(r["kind"], "text")

    def test_exe_rejected(self):
        r = classify_upload(
            filename="evil.exe",
            content_type="application/octet-stream",
            data=b"MZ\x90\x00" + b"\x00" * 64,
        )
        self.assertFalse(r["ok"])

    def test_binary_as_txt_rejected(self):
        r = classify_upload(
            filename="nope.txt",
            content_type="text/plain",
            data=b"\x00\x01\x02\x03" + b"\xff" * 100,
        )
        self.assertFalse(r["ok"])

    def test_too_large(self):
        r = classify_upload(
            filename="big.txt",
            content_type="text/plain",
            data=b"x" * (MAX_BYTES + 1),
        )
        self.assertFalse(r["ok"])
        self.assertEqual(r["error"], "file_too_large")

    def test_pdf_magic(self):
        r = classify_upload(
            filename="doc.pdf",
            content_type="application/pdf",
            data=b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n",
        )
        self.assertTrue(r["ok"])
        self.assertEqual(r["kind"], "pdf")


class MarkerReviewTests(unittest.TestCase):
    def test_parse_review_and_image(self):
        url = "https://myproblem-stills.b-cdn.net/chat-public/web/abc.png"
        body = f"[[mp:media kind=image url={url} channel=#web review=pending sha=abc]]"
        items = channel_media.parse_media_markers(body)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["kind"], "image")
        self.assertEqual(items[0]["review"], "pending")
        self.assertEqual(items[0]["sha"], "abc")
        self.assertTrue(channel_media.visual_cover_eligible(items[0]))

    def test_format_marker(self):
        m = bunny_upload.format_media_marker(
            kind="image",
            url="https://example/cdn/x.png",
            channel="#pt",
            review="pending",
            sha256="deadbeef",
        )
        self.assertIn("kind=image", m)
        self.assertIn("review=pending", m)
        self.assertIn("sha=deadbeef", m)


class MediaReviewQueueTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)
        irc_log_cache._rings.clear()
        self._env = mock.patch.dict(
            "os.environ",
            {
                "CLEVERTREE_LIVE_ROOT": str(self.root),
                "CLEVERTREE_CHANNEL_MEDIA_REVIEW": "1",
                "CLEVERTREE_MEDIA_REVIEW_DRY_RUN": "1",
                "GROQ_API_KEY": "",
            },
            clear=False,
        )
        self._env.start()
        self.addCleanup(self._env.stop)

    def test_enqueue_image_and_auto_clear_audio(self):
        img = "https://myproblem-stills.b-cdn.net/chat-public/web/aa.png"
        aud = "https://myproblem-stills.b-cdn.net/chat-public/web/bb.webm"
        body = (
            f"[[mp:media kind=image url={img} channel=#web review=pending]] "
            f"[[mp:media kind=audio url={aud} channel=#web review=pending]]"
        )
        jobs = channel_media_review.enqueue_from_body(
            "web",
            body,
            visitor=str(uuid.uuid4()),
            source="web",
        )
        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["media_kind"], "image")
        # Audio auto-cleared in review map
        sha = channel_media_review.sha_for_url(aud)
        stored = channel_media_review.read_review(sha)
        self.assertIsNotNone(stored)
        self.assertEqual(stored["status"], "clear")

    def test_dry_run_clears_image(self):
        img = "https://myproblem-stills.b-cdn.net/chat-public/web/cc.png"
        body = f"[[mp:media kind=image url={img} channel=#web review=pending]]"
        jobs = channel_media_review.enqueue_from_body("web", body, source="web")
        self.assertEqual(len(jobs), 1)
        events = []
        result = channel_media_review.process_job(
            jobs[0],
            broadcast=lambda topic, payload: events.append(payload),
        )
        self.assertTrue(result.get("ok"))
        self.assertEqual(result.get("status"), "clear")
        self.assertTrue(events)
        self.assertEqual(events[0]["type"], "media.review")
        self.assertEqual(events[0]["status"], "clear")

    def test_asr_dry_run_without_groq_key_clears(self):
        """No Groq key + ASR dry-run → media dry-clear (local staging)."""
        self._env.stop()
        self._env = mock.patch.dict(
            "os.environ",
            {
                "CLEVERTREE_LIVE_ROOT": str(self.root),
                "CLEVERTREE_CHANNEL_MEDIA_REVIEW": "1",
                "CLEVERTREE_MEDIA_REVIEW_DRY_RUN": "0",
                "CLEVERTREE_ASR_DRY_RUN": "1",
                "GROQ_API_KEY": "",
            },
            clear=False,
        )
        self._env.start()
        self.addCleanup(self._env.stop)
        img = "https://myproblem-stills.b-cdn.net/chat-public/web/dd.png"
        body = f"[[mp:media kind=image url={img} channel=#web review=pending]]"
        jobs = channel_media_review.enqueue_from_body("web", body, source="web")
        result = channel_media_review.process_job(jobs[0], broadcast=None)
        self.assertTrue(result.get("ok"))
        self.assertEqual(result.get("status"), "clear")

    def test_default_vision_model(self):
        self.assertEqual(
            channel_media_review.vision_model(),
            "qwen/qwen3.8-27b",
        )


if __name__ == "__main__":
    unittest.main()
