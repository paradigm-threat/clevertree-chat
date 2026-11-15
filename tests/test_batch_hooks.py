"""Unit tests for post-drain hooks (assoc, spam, fetch, questions)."""

from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from clevertree_chat.batch_hooks import after_drain, _collect_questions
from clevertree_chat.fetch import fetch_url, probe_egress
from clevertree_chat.gauge import measure_batch, spot_wake_enabled


class _FakeRepo:
    def __init__(self, root: Path) -> None:
        self.path = root
        self.writes: list[dict] = []

    def commit_changes(self, writes, deletes, message, author):
        for rel, text in (writes or {}).items():
            path = self.path / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
        self.writes.append({"writes": writes, "message": message, "author": author})


class _FakeDebate:
    def __init__(self, root: Path) -> None:
        self.repo = _FakeRepo(root)

    def rules(self):
        return {}


class BatchHooksTests(unittest.TestCase):
    def test_associations_and_spam_and_questions(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "pages" / "example.com").mkdir(parents=True)
            (root / "pages" / "www.example.com").mkdir(parents=True)
            (root / "pages" / "general" / "topics" / "general" / "flat-earth").mkdir(
                parents=True
            )
            qpath = (
                root
                / "pages"
                / "general"
                / "topics"
                / "general"
                / "flat-earth"
                / "questions.md"
            )
            qpath.write_text("# Questions\n\n- Is this axis correct?\n")
            spam = (
                root
                / "pages"
                / "general"
                / "topics"
                / "general"
                / "flat-earth"
                / "comments"
                / "c1"
                / "spam.json"
            )
            spam.parent.mkdir(parents=True)
            spam.write_text(
                json.dumps({"flagged_at": "2099-01-01T00:00:00+00:00"}) + "\n"
            )
            debate = _FakeDebate(root)
            with mock.patch("clevertree_chat.batch_hooks._announce_questions_irc"):
                notes = after_drain(debate, topics=["general"])
            self.assertGreaterEqual(notes["associations"]["touched"], 2)
            self.assertEqual(notes["spam"]["scanned"], 1)
            self.assertEqual(notes["spam"]["updated"], 1)
            state = json.loads(
                (spam.parent / "spam-state.json").read_text()
            )
            self.assertEqual(state["state"], "flagged")
            asks = _collect_questions(root, ["general"])
            self.assertTrue(asks)
            self.assertIn("axis", asks[0]["question"])

    def test_fetch_disabled_by_default(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            sc = root / "pages" / "5g" / "topics" / "5g" / "x" / "suggested-counter.md"
            sc.parent.mkdir(parents=True)
            sc.write_text("# Suggested\n\nSee https://example.com/\n")
            env = {k: v for k, v in os.environ.items() if k != "CLEVERTREE_FETCH"}
            with mock.patch.dict(os.environ, env, clear=True):
                with mock.patch("clevertree_chat.batch_hooks._announce_questions_irc"):
                    notes = after_drain(_FakeDebate(root), topics=["5g"])
            self.assertFalse(notes["fetch"]["enabled"])


class FetchUnitTests(unittest.TestCase):
    def test_unsupported_scheme(self):
        r = fetch_url("ftp://example.com/")
        self.assertFalse(r.ok)
        self.assertIn("scheme", r.error)

    def test_probe_shape(self):
        with mock.patch(
            "clevertree_chat.fetch.fetch_url",
            side_effect=lambda u: type(
                "R",
                (),
                {
                    "as_dict": lambda self: {
                        "url": u,
                        "ok": True,
                        "blocked": False,
                        "status": 200,
                        "title": "t",
                        "excerpt": "e",
                        "error": "",
                    },
                },
            )(),
        ):
            payload = probe_egress(["https://example.com/"])
        self.assertEqual(payload["ok_count"], 1)
        self.assertIn("results", payload)


class GaugeWakeGateTests(unittest.TestCase):
    def test_wake_env_off_by_default(self):
        with mock.patch.dict(os.environ, {"CLEVERTREE_SPOT_WAKE": ""}, clear=False):
            self.assertFalse(spot_wake_enabled())

    def test_measure_records_wake_requested(self):
        with tempfile.TemporaryDirectory() as tmp:
            debate = _FakeDebate(Path(tmp))
            with mock.patch.dict(os.environ, {"CLEVERTREE_SPOT_WAKE": "1"}, clear=False):
                note = measure_batch(debate)
            self.assertTrue(note["wake_requested"])
            self.assertFalse(note["cloud_api_called"])
            self.assertIn("WAKE_REQUESTED=1", note["wake"])


if __name__ == "__main__":
    unittest.main()
