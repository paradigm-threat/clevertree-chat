"""The live /try flow: a starting slot, then the batch's placement."""

import sys
import tempfile
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import unittest

from clevertree_chat.auth import AuthRepo
from clevertree_chat.engine import Debate
from clevertree_chat.service import DebateService
from clevertree_chat.store import export_tree, materialize_comments


SURVEILLANCE = "These cameras are mass surveillance"
SECURITY = "We need these cameras now for national security"


def service_at(root: Path) -> DebateService:
    debate = Debate.create(root / "comments")
    auth = AuthRepo.create(root / "auth", b"pepper")
    debate.attach_auth(auth)
    return DebateService(debate, auth)


class TryFlowTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.service = service_at(Path(self.tmp.name))
        self.visitor = str(uuid.uuid4())

    def keys(self):
        return self.service.debate._keys("try", "flock-cameras")

    def comments(self):
        found = []
        view = self.service.view("flock-cameras", visitor=self.visitor)
        for section in view["sections"].values():
            found.extend(section["comments"])
        return found

    def test_opening_the_page_does_not_create_a_topic(self):
        view = self.service.view("flock-cameras", visitor=self.visitor)
        self.assertFalse(view["exists"])
        self.assertFalse(view["created"])
        self.assertFalse((self.service.debate.repo.path / "pages" / "try" / "topics").exists())

    def test_suggestion_does_not_file_and_a_new_key_cannot_be_typed(self):
        self.service.submit(self.visitor, "flock-cameras", SURVEILLANCE)
        self.service.drain("flock-cameras", self.visitor)
        before = len(self.comments())
        preview = self.service.preview("flock-cameras", SURVEILLANCE)
        self.assertEqual(preview["suggestion"], "invasion-of-privacy")
        self.assertFalse(preview["filed"])
        self.assertFalse(preview["can_override"])
        self.assertEqual(len(self.comments()), before)
        with self.assertRaises(ValueError):
            self.service.submit(self.visitor, "flock-cameras", "A fresh claim.", chosen="made-up-slot")
        self.assertNotIn("made-up-slot", self.keys())

    def test_no_choice_stays_uncategorized_until_the_batch_places_it(self):
        filed = self.service.submit(self.visitor, "flock-cameras", SURVEILLANCE)
        self.assertEqual(filed["starting"], "uncategorized")
        self.assertEqual(filed["key"], "uncategorized")
        self.assertEqual(self.keys(), ["uncategorized"])
        self.assertNotIn("invasion-of-privacy", self.keys())
        drained = self.service.drain("flock-cameras", self.visitor)
        self.assertFalse(drained["booted"])
        self.assertFalse(drained["cloud_api_called"])
        # Spot wake scripts are decommissioned (Linode pub1 is the chat path).
        self.assertIn("Spot decommissioned", drained["wake"])
        self.assertIn("Spot decommissioned", drained["decommission"])
        placed = self.comments()
        self.assertEqual(len(placed), 1)
        self.assertEqual(placed[0]["starting"], "uncategorized")
        self.assertEqual(placed[0]["key"], "invasion-of-privacy")
        self.assertNotIn("uncategorized", self.keys())

    def test_a_chosen_slot_is_only_the_start_and_the_batch_may_move_it(self):
        self.service.submit(self.visitor, "flock-cameras", SURVEILLANCE)
        self.service.drain("flock-cameras", self.visitor)
        self.service.submit(self.visitor, "flock-cameras", SECURITY)
        self.service.drain("flock-cameras", self.visitor)
        filed = self.service.submit(
            self.visitor,
            "flock-cameras",
            "This is still mass surveillance of the street.",
            chosen="national-security",
        )
        self.assertEqual(filed["key"], "national-security")
        self.assertEqual(filed["starting"], "national-security")
        self.service.drain("flock-cameras", self.visitor)
        moved = [
            comment
            for comment in self.comments()
            if comment["starting"] == "national-security"
        ]
        self.assertEqual(len(moved), 1)
        self.assertEqual(moved[0]["key"], "invasion-of-privacy")

    def test_non_arguments_land_in_other_as_one_file_each(self):
        for body in ("lol", "What time is it?", "You are an idiot."):
            self.service.submit(str(uuid.uuid4()), "flock-cameras", body)
        self.assertEqual(self.keys(), ["uncategorized"])
        self.service.drain("flock-cameras")
        self.assertEqual(self.keys(), ["other"])
        held = self.service.debate.repo.path / "pages/try/topics/flock-cameras/other/comments"
        self.assertEqual(len(list(held.glob("*.md"))), 3)
        self.assertFalse(
            (self.service.debate.repo.path / "pages/try/topics/flock-cameras/uncategorized").exists()
        )

    def test_a_spill_opens_illegal_when_privacy_does_not_fit(self):
        self.service.submit(self.visitor, "flock-cameras", SURVEILLANCE)
        self.service.drain("flock-cameras", self.visitor)
        self.assertEqual(self.keys(), ["invasion-of-privacy"])
        self.service.submit(self.visitor, "flock-cameras", "but it's illegal!")
        self.service.drain("flock-cameras", self.visitor)
        self.assertIn("illegal", self.keys())
        self.assertNotIn("patriot-act", self.keys())
        files = list(
            (self.service.debate.repo.path / "pages/try/topics/flock-cameras").rglob("comments/*.md")
        )
        bodies = [path.read_text() for path in files]
        self.assertEqual(sum("but it's illegal!" in text for text in bodies), 1)
        questions = (
            self.service.debate.repo.path
            / "pages/try/topics/flock-cameras/illegal/questions.md"
        ).read_text()
        self.assertIn("?", questions)

    def test_a_question_that_names_illegal_joins_it(self):
        body = "Are these cameras illegal?"
        self.service.submit(self.visitor, "flock-cameras", body)
        self.service.drain("flock-cameras", self.visitor)
        self.assertIn("illegal", self.keys())
        filed = [comment for comment in self.comments() if comment["text"] == body]
        self.assertTrue(filed)
        self.assertIn("illegal", filed[0]["keys"])

    def test_one_body_is_referenced_from_each_fitting_category(self):
        self.service.submit(self.visitor, "flock-cameras", SURVEILLANCE)
        self.service.submit(self.visitor, "flock-cameras", "They are illegal")
        self.service.drain("flock-cameras", self.visitor)
        body = "These cameras are mass surveillance. They are illegal."
        self.service.submit(self.visitor, "flock-cameras", body)
        self.service.drain("flock-cameras", self.visitor)
        files = list(
            (self.service.debate.repo.path / "pages/try/topics/flock-cameras").rglob("comments/*.md")
        )
        self.assertEqual(sum(body in path.read_text() for path in files), 1)
        shown = [comment for comment in self.comments() if comment["text"] == body]
        self.assertGreaterEqual(len(shown), 2)
        self.assertEqual(set(shown[0]["keys"]), {"invasion-of-privacy", "illegal"})

    def test_the_patriot_act_is_a_cited_suggestion_not_a_directory(self):
        self.service.submit(
            self.visitor,
            "flock-cameras",
            "The Patriot Act already allows this surveillance.",
        )
        view = self.service.drain("flock-cameras", self.visitor)["view"]
        self.assertNotIn("patriot-act", self.keys())
        self.assertTrue(
            any(
                item["key"] == "patriot-act" and "congress.gov" in item["citation"]
                for item in view["suggestions"]
            )
        )

    def test_one_post_is_not_split_into_two_files(self):
        body = "These cameras are mass surveillance. They are illegal."
        self.service.submit(self.visitor, "flock-cameras", body)
        self.service.drain("flock-cameras", self.visitor)
        files = list((self.service.debate.repo.path / "pages/try/topics/flock-cameras").rglob("comments/*.md"))
        self.assertEqual(len(files), 1)
        self.assertIn(body, files[0].read_text())

    def test_markdown_links_render_and_raw_html_does_not(self):
        body = 'Read [the note](https://example.com/a)\n<script>alert(1)</script>'
        self.service.submit(self.visitor, "flock-cameras", body)
        html = self.comments()[0]["html"]
        self.assertIn('<a href="https://example.com/a">', html)
        self.assertNotIn("<script>", html)
        self.assertIn("&lt;script&gt;", html)

    def test_a_chosen_name_is_shown_and_votes_do_not_rename_keys(self):
        self.service.submit(self.visitor, "flock-cameras", SURVEILLANCE, name="Ada North")
        self.service.drain("flock-cameras", self.visitor)
        self.assertEqual(self.comments()[0]["author"], "Ada North")
        keys = self.keys()
        view = self.service.vote(self.visitor, topic="flock-cameras", level="topic")
        self.assertEqual(view["sections"]["invasion-of-privacy"]["topic_tally"], 1)
        view = self.service.vote(self.visitor, topic="flock-cameras", level="topic")
        self.assertEqual(view["sections"]["invasion-of-privacy"]["topic_tally"], 0)
        self.assertEqual(self.keys(), keys)

    def test_section_notices_are_not_about_a_new_comment(self):
        self.service.submit(self.visitor, "flock-cameras", SURVEILLANCE)
        view = self.service.drain("flock-cameras", self.visitor)["view"]
        self.assertTrue(view["notices"])
        self.assertTrue(all(notice["kind"] != "comment" for notice in view["notices"]))
        suggestions = view["suggestions"]
        self.assertTrue(any(item["key"] == "national-security" and item["citation"].startswith("https://") for item in suggestions))
        self.assertNotIn("national-security", self.keys())

    def test_snapshot_keeps_the_post_and_leaves_auth_private(self):
        self.service.submit(self.visitor, "flock-cameras", SURVEILLANCE)
        self.service.auth.register_passkey(
            self.service.debate,
            uuid=self.visitor,
            credential_id="cred-live",
            public_key="pk-live",
            email="reader@example.com",
        )
        files = export_tree(self.service.debate.repo.path)
        blob = "\n".join(files.values())
        self.assertIn(SURVEILLANCE, blob)
        self.assertNotIn("email_hmac", blob)
        self.assertNotIn("pk-live", blob)
        restored = materialize_comments(Path(self.tmp.name) / "restored", files)
        text = "\n".join(export_tree(restored.repo.path).values())
        self.assertIn(SURVEILLANCE, text)
        options = self.service.passkey_options(self.visitor)
        self.assertEqual(options["options"]["authenticatorSelection"]["residentKey"], "required")
        self.assertEqual(options["options"]["authenticatorSelection"]["userVerification"], "required")


if __name__ == "__main__":
    unittest.main()
