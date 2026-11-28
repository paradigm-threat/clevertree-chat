"""Unit tests for Bunny inbox isolation + room claim queue."""

from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock


class InboxPathTests(unittest.TestCase):
    def test_derive_source_user_prefers_networker(self):
        from clevertree_chat import inbox

        self.assertTrue(
            inbox.derive_source_user(networker_id="abc123", visitor="vis").startswith("nw:")
        )
        self.assertEqual(
            inbox.derive_source_user(kind="si", si_service="investigate"),
            "si:investigate",
        )
        self.assertEqual(inbox.derive_source_user(visitor="user-1"), "user-1")

    def test_object_dir_isolation(self):
        from clevertree_chat import inbox

        a = inbox.object_dir("chat", "alice", "obj-1")
        b = inbox.object_dir("chat", "bob", "obj-1")
        self.assertIn("alice", a)
        self.assertIn("bob", b)
        self.assertNotEqual(a, b)

    def test_cross_user_replace_rejected(self):
        from clevertree_chat import inbox

        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.dict(os.environ, {"CLEVERTREE_LIVE_ROOT": tmp}):
                inbox.upsert_index(
                    {
                        "object_id": "shared-id",
                        "source_user": "alice",
                        "kind": "chat",
                        "urls": [],
                        "status": "pending",
                    }
                )
                err = inbox.assert_same_owner("alice", "shared-id", "bob")
                self.assertIsNotNone(err)
                self.assertEqual(err["error"], "object_owned_by_other_user")
                ok = inbox.assert_same_owner("alice", "shared-id", "alice")
                self.assertIsNone(ok)

    def test_put_object_writes_index(self):
        from clevertree_chat import inbox

        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.dict(
                os.environ,
                {
                    "CLEVERTREE_LIVE_ROOT": tmp,
                    "BUNNY_STORAGE_API_KEY": "test-key",
                },
            ):
                fake = {
                    "ok": True,
                    "url": "https://cdn.example/inbox/chat/alice/oid1/f.bin",
                    "path": "inbox/chat/alice/oid1/f.bin",
                    "status": 200,
                }
                with mock.patch("clevertree_chat.inbox.put_bytes", return_value=fake):
                    with mock.patch(
                        "clevertree_chat.inbox.classify_upload",
                        return_value={
                            "ok": True,
                            "ext": "bin",
                            "mime": "application/octet-stream",
                            "kind": "file",
                        },
                    ):
                        result = inbox.put_object(
                            b"hello",
                            filename="f.bin",
                            content_type="application/octet-stream",
                            kind="chat",
                            source_user="alice",
                            object_id="oid1",
                            also_blob=False,
                        )
                self.assertTrue(result.get("ok"))
                self.assertEqual(result["object_id"], "oid1")
                idx = Path(tmp) / "inbox-index" / "alice" / "oid1.json"
                self.assertTrue(idx.is_file())
                data = json.loads(idx.read_text())
                self.assertEqual(data["source_user"], "alice")
                self.assertEqual(data["content_hash"], result["sha256"])


class ClaimQueueTests(unittest.TestCase):
    def test_room_queue_only_default_on(self):
        from clevertree_chat import claim_queue

        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("CLEVERTREE_ROOM_QUEUE_ONLY", None)
            self.assertTrue(claim_queue.room_queue_only())
        with mock.patch.dict(os.environ, {"CLEVERTREE_ROOM_QUEUE_ONLY": "0"}):
            self.assertFalse(claim_queue.room_queue_only())

    def test_enqueue_claim_writes_pending(self):
        from clevertree_chat import claim_queue

        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.dict(os.environ, {"CLEVERTREE_LIVE_ROOT": tmp}):
                rec = claim_queue.enqueue_claim(
                    topic="mp-general",
                    page="mp-general",
                    body="hello claim",
                    visitor="vis-1",
                    source="web",
                )
                self.assertEqual(rec["status"], "pending")
                path = Path(tmp) / "queue" / "claims" / f"{rec['id']}.json"
                self.assertTrue(path.is_file())
                pending = claim_queue.list_pending()
                self.assertEqual(len(pending), 1)
                self.assertEqual(pending[0]["body"], "hello claim")
                self.assertTrue(claim_queue.mark_status(rec["id"], "accepted"))
                self.assertEqual(claim_queue.list_pending(), [])


if __name__ == "__main__":
    unittest.main()
