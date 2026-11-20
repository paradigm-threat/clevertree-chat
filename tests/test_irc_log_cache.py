"""Ephemeral IRC/WS log cache + batch-curated chat transcripts."""

from __future__ import annotations

import json
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest import mock

from clevertree_chat import chat_transcript, irc_log_cache
from clevertree_chat.rules import parse_rules
from clevertree_chat.store import materialize_comments


class IrcLogCacheTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)
        irc_log_cache._rings.clear()
        irc_log_cache._segment_started.clear()
        irc_log_cache._segment_bytes.clear()
        self._env = mock.patch.dict(
            "os.environ",
            {"CLEVERTREE_LIVE_ROOT": str(self.root)},
            clear=False,
        )
        self._env.start()
        self.addCleanup(self._env.stop)

    def test_append_and_recent(self):
        vid = str(uuid.uuid4())
        irc_log_cache.append_line(
            "ga-cats",
            body="[[nd:z0m2zzlro/abc]] hello",
            visitor=vid,
            source="ws",
            nick="trapper",
        )
        recent = irc_log_cache.recent("ga-cats")
        self.assertEqual(len(recent), 1)
        self.assertEqual(recent[0]["body"], "[[nd:z0m2zzlro/abc]] hello")
        self.assertEqual(recent[0]["visitor"], vid)
        self.assertEqual(recent[0]["source"], "ws")
        self.assertNotIn("_epoch", recent[0])
        current = irc_log_cache.irc_logs_dir("ga-cats") / "current.jsonl"
        self.assertTrue(current.is_file())

    def test_flush_enqueues_job(self):
        vid = str(uuid.uuid4())
        irc_log_cache.append_line(
            "general", body="first", visitor=vid, source="irc", nick="alice"
        )
        seg = irc_log_cache.flush_topic("general")
        self.assertIsNotNone(seg)
        assert seg is not None
        self.assertTrue(seg.is_file())
        jobs = irc_log_cache.list_pending_jobs()
        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["kind"], "irc_log")
        self.assertEqual(jobs[0]["topic"], "general")
        self.assertEqual(jobs[0]["site"], "clevertree")
        self.assertIn("payload_ref", jobs[0])


class ChatTranscriptTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)
        self.live = self.root / "live"
        self.comments = self.root / "comments"
        self.comments.mkdir()
        irc_log_cache._rings.clear()
        irc_log_cache._segment_started.clear()
        irc_log_cache._segment_bytes.clear()
        self._env = mock.patch.dict(
            "os.environ",
            {"CLEVERTREE_LIVE_ROOT": str(self.live)},
            clear=False,
        )
        self._env.start()
        self.addCleanup(self._env.stop)
        self.debate = materialize_comments(self.comments, {})

    def test_accept_writes_minimized_jsonl(self):
        vid = str(uuid.uuid4())
        irc_log_cache.append_line(
            "ga-cats",
            body="need a trapper Thu",
            visitor=vid,
            source="irc",
            nick="bob",
        )
        seg = irc_log_cache.flush_topic("ga-cats")
        jobs = irc_log_cache.list_pending_jobs()
        self.assertEqual(len(jobs), 1)
        result = chat_transcript.accept_irc_log_job(
            self.debate, jobs[0], rules=parse_rules(None)
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["stored"], 1)
        day_files = list((self.comments / "pages" / "ga-cats" / "chat").glob("*.jsonl"))
        self.assertEqual(len(day_files), 1)
        line = json.loads(day_files[0].read_text(encoding="utf-8").strip().splitlines()[0])
        self.assertIn("u", line)
        self.assertNotIn("visitor", line)
        self.assertEqual(line["b"], "need a trapper Thu")
        index = json.loads((self.comments / "users" / "index.json").read_text())
        self.assertIn(vid, index["by_uuid"])
        self.assertEqual(int(line["u"]), int(index["by_uuid"][vid]["id"]))

    def test_chat_store_never_skips_write(self):
        vid = str(uuid.uuid4())
        irc_log_cache.append_line(
            "ga-cats", body="noise", visitor=vid, source="ws"
        )
        irc_log_cache.flush_topic("ga-cats")
        jobs = irc_log_cache.list_pending_jobs()
        rules = parse_rules("chat_store: never\n")
        result = chat_transcript.accept_irc_log_job(
            self.debate, jobs[0], rules=rules
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["stored"], 0)
        self.assertEqual(result["reason"], "chat_store:never")
        self.assertFalse((self.comments / "pages" / "ga-cats" / "chat").exists())


class ChatStoreRulesTests(unittest.TestCase):
    def test_parse_chat_store(self):
        self.assertEqual(parse_rules(None).chat_store, "full")
        self.assertEqual(parse_rules("chat_store: never\n").chat_store, "never")
        self.assertEqual(
            parse_rules("Do not store chat transcripts.\n").chat_store, "never"
        )
        self.assertEqual(
            parse_rules("chat_store: summaries\n").chat_store, "summaries"
        )


if __name__ == "__main__":
    unittest.main()
