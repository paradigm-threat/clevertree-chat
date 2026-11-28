"""Unit tests for IRC-style nick sanitize + claim table."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock


class NickSanitizeTests(unittest.TestCase):
    def test_sanitize_folds_spaces_and_rejects_reserved(self):
        from clevertree_chat.nick_claims import sanitize_nick

        self.assertEqual(sanitize_nick("  Ada Lovelace "), "Ada-Lovelace")
        with self.assertRaises(ValueError):
            sanitize_nick("you")
        with self.assertRaises(ValueError):
            sanitize_nick("")

    def test_claim_suffix_when_unlocked_taken(self):
        from clevertree_chat import nick_claims

        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.dict(os.environ, {"CLEVERTREE_LIVE_ROOT": tmp}):
                a = nick_claims.claim_nick_for_visitor("bob", "vis-a")
                self.assertEqual(a["nick"], "bob")
                b = nick_claims.claim_nick_for_visitor("bob", "vis-b")
                self.assertEqual(b["nick"], "bob2")
                self.assertEqual(b["visitor"], "vis-b")

    def test_locked_nick_taken(self):
        from clevertree_chat import nick_claims

        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.dict(os.environ, {"CLEVERTREE_LIVE_ROOT": tmp}):
                nick_claims.write_claim("Carol", visitor="vis-a", locked=True)
                with self.assertRaises(nick_claims.NickTakenError):
                    nick_claims.claim_nick_for_visitor("Carol", "vis-b", allow_suffix=False)

    def test_passphrase_reclaim(self):
        from clevertree_chat import nick_claims

        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.dict(
                os.environ,
                {"CLEVERTREE_LIVE_ROOT": tmp, "CLEVERTREE_AUTH_PEPPER": "test-pepper"},
            ):
                nick_claims.set_passphrase("Dana", "vis-a", "secret-phrase")
                claim = nick_claims.reclaim_with_passphrase("Dana", "vis-b", "secret-phrase")
                self.assertEqual(claim["visitor"], "vis-b")
                self.assertTrue(claim["locked"])
                with self.assertRaises(PermissionError):
                    nick_claims.reclaim_with_passphrase("Dana", "vis-c", "wrong")


class NameActionDispatchTests(unittest.TestCase):
    def test_action_name_returns_filed_nick(self):
        """dispatch(action=name) claims + returns nick without requiring full git SoT."""
        from clevertree_chat import nick_claims
        from clevertree_chat.live_runtime import dispatch

        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.dict(os.environ, {"CLEVERTREE_LIVE_ROOT": tmp}):
                # Avoid opening real comments checkout — stub service.set_name path via claim only
                class FakeService:
                    auth = None

                    def set_name(self, visitor, name, topic="", session=None):
                        claim = nick_claims.claim_nick_for_visitor(name, visitor)
                        return {
                            "name": claim["nick"],
                            "nick": claim["nick"],
                            "claim": {"nick": claim["nick"], "locked": False},
                            "visitor": {"name": claim["nick"], "chosen": True, "locked": False},
                        }

                with mock.patch(
                    "clevertree_chat.live_runtime.open_service",
                    return_value=FakeService(),
                ):
                    with mock.patch("clevertree_chat.live_runtime._persist"):
                        code, body = dispatch(
                            {
                                "action": "name",
                                "topic": "web",
                                "visitor": "11111111-1111-4111-8111-111111111111",
                                "name": "TestNick",
                            },
                            {},
                        )
                self.assertEqual(code, 200)
                self.assertEqual(body.get("nick") or body.get("name"), "TestNick")

    def test_action_name_nick_taken_409(self):
        from clevertree_chat import nick_claims
        from clevertree_chat.live_runtime import dispatch

        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.dict(os.environ, {"CLEVERTREE_LIVE_ROOT": tmp}):
                nick_claims.write_claim("Taken", visitor="other-vis", locked=True)

                class FakeService:
                    auth = None

                    def set_name(self, visitor, name, topic="", session=None):
                        nick_claims.claim_nick_for_visitor(
                            name, visitor, allow_suffix=False
                        )
                        return {"name": name}

                with mock.patch(
                    "clevertree_chat.live_runtime.open_service",
                    return_value=FakeService(),
                ):
                    with mock.patch("clevertree_chat.live_runtime._persist"):
                        code, body = dispatch(
                            {
                                "action": "name",
                                "topic": "web",
                                "visitor": "22222222-2222-4222-8222-222222222222",
                                "name": "Taken",
                            },
                            {},
                        )
                self.assertEqual(code, 409)
                self.assertEqual(body.get("error"), "nick_taken")


if __name__ == "__main__":
    unittest.main()
