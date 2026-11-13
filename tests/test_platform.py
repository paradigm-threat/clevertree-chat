import json
import re
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import unittest

from clevertree_chat import SERVICE_EMAIL, SERVICE_ID
from clevertree_chat.classify import classify, rename_allowed
from clevertree_chat.engine import Debate
from clevertree_chat.keys import assert_short_key, slugify
from clevertree_chat.names import ALLOWLIST, empty_index, generated_name, issue_id
from clevertree_chat.repo import git_commit_command
from clevertree_chat.rules import default_rules, default_rules_text, parse_rules

ROOT = Path(__file__).resolve().parents[1]
SURVEILLANCE = "These cameras are mass surveillance"
SECURITY = "We need these cameras now for national security"
BORDERS = "They watch the borders, the elections, and crime"
ILLEGAL = "They are illegal"
LEGAL = "They are legal"


def new_uuid():
    return str(uuid.uuid4())


class DebateCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.debate = Debate.create(Path(self.tmp.name) / "debate")

    def keys(self, page, topic):
        root = self.debate.repo.path / "pages" / page / "topics" / topic
        if not root.exists():
            return []
        return sorted(path.name for path in root.iterdir() if path.is_dir())

    def bodies(self, page, topic, key):
        directory = (
            self.debate.repo.path / "pages" / page / "topics" / topic / key / "comments"
        )
        found = []
        if not directory.exists():
            return found
        for path in sorted(directory.glob("*.md")):
            found.append(path.read_text().split("\n\n", 1)[1].strip())
        return found

    def file_posts(self, posts, topic, page="demo", user=None):
        user = user or new_uuid()
        for post in posts:
            self.debate.submit(user, page=page, topic=topic, body=post["body"])
        return user


class KeyTests(unittest.TestCase):
    def test_slug_is_lowercase_and_hyphenated(self):
        self.assertEqual(slugify("Invasion of Privacy"), "invasion-of-privacy")
        self.assertEqual(slugify("  National   Security "), "national-security")

    def test_sentence_length_slug_is_rejected(self):
        with self.assertRaises(ValueError) as caught:
            assert_short_key("these-cameras-watch-every-street-and-should")
        self.assertIn("sentence-length", str(caught.exception))

    def test_fixture_posts_land_on_short_keys(self):
        for name in ("flock-cameras.json", "library-fines.json"):
            fixture = json.loads((ROOT / "fixtures" / name).read_text())
            for post in fixture["posts"]:
                key = classify(fixture["topic"], post["body"])
                self.assertEqual(key, post["key"])
                assert_short_key(key)

    def test_illegal_and_legal_are_not_merged_into_content_keys(self):
        rules = default_rules()
        self.assertFalse(
            rename_allowed("flock-cameras", "illegal", "invasion-of-privacy", rules)
        )
        self.assertFalse(
            rename_allowed("flock-cameras", "legal", "national-security", rules)
        )
        self.assertTrue(
            rename_allowed("flock-cameras", "mass-surveillance", "invasion-of-privacy", rules)
        )
        frozen = parse_rules("Keys never change.\n")
        self.assertFalse(
            rename_allowed("flock-cameras", "mass-surveillance", "invasion-of-privacy", frozen)
        )

    def test_failure_fixture_lists_the_protected_cases(self):
        payload = json.loads((ROOT / "fixtures" / "failures.json").read_text())
        self.assertGreaterEqual(len(payload["cases"]), 10)


class RuleTests(unittest.TestCase):
    def test_missing_rules_are_the_relay_defaults(self):
        rules = parse_rules(None)
        self.assertTrue(rules.fair)
        self.assertTrue(rules.everyone_heard)
        self.assertTrue(rules.honest)
        self.assertTrue(rules.check_bias)
        self.assertTrue(rules.represent_dangerous)
        self.assertTrue(rules.users_may_swear)
        self.assertFalse(rules.ai_may_swear)
        self.assertTrue(rules.emotionless)
        self.assertEqual(rules.keys, "ai")
        self.assertIn("professional", rules.generated_names)
        self.assertIn("safe for work", rules.generated_names)
        text = default_rules_text()
        self.assertIn("Mainstream", text)
        self.assertIn("dangerous or antisocial", text)
        self.assertIn("Do not mint a key just to catch every sentence", text)
        self.assertIn("Questions are allowed", text)
        parsed = parse_rules(text)
        self.assertEqual(parsed.keys, "ai")
        self.assertEqual(parsed.mint, "spill")
        self.assertTrue(parsed.allows_new_key())
        self.assertTrue(parsed.questions_allowed)
        self.assertFalse(parsed.ai_may_swear)
        self.assertEqual(parse_rules("Never open a new topic.\n").mint, "never")
        self.assertFalse(parse_rules("Never open a new topic.\n").allows_new_key())
        self.assertFalse(parse_rules("Do not ask questions.\n").questions_allowed)

    def test_rarely_does_not_freeze_and_never_does(self):
        self.assertEqual(parse_rules("Keys change rarely.\n").keys, "rarely")
        self.assertTrue(parse_rules("Keys change rarely.\n").allows_rename())
        self.assertEqual(parse_rules("Keys never change.\n").keys, "never")
        self.assertFalse(parse_rules("Keys do not change at all.\n").allows_rename())


class FilingTests(DebateCase):
    def test_spill_lists_one_post_on_each_fitting_key(self):
        """Template. One body, every key it fits, and a new key only on a spill."""
        user = new_uuid()
        page, topic = "demo", "flock-cameras"
        root = self.debate.repo.path / "pages" / page / "topics" / topic

        def files_containing(sentence):
            return [
                path
                for path in root.rglob("comments/*.md")
                if sentence in path.read_text()
            ]

        def listed_paths(key):
            payload = json.loads((root / key / "listing.json").read_text())
            return [item["path"] for item in payload["comments"]]

        self.debate.submit(user, page=page, topic=topic, body="Mass surveillance is necessary.")
        self.debate.drain()
        self.assertEqual(self.keys(page, topic), ["invasion-of-privacy"])
        for absent in ("national-security", "illegal", "legal", "other"):
            self.assertNotIn(absent, self.keys(page, topic))

        self.debate.submit(user, page=page, topic=topic, body="Are these cameras mass surveillance?")
        self.debate.drain()
        self.assertEqual(self.keys(page, topic), ["invasion-of-privacy"])
        self.assertIn(
            "Are these cameras mass surveillance?",
            self.bodies(page, topic, "invasion-of-privacy"),
        )

        reply = "but it's illegal!"
        self.debate.submit(user, page=page, topic=topic, body=reply)
        self.debate.drain()
        self.assertEqual(self.keys(page, topic), ["illegal", "invasion-of-privacy"])
        self.assertNotIn("legal", self.keys(page, topic))
        self.assertNotIn("national-security", self.keys(page, topic))
        reply_files = files_containing(reply)
        self.assertEqual(len(reply_files), 1)
        self.assertIn(reply, self.bodies(page, topic, "illegal"))
        suggestion = (root / "illegal" / "suggested-counter.md").read_text()
        self.assertIn("Patriot Act", suggestion)
        self.assertIn(
            "https://www.congress.gov/bill/107th-congress/house-bill/3162",
            suggestion,
        )
        self.assertIn("?", (root / "illegal" / "questions.md").read_text())
        self.assertFalse((root / "legal").exists())
        head = self.debate.repo.head()
        again = self.debate.drain()
        self.assertEqual(self.debate.repo.head(), head)
        self.assertEqual(again.commits, 0)
        self.assertFalse((root / "legal").exists())

        shared = "These cameras are illegal mass surveillance."
        self.debate.submit(user, page=page, topic=topic, body=shared)
        self.debate.drain()
        self.assertEqual(self.keys(page, topic), ["illegal", "invasion-of-privacy"])
        self.assertFalse((root / "legal").exists())
        shared_files = files_containing(shared)
        self.assertEqual(len(shared_files), 1)
        relative = str(shared_files[0].relative_to(root))
        self.assertIn(relative, listed_paths("illegal"))
        self.assertIn(relative, listed_paths("invasion-of-privacy"))
        self.assertEqual(listed_paths("illegal").count(relative), 1)
        self.assertEqual(listed_paths("invasion-of-privacy").count(relative), 1)

        self.debate.submit(user, page=page, topic=topic, body="Are these cameras illegal?")
        self.debate.drain()
        self.assertEqual(self.keys(page, topic), ["illegal", "invasion-of-privacy"])
        self.assertIn("Are these cameras illegal?", self.bodies(page, topic, "illegal"))
        self.assertNotIn("other", self.keys(page, topic))
        self.assertFalse((root / "legal").exists())
        self.assertFalse((root / "national-security").exists())
        self.assertEqual(self.debate.repo.status().strip(), "")

    def test_a_posted_rule_can_refuse_a_new_topic(self):
        user = new_uuid()
        self.debate.post_rules("Never open a new topic.\nDo not ask questions.\n")
        self.debate.submit(user, page="demo", topic="flock-cameras", body="Mass surveillance is necessary.")
        self.debate.drain()
        self.debate.submit(user, page="demo", topic="flock-cameras", body="Are these cameras illegal?")
        self.debate.drain()
        self.assertEqual(self.keys("demo", "flock-cameras"), ["other"])
        self.assertNotIn("illegal", self.keys("demo", "flock-cameras"))
        self.assertNotIn("invasion-of-privacy", self.keys("demo", "flock-cameras"))
        self.assertNotIn("legal", self.keys("demo", "flock-cameras"))
        self.assertIn("Are these cameras illegal?", self.bodies("demo", "flock-cameras", "other"))
        self.assertIn("Mass surveillance is necessary.", self.bodies("demo", "flock-cameras", "other"))

    def test_preview_suggests_an_existing_category_and_does_not_file(self):
        preview = self.debate.preview(page="demo", topic="flock-cameras", body=SURVEILLANCE)
        self.assertIsNone(preview["suggestion"])
        self.assertIsNone(preview["key"])
        self.assertFalse(preview["can_override"])
        self.assertTrue(preview["can_choose_existing"])
        self.assertFalse(preview["created"])
        self.assertFalse((self.debate.repo.path / "pages").exists())
        self.assertEqual(self.debate.repo.status().strip(), "")
        self.debate.submit(new_uuid(), page="demo", topic="flock-cameras", body=SURVEILLANCE)
        self.debate.drain()
        again = self.debate.preview(page="demo", topic="flock-cameras", body=SURVEILLANCE)
        self.assertEqual(again["suggestion"], "invasion-of-privacy")
        self.assertFalse(again["created"])
        self.assertEqual(self.debate.repo.status().strip(), "")

    def test_submit_without_a_choice_stays_uncategorized_until_the_batch(self):
        user = new_uuid()
        result = self.debate.submit(
            user,
            page="demo",
            topic="flock-cameras",
            body=SURVEILLANCE + " I disagree with the key.",
            key="legal",
            force=True,
            override_key="national-security",
        )
        self.assertEqual(result["key"], "uncategorized")
        self.assertEqual(result["starting"], "uncategorized")
        self.assertFalse(result["can_override"])
        self.assertEqual(result["filing_line"], "Make your opinion finally heard.")
        self.assertEqual(self.keys("demo", "flock-cameras"), ["uncategorized"])
        self.assertNotIn("legal", self.keys("demo", "flock-cameras"))
        self.assertNotIn("national-security", self.keys("demo", "flock-cameras"))
        self.debate.drain()
        self.assertNotIn("uncategorized", self.keys("demo", "flock-cameras"))
        self.assertIn("disagree", self.bodies("demo", "flock-cameras", "invasion-of-privacy")[0])

    def test_manual_choice_files_into_that_key_and_the_batch_may_move_it(self):
        user = new_uuid()
        with self.assertRaises(ValueError) as caught:
            self.debate.submit(
                user,
                page="demo",
                topic="flock-cameras",
                body=ILLEGAL,
                chosen="brand-new-key",
            )
        self.assertIn("cannot be typed", str(caught.exception))
        self.assertFalse((self.debate.repo.path / "pages").exists())

        self.debate.place(
            user,
            page="demo",
            topic="flock-cameras",
            key="mass-surveillance",
            body=SURVEILLANCE,
        )
        filed = self.debate.submit(
            user,
            page="demo",
            topic="flock-cameras",
            body="This is an invasion of privacy.",
            chosen="mass-surveillance",
        )
        self.assertEqual(filed["key"], "mass-surveillance")
        self.assertFalse(filed["can_override"])
        self.assertIn(
            "This is an invasion of privacy.",
            self.bodies("demo", "flock-cameras", "mass-surveillance"),
        )
        self.assertNotIn("invasion-of-privacy", self.keys("demo", "flock-cameras"))

        self.debate.place(
            user,
            page="demo",
            topic="flock-cameras",
            key="illegal",
            body=ILLEGAL,
        )
        misplaced = self.debate.submit(
            user,
            page="demo",
            topic="flock-cameras",
            body=SECURITY,
            chosen="illegal",
        )
        self.assertEqual(misplaced["key"], "illegal")
        self.assertIn(SECURITY, self.bodies("demo", "flock-cameras", "illegal"))

        self.debate.drain()
        self.assertIn(SURVEILLANCE, self.bodies("demo", "flock-cameras", "invasion-of-privacy"))
        self.assertIn(
            "This is an invasion of privacy.",
            self.bodies("demo", "flock-cameras", "invasion-of-privacy"),
        )
        self.assertNotIn("mass-surveillance", self.keys("demo", "flock-cameras"))
        self.assertEqual(
            self.debate.resolve("demo", "flock-cameras", "mass-surveillance"),
            "invasion-of-privacy",
        )
        history = json.loads(
            (self.debate.repo.path / "pages/demo/topics/flock-cameras/key-history.json").read_text()
        )
        index = json.loads((self.debate.repo.path / "pages/demo/index.json").read_text())
        self.assertEqual(history["mass-surveillance"], "invasion-of-privacy")
        self.assertEqual(
            index["old_keys"]["flock-cameras/mass-surveillance"],
            "flock-cameras/invasion-of-privacy",
        )
        self.assertIn(SECURITY, self.bodies("demo", "flock-cameras", "national-security"))
        self.assertNotIn(SECURITY, self.bodies("demo", "flock-cameras", "illegal"))
        self.assertIn(ILLEGAL, self.bodies("demo", "flock-cameras", "illegal"))
        self.assertEqual(self.debate.resolve("demo", "flock-cameras", "illegal"), "illegal")
        self.assertNotIn("illegal", history)

    def test_non_argument_is_kept_and_lands_in_other_after_batch(self):
        user = new_uuid()
        for body in ("lol", "Why?", "you idiot", "   "):
            result = self.debate.submit(user, page="demo", topic="flock-cameras", body=body)
            self.assertEqual(result["key"], "uncategorized")
        self.assertEqual(self.keys("demo", "flock-cameras"), ["uncategorized"])
        holding = self.bodies("demo", "flock-cameras", "uncategorized")
        self.assertIn("lol", holding)
        self.assertIn("Why?", holding)
        self.assertIn("you idiot", holding)
        self.assertIn("", holding)
        self.debate.drain()
        self.assertEqual(self.keys("demo", "flock-cameras"), ["other"])
        self.assertFalse(
            (self.debate.repo.path / "pages/demo/topics/flock-cameras/uncategorized").exists()
        )
        landed = self.bodies("demo", "flock-cameras", "other")
        self.assertIn("lol", landed)
        self.assertIn("Why?", landed)
        self.assertIn("you idiot", landed)
        self.assertIn("", landed)
        self.assertFalse(
            (self.debate.repo.path / "pages/demo/topics/flock-cameras/invasion-of-privacy").exists()
        )

    def test_seed_case_files_a_clean_tree(self):
        fixture = json.loads((ROOT / "fixtures" / "flock-cameras.json").read_text())
        user = self.file_posts(fixture["posts"], fixture["topic"])
        result = self.debate.drain()
        self.assertTrue(result.hardware_should_shut_down)
        self.assertIn("shut down", result.message.lower())
        self.assertFalse(result.cloud_api_called)
        self.assertEqual(result.queue, "job.json")
        self.assertEqual(self.keys("demo", "flock-cameras"), [
            "illegal",
            "invasion-of-privacy",
            "legal",
            "national-security",
        ])
        for absent in fixture["absent_keys"]:
            self.assertNotIn(absent, self.keys("demo", "flock-cameras"))
        for post in fixture["posts"]:
            self.assertIn(post["body"], self.bodies("demo", "flock-cameras", post["key"]))
        pairs = json.loads(
            (self.debate.repo.path / "pages/demo/topics/flock-cameras/pairs.json").read_text()
        )
        self.assertIn("paired with", pairs["read"])
        self.assertEqual(
            {tuple(item) for item in pairs["pairs"]},
            {tuple(sorted(item)) for item in fixture["pairs"]},
        )
        linked = {tuple(item) for item in pairs["links"]}
        self.assertIn(("illegal", "invasion-of-privacy"), linked)
        self.assertIn(("legal", "national-security"), linked)
        illegal_body = "\n".join(self.bodies("demo", "flock-cameras", "illegal"))
        privacy_body = "\n".join(self.bodies("demo", "flock-cameras", "invasion-of-privacy"))
        self.assertIn("illegal", illegal_body)
        self.assertNotIn("They are illegal", privacy_body)
        self.assertEqual(self.debate.repo.status().strip(), "")
        self.assertEqual(self.debate.repo.log_author(), SERVICE_ID)
        for key in self.keys("demo", "flock-cameras"):
            assert_short_key(key)
            position = (
                self.debate.repo.path / "pages/demo/topics/flock-cameras" / key / "position.md"
            ).read_text()
            self.assertNotIn("<", position)
        self.assertFalse(any("poll" in name for name in self.debate.repo.files()))
        index = json.loads((self.debate.repo.path / "users/index.json").read_text())
        self.assertIn(user, index["by_uuid"])
        self.assertNotIn(user, privacy_body)

    def test_library_fines_stay_distinct_and_the_tree_is_clean(self):
        fixture = json.loads((ROOT / "fixtures" / "library-fines.json").read_text())
        self.file_posts(fixture["posts"], fixture["topic"], page="city")
        self.debate.drain()
        self.assertEqual(
            self.keys("city", "library-fines"),
            ["access-barrier", "illegal", "legal", "returns-books"],
        )
        for absent in fixture["absent_keys"]:
            self.assertNotIn(absent, self.keys("city", "library-fines"))
        self.assertIn(
            "Charging these fines is illegal.",
            self.bodies("city", "library-fines", "illegal"),
        )
        self.assertNotIn(
            "Charging these fines is illegal.",
            self.bodies("city", "library-fines", "access-barrier"),
        )
        self.assertIn(
            "The city can charge a fine. It is legal.",
            self.bodies("city", "library-fines", "legal"),
        )
        self.assertNotIn(
            "The city can charge a fine. It is legal.",
            self.bodies("city", "library-fines", "returns-books"),
        )
        self.assertIn(
            "Children forget their books, so fines remind them.",
            self.bodies("city", "library-fines", "returns-books"),
        )
        pairs = json.loads(
            (self.debate.repo.path / "pages/city/topics/library-fines/pairs.json").read_text()
        )
        self.assertEqual(
            {tuple(item) for item in pairs["pairs"]},
            {tuple(sorted(item)) for item in fixture["pairs"]},
        )
        self.assertEqual(self.debate.repo.status().strip(), "")
        for key in self.keys("city", "library-fines"):
            assert_short_key(key)

    def test_mass_surveillance_renames_and_the_old_url_resolves(self):
        user = new_uuid()
        self.debate.place(
            user,
            page="demo",
            topic="flock-cameras",
            key="mass-surveillance",
            body=SURVEILLANCE,
        )
        self.debate.vote(
            user,
            page="demo",
            level="subtopic",
            topic="flock-cameras",
            key="mass-surveillance",
        )
        self.debate.drain()
        self.assertNotIn("mass-surveillance", self.keys("demo", "flock-cameras"))
        self.assertIn("invasion-of-privacy", self.keys("demo", "flock-cameras"))
        self.assertIn(SURVEILLANCE, self.bodies("demo", "flock-cameras", "invasion-of-privacy"))
        history = json.loads(
            (self.debate.repo.path / "pages/demo/topics/flock-cameras/key-history.json").read_text()
        )
        index = json.loads((self.debate.repo.path / "pages/demo/index.json").read_text())
        self.assertEqual(history["mass-surveillance"], "invasion-of-privacy")
        self.assertEqual(
            index["topics"]["flock-cameras"]["history"]["mass-surveillance"],
            "invasion-of-privacy",
        )
        self.assertEqual(
            index["old_keys"]["flock-cameras/mass-surveillance"],
            "flock-cameras/invasion-of-privacy",
        )
        self.assertEqual(self.debate.resolve("demo", "flock-cameras", "mass-surveillance"), "invasion-of-privacy")
        votes = json.loads(
            (
                self.debate.repo.path
                / "pages/demo/topics/flock-cameras/invasion-of-privacy/votes.json"
            ).read_text()
        )
        self.assertIn(1, votes["ids"])
        shown = self.debate.repo._run(
            ["git", "show", "--name-status", "--pretty=format:", "HEAD"]
        ).stdout
        self.assertIn("invasion-of-privacy", shown)
        self.assertIn("mass-surveillance", shown)
        self.assertIn("R100", shown)
        self.assertFalse((self.debate.repo.path / "pages/demo/topics/flock-cameras/mass-surveillance").exists())

    def test_frozen_rules_keep_mass_surveillance(self):
        self.debate.post_rules("Keys never change.\n")
        self.debate.place(
            new_uuid(),
            page="demo",
            topic="flock-cameras",
            key="mass-surveillance",
            body=SURVEILLANCE,
        )
        self.debate.drain()
        self.assertEqual(self.keys("demo", "flock-cameras"), ["mass-surveillance"])
        self.assertEqual(self.debate.resolve("demo", "flock-cameras", "mass-surveillance"), "mass-surveillance")

    def test_refuse_bad_merge_leaves_illegal_in_place(self):
        user = new_uuid()
        self.debate.submit(user, page="demo", topic="flock-cameras", body=ILLEGAL)
        head = self.debate.repo.head()
        self.assertFalse(
            self.debate.try_rename("demo", "flock-cameras", "illegal", "invasion-of-privacy")
        )
        self.assertEqual(self.debate.repo.head(), head)
        self.debate.drain()
        self.assertEqual(self.keys("demo", "flock-cameras"), ["illegal"])

    def test_mixed_folder_splits_the_other_axis(self):
        user = new_uuid()
        self.debate.place(
            user,
            page="demo",
            topic="flock-cameras",
            key="invasion-of-privacy",
            body=SURVEILLANCE,
        )
        self.debate.place(
            user,
            page="demo",
            topic="flock-cameras",
            key="invasion-of-privacy",
            body=ILLEGAL,
        )
        self.debate.drain()
        self.assertIn(SURVEILLANCE, self.bodies("demo", "flock-cameras", "invasion-of-privacy"))
        self.assertIn(ILLEGAL, self.bodies("demo", "flock-cameras", "illegal"))
        self.assertNotIn(ILLEGAL, self.bodies("demo", "flock-cameras", "invasion-of-privacy"))

    def test_second_pass_with_no_new_post_does_not_commit(self):
        self.debate.submit(new_uuid(), page="demo", topic="flock-cameras", body=SURVEILLANCE)
        self.debate.drain()
        head = self.debate.repo.head()
        result = self.debate.drain()
        self.assertEqual(self.debate.repo.head(), head)
        self.assertEqual(result.commits, 0)
        self.assertTrue(result.hardware_should_shut_down)

    def test_new_comments_during_the_drain_join_it(self):
        user = new_uuid()
        self.debate.submit(user, page="demo", topic="flock-cameras", body=SURVEILLANCE)

        def arrive():
            self.debate.submit(user, page="demo", topic="flock-cameras", body=BORDERS)

        result = self.debate.drain(arrive=arrive)
        self.assertEqual(result.wakes, 1)
        self.assertTrue(result.hardware_should_shut_down)
        self.assertIn(BORDERS, self.bodies("demo", "flock-cameras", "national-security"))
        self.assertNotIn("borders", self.keys("demo", "flock-cameras"))
        self.assertNotIn("crime", self.keys("demo", "flock-cameras"))
        self.assertNotIn("elections", self.keys("demo", "flock-cameras"))
        position = (
            self.debate.repo.path
            / "pages/demo/topics/flock-cameras/national-security/position.md"
        ).read_text()
        self.assertIn("national security", position.lower())

    def test_edit_requeues_and_does_not_set_the_key_or_summary(self):
        user = new_uuid()
        self.debate.submit(user, page="demo", topic="flock-cameras", body=SURVEILLANCE)
        self.debate.drain()
        position = (
            self.debate.repo.path
            / "pages/demo/topics/flock-cameras/invasion-of-privacy/position.md"
        ).read_text()
        self.debate.edit(
            user,
            page="demo",
            topic="flock-cameras",
            key="invasion-of-privacy",
            comment_id="1",
            body=SURVEILLANCE + " I disagree with the key.",
            override_key="legal",
            force=True,
        )
        self.assertEqual(
            (
                self.debate.repo.path
                / "pages/demo/topics/flock-cameras/invasion-of-privacy/position.md"
            ).read_text(),
            position,
        )
        job = json.loads((self.debate.repo.path / "pages/demo/job.json").read_text())
        self.assertEqual(job["status"], "dirty")
        self.assertEqual(self.keys("demo", "flock-cameras"), ["invasion-of-privacy"])
        names = self.debate.repo.commit_files_list()
        self.assertTrue(any(name.endswith("job.json") for name in names))
        self.assertFalse(any(name.endswith("position.md") for name in names))

    def test_job_file_is_the_queue(self):
        self.debate.submit(new_uuid(), page="alpha", topic="flock-cameras", body=SURVEILLANCE)
        self.debate.submit(
            new_uuid(),
            page="beta",
            topic="library-fines",
            body="Library fines punish people who cannot pay.",
        )
        job = json.loads((self.debate.repo.path / "pages/beta/job.json").read_text())
        self.assertEqual(job["status"], "dirty")
        job["status"] = "done"
        self.debate.repo.commit_changes(
            {"pages/beta/job.json": json.dumps(job, indent=2, sort_keys=True) + "\n"},
            [],
            "pause queue",
            SERVICE_ID,
        )
        self.debate.drain()
        self.assertTrue(
            (
                self.debate.repo.path
                / "pages/alpha/topics/flock-cameras/invasion-of-privacy/position.md"
            ).exists()
        )
        self.assertFalse(
            (
                self.debate.repo.path
                / "pages/beta/topics/library-fines/access-barrier/position.md"
            ).exists()
        )

    def test_summary_prefix_is_on_the_live_response_and_the_position(self):
        self.debate.post_rules('Summaries must start with "Brief:".\n')
        preview = self.debate.preview(page="demo", topic="flock-cameras", body=SURVEILLANCE)
        self.assertTrue(preview["summary"].startswith("Brief:"))
        self.assertFalse((self.debate.repo.path / "pages/demo/topics").exists())
        self.debate.submit(new_uuid(), page="demo", topic="flock-cameras", body=SURVEILLANCE)
        self.debate.drain()
        position = (
            self.debate.repo.path
            / "pages/demo/topics/flock-cameras/invasion-of-privacy/position.md"
        ).read_text()
        self.assertTrue(position.startswith("Brief:"))

    def test_default_rules_restate_a_dangerous_claim_without_swearing_or_scolding(self):
        body = (
            "This shit is mass surveillance. "
            "People who object should be beaten in the street."
        )
        self.debate.submit(new_uuid(), page="demo", topic="flock-cameras", body=body)
        self.debate.drain()
        position = (
            self.debate.repo.path
            / "pages/demo/topics/flock-cameras/invasion-of-privacy/position.md"
        ).read_text().lower()
        self.assertIn("beaten in the street", position)
        self.assertNotIn("shit", position)
        for word in ("disgusting", "unacceptable", "shame on", "condemn"):
            self.assertNotIn(word, position)
        self.assertFalse((self.debate.repo.path / "rules.md").exists())

    def test_rules_that_allow_swearing_keep_the_word(self):
        self.debate.post_rules("The AI may swear.\n")
        self.debate.submit(
            new_uuid(),
            page="demo",
            topic="flock-cameras",
            body="This shit is mass surveillance.",
        )
        self.debate.drain()
        position = (
            self.debate.repo.path
            / "pages/demo/topics/flock-cameras/invasion-of-privacy/position.md"
        ).read_text().lower()
        self.assertIn("shit", position)

    def test_rules_and_policy_are_not_comments(self):
        self.debate.post_rules("Keys rarely change.\n")
        self.debate.post_policy("images: show\nlinks: on\n")
        self.assertTrue((self.debate.repo.path / "rules.md").exists())
        self.assertTrue((self.debate.repo.path / "policy.md").exists())
        self.assertFalse(list((self.debate.repo.path / "pages").glob("**/comments/*.md")))
        self.assertEqual(self.debate.repo.log_author(), SERVICE_ID)
        self.assertEqual(parse_rules((self.debate.repo.path / "rules.md").read_text()).keys, "rarely")

    def test_solo_comment_asks_questions_and_suggests_a_missing_key(self):
        user = new_uuid()
        self.debate.submit(user, page="demo", topic="flock-cameras", body=SURVEILLANCE)
        self.assertFalse((self.debate.repo.path / "pages/demo/notifications.json").exists())
        self.debate.drain()
        key = self.debate.repo.path / "pages/demo/topics/flock-cameras/invasion-of-privacy"
        questions = (key / "questions.md").read_text()
        suggestion = (key / "suggested-counter.md").read_text()
        self.assertIn("?", questions)
        self.assertIn("national-security", suggestion)
        self.assertIn("https://", suggestion)
        self.assertIn("Citation:", suggestion)
        self.assertIn("not a directory", suggestion)
        self.assertFalse(
            (self.debate.repo.path / "pages/demo/topics/flock-cameras/national-security").exists()
        )
        notes = json.loads((self.debate.repo.path / "pages/demo/notifications.json").read_text())
        kinds = {event["kind"] for event in notes["events"]}
        self.assertEqual(kinds, {"position", "questions", "suggested-counter"})
        self.assertTrue(all(event["subscriber"] == 1 for event in notes["events"]))
        comment_count = list(key.glob("comments/*.md"))
        self.assertEqual(len(comment_count), 1)

    def test_a_new_comment_does_not_notify_until_the_section_updates(self):
        first = new_uuid()
        second = new_uuid()
        self.debate.submit(first, page="demo", topic="flock-cameras", body=SURVEILLANCE)
        self.debate.drain()
        before = (self.debate.repo.path / "pages/demo/notifications.json").read_text()
        self.debate.submit(second, page="demo", topic="flock-cameras", body=SECURITY)
        self.assertEqual((self.debate.repo.path / "pages/demo/notifications.json").read_text(), before)
        self.debate.drain()
        notes = json.loads((self.debate.repo.path / "pages/demo/notifications.json").read_text())
        self.assertTrue(notes["events"])
        self.assertTrue(all(event["kind"] != "comment" for event in notes["events"]))

    def test_another_page_stores_a_pointer_instead_of_a_second_copy(self):
        self.debate.submit(new_uuid(), page="one", topic="flock-cameras", body=SURVEILLANCE)
        self.debate.submit(
            new_uuid(),
            page="two",
            topic="flock-cameras",
            body="This is an invasion of privacy.",
        )
        self.assertFalse((self.debate.repo.path / "pages/two/topics/flock-cameras").exists())
        pointer = json.loads((self.debate.repo.path / "pages/two/index.json").read_text())
        self.assertEqual(pointer["pointers"]["flock-cameras"]["page"], "one")
        comments = list(
            (self.debate.repo.path / "pages/one/topics/flock-cameras").rglob("comments/*.md")
        )
        self.assertEqual(len(comments), 2)
        self.debate.drain()
        self.assertEqual(len(self.bodies("one", "flock-cameras", "invasion-of-privacy")), 2)
        self.assertFalse((self.debate.repo.path / "pages/two/topics/flock-cameras").exists())

    def test_batch_checks_out_comments_only(self):
        self.debate.submit(new_uuid(), page="demo", topic="flock-cameras", body=SURVEILLANCE)
        self.debate.repo._run(["git", "checkout", "main"])
        self.debate.drain()
        self.assertEqual(self.debate.repo.branch(), "comments")
        missing = self.debate.repo._run(
            ["git", "cat-file", "-e", "main:pages/demo/job.json"],
            check=False,
        )
        self.assertNotEqual(missing.returncode, 0)

    def test_host_repo_is_not_written_and_a_changed_thesis_goes_stale(self):
        host = Path(self.tmp.name) / "host"
        host.mkdir()
        subprocess.run(["git", "init", "-b", "main"], cwd=host, check=True, capture_output=True)
        (host / "page.md").write_text("Cameras on every corner.\n")
        subprocess.run(["git", "add", "page.md"], cwd=host, check=True, capture_output=True)
        subprocess.run(
            [
                "git",
                "-c",
                f"user.name={SERVICE_ID}",
                "-c",
                f"user.email={SERVICE_EMAIL}",
                "commit",
                "-m",
                "host page",
            ],
            cwd=host,
            check=True,
            capture_output=True,
        )
        pinned = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=host, check=True, capture_output=True, text=True
        ).stdout.strip()
        debate = Debate.create(Path(self.tmp.name) / "other-debate", host_repo=host)
        debate.pin_page("demo", url="https://example.com/cameras", content_commit=pinned, thesis="Cameras.")
        (host / "page.md").write_text("Cameras, revised.\n")
        subprocess.run(["git", "add", "page.md"], cwd=host, check=True, capture_output=True)
        subprocess.run(
            [
                "git",
                "-c",
                f"user.name={SERVICE_ID}",
                "-c",
                f"user.email={SERVICE_EMAIL}",
                "commit",
                "-m",
                "revise host",
            ],
            cwd=host,
            check=True,
            capture_output=True,
        )
        revised = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=host, check=True, capture_output=True, text=True
        ).stdout.strip()
        before = revised
        debate.note_host_changed("demo", content_commit=revised, thesis="Cameras, revised.")
        debate.submit(new_uuid(), page="demo", topic="flock-cameras", body=SURVEILLANCE)
        after = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=host, check=True, capture_output=True, text=True
        ).stdout.strip()
        self.assertEqual(after, before)
        page = json.loads((debate.repo.path / "pages/demo/page.json").read_text())
        self.assertTrue(page["thesis_stale"])
        self.assertEqual(page["canonical_url"], "https://example.com/cameras")
        self.assertFalse((host / "pages").exists())

    def test_publish_pushes_the_comments_branch_to_two_remotes(self):
        self.debate.submit(new_uuid(), page="demo", topic="flock-cameras", body=SURVEILLANCE)
        bare_one = Path(self.tmp.name) / "bare-one"
        bare_two = Path(self.tmp.name) / "bare-two"
        subprocess.run(["git", "init", "--bare", str(bare_one)], check=True, capture_output=True)
        subprocess.run(["git", "init", "--bare", str(bare_two)], check=True, capture_output=True)
        self.debate.publish([str(bare_one), str(bare_two)])
        for bare in (bare_one, bare_two):
            shown = subprocess.run(
                ["git", "--git-dir", str(bare), "show", "comments:pages/demo/job.json"],
                check=True,
                capture_output=True,
                text=True,
            ).stdout
            self.assertIn("flock-cameras", shown)


class IdentityVoteTests(DebateCase):
    def test_short_ids_share_the_first_commit_and_are_not_reused(self):
        user = new_uuid()
        self.debate.submit(user, page="demo", topic="flock-cameras", body=SURVEILLANCE)
        names = self.debate.repo.commit_files_list()
        self.assertIn("users/index.json", names)
        self.assertTrue(any(name.endswith("comments/1.md") for name in names))
        parent = self.debate.repo._run(["git", "show", "HEAD^:users/index.json"], check=False)
        self.assertNotEqual(parent.returncode, 0)
        index = json.loads(self.debate.repo.read("users/index.json"))
        self.assertEqual(index["by_uuid"][user]["id"], 1)
        self.assertEqual(index["next_id"], 2)
        self.assertEqual(index["by_uuid"][user]["name_source"], "generated")
        self.assertIn(index["by_uuid"][user]["name"], ALLOWLIST)
        comment = self.debate.repo.read(
            "pages/demo/topics/flock-cameras/uncategorized/comments/1.md"
        )
        self.assertIn("author: 1", comment)
        self.assertNotIn(user, comment)
        for relative in self.debate.repo.files():
            if relative == "users/index.json":
                continue
            self.assertNotIn(user, self.debate.repo.read(relative))
        other = new_uuid()
        self.debate.vote(other, page="demo", level="topic", topic="flock-cameras")
        vote_files = self.debate.repo.commit_files_list()
        self.assertIn("users/index.json", vote_files)
        self.assertTrue(any(name.endswith("votes.json") for name in vote_files))
        index = json.loads(self.debate.repo.read("users/index.json"))
        self.assertEqual(index["by_uuid"][other]["id"], 2)
        self.assertEqual(index["next_id"], 3)
        parent_index = self.debate.repo._run(
            ["git", "show", "HEAD^:users/index.json"], check=True
        ).stdout
        self.assertNotIn(other, parent_index)
        votes = self.debate.repo.read("pages/demo/topics/flock-cameras/votes.json")
        self.assertIn("2", votes)
        self.assertNotIn(other, votes)
        fresh = empty_index()
        first = new_uuid()
        second = new_uuid()
        third = new_uuid()
        self.assertEqual(issue_id(fresh, first, "A", "generated"), 1)
        self.assertEqual(issue_id(fresh, second, "B", "generated"), 2)
        del fresh["by_uuid"][first]
        del fresh["by_id"]["1"]
        self.assertEqual(issue_id(fresh, third, "C", "generated"), 3)

    def test_a_chosen_name_stays_and_a_generated_name_can_change(self):
        user = new_uuid()
        self.debate.submit(user, page="demo", topic="flock-cameras", body=SURVEILLANCE)
        self.debate.set_name(user, "Rowan Hale")
        self.debate.edit(
            user,
            page="demo",
            topic="flock-cameras",
            key="uncategorized",
            comment_id="1",
            body=SURVEILLANCE + " Still the same argument with more words.",
        )
        self.debate.drain()
        index = json.loads(self.debate.repo.read("users/index.json"))
        self.assertEqual(index["by_uuid"][user]["name"], "Rowan Hale")
        self.assertEqual(index["by_uuid"][user]["name_source"], "chosen")
        self.assertEqual(index["by_uuid"][user]["id"], 1)

        other = new_uuid()
        self.debate.submit(other, page="demo", topic="flock-cameras", body=SURVEILLANCE)
        self.debate.drain()
        before = json.loads(self.debate.repo.read("users/index.json"))["by_uuid"][other]["name"]
        revised = None
        for count in range(1, 40):
            candidate = SURVEILLANCE + (" extra" * count)
            writing = f"flock-cameras\n{candidate}"
            if generated_name(other, "flock-cameras", writing) != before and classify(
                "flock-cameras", candidate
            ) == "invasion-of-privacy":
                revised = candidate
                break
        self.assertIsNotNone(revised)
        comment_id = "2"
        self.debate.edit(
            other,
            page="demo",
            topic="flock-cameras",
            key="invasion-of-privacy",
            comment_id=comment_id,
            body=revised,
        )
        self.debate.drain()
        after = json.loads(self.debate.repo.read("users/index.json"))["by_uuid"][other]
        self.assertEqual(after["name_source"], "generated")
        self.assertEqual(
            after["name"],
            generated_name(other, "flock-cameras", f"flock-cameras\n{revised}"),
        )
        self.assertNotEqual(after["name"], before)
        self.assertIn(after["name"], ALLOWLIST)

    def test_names_are_professional_and_safe_for_work(self):
        blocked = ("shit", "fuck", "damn", "ass", "bitch", "crap")
        for name in ALLOWLIST:
            self.assertRegex(name, r"^[A-Z][a-z]+ [A-Z][a-z]+$")
            for word in blocked:
                self.assertIsNone(re.search(rf"\b{word}\b", name.lower()))

    def test_three_votes_are_separate_and_a_vote_does_not_rewrite_the_room(self):
        user = new_uuid()
        self.debate.submit(user, page="demo", topic="flock-cameras", body=SURVEILLANCE)
        self.debate.submit(user, page="demo", topic="flock-cameras", body=SECURITY)
        self.debate.submit(user, page="demo", topic="flock-cameras", body="A second privacy wording about surveillance.")
        self.debate.drain()
        position = (
            self.debate.repo.path
            / "pages/demo/topics/flock-cameras/invasion-of-privacy/position.md"
        ).read_text()
        keys_before = self.keys("demo", "flock-cameras")
        head = self.debate.repo.head()
        self.debate.vote(user, page="demo", level="topic", topic="flock-cameras")
        self.debate.vote(
            user,
            page="demo",
            level="subtopic",
            topic="flock-cameras",
            key="invasion-of-privacy",
        )
        self.debate.vote(
            user,
            page="demo",
            level="comment",
            topic="flock-cameras",
            key="invasion-of-privacy",
            comment="1",
        )
        self.assertEqual(self.debate.tally("demo", level="topic", topic="flock-cameras"), 1)
        self.assertEqual(
            self.debate.tally(
                "demo", level="subtopic", topic="flock-cameras", key="invasion-of-privacy"
            ),
            1,
        )
        self.assertEqual(
            self.debate.tally(
                "demo",
                level="comment",
                topic="flock-cameras",
                key="invasion-of-privacy",
                comment="1",
            ),
            1,
        )
        self.debate.vote(user, page="demo", level="topic", topic="flock-cameras")
        self.assertEqual(self.debate.tally("demo", level="topic", topic="flock-cameras"), 0)
        self.assertEqual(
            self.debate.tally(
                "demo", level="subtopic", topic="flock-cameras", key="invasion-of-privacy"
            ),
            1,
        )
        self.debate.vote(
            user,
            page="demo",
            level="subtopic",
            topic="flock-cameras",
            key="national-security",
        )
        self.assertEqual(
            self.debate.tally(
                "demo", level="subtopic", topic="flock-cameras", key="invasion-of-privacy"
            ),
            0,
        )
        self.assertEqual(
            self.debate.tally(
                "demo", level="subtopic", topic="flock-cameras", key="national-security"
            ),
            1,
        )
        self.debate.vote(
            user,
            page="demo",
            level="comment",
            topic="flock-cameras",
            key="invasion-of-privacy",
            comment="2",
        )
        self.assertEqual(
            self.debate.tally(
                "demo",
                level="comment",
                topic="flock-cameras",
                key="invasion-of-privacy",
                comment="1",
            ),
            0,
        )
        self.assertEqual(
            self.debate.tally(
                "demo",
                level="comment",
                topic="flock-cameras",
                key="invasion-of-privacy",
                comment="2",
            ),
            1,
        )
        self.assertEqual(
            (
                self.debate.repo.path
                / "pages/demo/topics/flock-cameras/invasion-of-privacy/position.md"
            ).read_text(),
            position,
        )
        self.assertEqual(self.keys("demo", "flock-cameras"), keys_before)
        self.assertFalse(any("poll" in name for name in self.debate.repo.files()))
        voted = self.debate.repo.head()
        self.assertNotEqual(voted, head)
        again = self.debate.drain()
        self.assertEqual(self.debate.repo.head(), voted)
        self.assertEqual(again.commits, 0)

    def test_only_the_ai_service_commits_and_identity_is_not_git_config(self):
        command = git_commit_command("file comment")
        self.assertEqual(command[0], "git")
        self.assertIn("-c", command)
        self.assertIn(f"user.name={SERVICE_ID}", command)
        self.assertIn(f"user.email={SERVICE_EMAIL}", command)
        self.assertNotIn("config", command)
        self.debate.submit(new_uuid(), page="demo", topic="flock-cameras", body=SURVEILLANCE)
        self.assertEqual(self.debate.repo.log_author(), SERVICE_ID)
        email = self.debate.repo._run(["git", "log", "-1", "--format=%ae"]).stdout.strip()
        self.assertEqual(email, SERVICE_EMAIL)
        self.assertFalse(self.debate.repo.local_identity_configured())
        head = self.debate.repo.head()
        with self.assertRaises(PermissionError) as other:
            self.debate.repo.commit_changes({"notes.md": "nope\n"}, [], "nope", "someone-else")
        self.assertIn("clevertree-chat-ai", str(other.exception))
        with self.assertRaises(PermissionError) as anon:
            self.debate.repo.commit_changes({"notes.md": "nope\n"}, [], "nope", "")
        self.assertIn("anonymous", str(anon.exception))
        with self.assertRaises(PermissionError):
            self.debate.repo.commit_changes({"notes.md": "nope\n"}, [], "nope", "anonymous")
        with self.assertRaises(ValueError) as binary:
            self.debate.repo.commit_changes({"pages/demo/blob.bin": "hello"}, [], "nope", SERVICE_ID)
        self.assertIn("binaries", str(binary.exception))
        with self.assertRaises(ValueError):
            self.debate.repo.commit_changes(
                {"pages/demo/note.md": "hello\0world"}, [], "nope", SERVICE_ID
            )
        self.assertEqual(self.debate.repo.head(), head)
        self.assertEqual(self.debate.repo.status().strip(), "")


class BatchDecisionTests(DebateCase):
    """Each batch decision posts a confidence next to the rule it read."""

    def decisions(self, page="demo", topic="flock-cameras"):
        index = json.loads((self.debate.repo.path / "pages" / page / "index.json").read_text())
        return index["topics"][topic]["decisions"]

    def file_decision(self, body, page="demo", topic="flock-cameras"):
        root = self.debate.repo.path / "pages" / page / "topics" / topic
        found = None
        for path in sorted(root.rglob("comments/*.md")):
            if body in path.read_text().split("\n\n", 1)[-1]:
                found = path
                break
        self.assertIsNotNone(found, body)
        comment_id = found.stem
        home = found.parent.parent.name
        matches = [
            item
            for item in self.decisions(page, topic)
            if item["kind"] == "file"
            and item["comment"] == comment_id
            and home in item.get("keys", [])
        ]
        self.assertEqual(len(matches), 1, matches)
        return matches[0]

    def one(self, kind, page="demo", topic="flock-cameras", **match):
        found = []
        for item in self.decisions(page, topic):
            if item["kind"] != kind:
                continue
            if all(item.get(key) == value for key, value in match.items()):
                found.append(item)
        self.assertEqual(len(found), 1, found)
        return found[0]

    def test_spill_creates_a_key_and_posts_high_confidence(self):
        user = new_uuid()
        self.assertFalse((self.debate.repo.path / "rules.md").exists())
        self.assertEqual(self.debate.rules().mint, default_rules().mint)
        self.assertTrue(self.debate.rules().allows_new_key())
        self.debate.submit(user, page="demo", topic="flock-cameras", body="Mass surveillance is necessary.")
        self.debate.drain()
        self.debate.submit(user, page="demo", topic="flock-cameras", body="but it's illegal!")
        self.debate.drain()
        self.assertEqual(self.keys("demo", "flock-cameras"), ["illegal", "invasion-of-privacy"])
        self.assertFalse((self.debate.repo.path / "pages/demo/topics/flock-cameras/legal").exists())
        self.assertFalse(
            (self.debate.repo.path / "pages/demo/topics/flock-cameras/national-security").exists()
        )
        filed = self.file_decision("but it's illegal!")
        self.assertEqual(filed["keys"], ["illegal"])
        self.assertEqual(filed["confidence"], "high")
        self.assertEqual(filed["rule"], "default")
        self.assertEqual(filed["starting"], "uncategorized")
        suggestion = (self.debate.repo.path / "pages/demo/topics/flock-cameras/illegal/suggested-counter.md").read_text()
        self.assertIn("Patriot Act", suggestion)
        self.assertIn("https://www.congress.gov/bill/107th-congress/house-bill/3162", suggestion)
        for key in ("legal", "patriot-act", "national-security"):
            recorded = self.one("suggestion", key=key)
            self.assertFalse(recorded["created"])
            self.assertEqual(recorded["confidence"], "high")
            self.assertEqual(recorded["rule"], "default")

    def test_suggestion_does_not_create_a_key(self):
        self.assertFalse((self.debate.repo.path / "rules.md").exists())
        self.debate.submit(new_uuid(), page="demo", topic="flock-cameras", body=SURVEILLANCE)
        self.debate.drain()
        recorded = self.one("suggestion", key="national-security")
        self.assertFalse(recorded["created"])
        self.assertEqual(recorded["confidence"], "high")
        self.assertEqual(recorded["rule"], "default")
        self.assertFalse(
            (self.debate.repo.path / "pages/demo/topics/flock-cameras/national-security").exists()
        )
        suggestion = (
            self.debate.repo.path
            / "pages/demo/topics/flock-cameras/invasion-of-privacy/suggested-counter.md"
        ).read_text()
        self.assertIn("national-security", suggestion)
        self.assertIn("not a directory", suggestion)

    def test_posted_rule_refuses_a_new_key(self):
        self.debate.post_rules("Never open a new topic.\n")
        posted = (self.debate.repo.path / "rules.md").read_text()
        self.assertIn("Never open a new topic", posted)
        self.assertEqual(self.debate.rules().mint, "never")
        self.assertFalse(self.debate.rules().allows_new_key())
        user = new_uuid()
        self.debate.submit(user, page="demo", topic="flock-cameras", body="but it's illegal!")
        self.debate.drain()
        self.assertEqual(self.keys("demo", "flock-cameras"), ["other"])
        self.assertIn("but it's illegal!", self.bodies("demo", "flock-cameras", "other"))
        filed = self.file_decision("but it's illegal!")
        self.assertEqual(filed["keys"], ["other"])
        self.assertEqual(filed["confidence"], "high")
        self.assertEqual(filed["rule"], "posted")
        summary = self.one("summary", key="other")
        self.assertEqual(summary["confidence"], "low")
        self.assertEqual(summary["rule"], "posted")

    def test_posted_rule_stops_a_question_from_opening_a_key(self):
        self.debate.post_rules("Do not ask questions.\n")
        self.assertIn("Do not ask questions", (self.debate.repo.path / "rules.md").read_text())
        self.assertFalse(self.debate.rules().questions_allowed)
        self.assertTrue(self.debate.rules().allows_new_key())
        self.debate.submit(new_uuid(), page="demo", topic="flock-cameras", body="Are these cameras illegal?")
        self.debate.drain()
        self.assertEqual(self.keys("demo", "flock-cameras"), ["other"])
        self.assertNotIn("illegal", self.keys("demo", "flock-cameras"))
        filed = self.file_decision("Are these cameras illegal?")
        self.assertEqual(filed["keys"], ["other"])
        self.assertEqual(filed["confidence"], "high")
        self.assertEqual(filed["rule"], "posted")

    def test_manual_starting_slot_can_be_moved(self):
        user = new_uuid()
        self.assertFalse((self.debate.repo.path / "rules.md").exists())
        self.debate.place(user, page="demo", topic="flock-cameras", key="illegal", body=ILLEGAL)
        self.debate.submit(
            user,
            page="demo",
            topic="flock-cameras",
            body=SECURITY,
            chosen="illegal",
        )
        self.debate.drain()
        self.assertIn(SECURITY, self.bodies("demo", "flock-cameras", "national-security"))
        self.assertNotIn(SECURITY, self.bodies("demo", "flock-cameras", "illegal"))
        self.assertIn(ILLEGAL, self.bodies("demo", "flock-cameras", "illegal"))
        filed = self.file_decision(SECURITY)
        self.assertEqual(filed["starting"], "illegal")
        self.assertEqual(filed["keys"], ["national-security"])
        self.assertEqual(filed["confidence"], "high")
        self.assertEqual(filed["rule"], "default")
        history = json.loads(
            (self.debate.repo.path / "pages/demo/topics/flock-cameras/key-history.json").read_text()
        )
        self.assertNotIn("illegal", history)

    def test_multi_category_listing_is_one_file(self):
        user = new_uuid()
        self.debate.submit(user, page="demo", topic="flock-cameras", body=SURVEILLANCE)
        self.debate.drain()
        self.debate.submit(user, page="demo", topic="flock-cameras", body=ILLEGAL)
        self.debate.drain()
        shared = "These cameras are illegal mass surveillance."
        self.debate.submit(user, page="demo", topic="flock-cameras", body=shared)
        self.debate.drain()
        root = self.debate.repo.path / "pages/demo/topics/flock-cameras"
        files = [path for path in root.rglob("comments/*.md") if shared in path.read_text()]
        self.assertEqual(len(files), 1)
        relative = str(files[0].relative_to(root))
        filed = self.file_decision(shared)
        self.assertEqual(filed["keys"], ["illegal", "invasion-of-privacy"])
        self.assertEqual(filed["confidence"], "high")
        self.assertEqual(filed["rule"], "default")
        for key in ("illegal", "invasion-of-privacy"):
            listing = json.loads((root / key / "listing.json").read_text())
            entry = next(item for item in listing["comments"] if item["path"] == relative)
            self.assertEqual(entry["confidence"], "high")
            self.assertEqual(entry["keys"], ["illegal", "invasion-of-privacy"])
        self.assertFalse((root / "legal").exists())

    def test_question_joins_the_named_axis(self):
        user = new_uuid()
        self.assertFalse((self.debate.repo.path / "rules.md").exists())
        self.assertTrue(self.debate.rules().questions_allowed)
        self.assertIn("Questions are allowed", default_rules_text())
        self.debate.submit(user, page="demo", topic="flock-cameras", body=SURVEILLANCE)
        self.debate.drain()
        self.debate.submit(user, page="demo", topic="flock-cameras", body="Are these cameras mass surveillance?")
        self.debate.drain()
        self.assertEqual(self.keys("demo", "flock-cameras"), ["invasion-of-privacy"])
        self.assertIn(
            "Are these cameras mass surveillance?",
            self.bodies("demo", "flock-cameras", "invasion-of-privacy"),
        )
        joined = self.file_decision("Are these cameras mass surveillance?")
        self.assertEqual(joined["keys"], ["invasion-of-privacy"])
        self.assertEqual(joined["confidence"], "high")
        self.assertEqual(joined["rule"], "default")
        self.debate.submit(user, page="demo", topic="flock-cameras", body="Are these cameras illegal?")
        self.debate.drain()
        self.assertIn("Are these cameras illegal?", self.bodies("demo", "flock-cameras", "illegal"))
        self.assertNotIn("other", self.keys("demo", "flock-cameras"))
        opened = self.file_decision("Are these cameras illegal?")
        self.assertEqual(opened["keys"], ["illegal"])
        self.assertEqual(opened["confidence"], "high")
        self.assertEqual(opened["rule"], "default")

    def test_non_argument_lands_in_other_with_a_low_summary(self):
        self.assertFalse((self.debate.repo.path / "rules.md").exists())
        self.debate.submit(new_uuid(), page="demo", topic="flock-cameras", body="lol")
        self.debate.drain()
        self.assertEqual(self.keys("demo", "flock-cameras"), ["other"])
        self.assertFalse(
            (self.debate.repo.path / "pages/demo/topics/flock-cameras/uncategorized").exists()
        )
        filed = self.file_decision("lol")
        self.assertEqual(filed["keys"], ["other"])
        self.assertEqual(filed["confidence"], "high")
        self.assertEqual(filed["rule"], "default")
        summary = self.one("summary", key="other")
        self.assertEqual(summary["confidence"], "low")
        self.assertEqual(summary["rule"], "default")
        position = (
            self.debate.repo.path / "pages/demo/topics/flock-cameras/other/position.md"
        ).read_text()
        self.assertIn("lol", position)

    def test_summary_is_reworded_under_the_default(self):
        self.assertFalse((self.debate.repo.path / "rules.md").exists())
        self.assertIsNone(self.debate.rules().summary_prefix)
        body = SURVEILLANCE + " I disagree with the key."
        self.debate.submit(new_uuid(), page="demo", topic="flock-cameras", body=body)
        self.debate.drain()
        position = (
            self.debate.repo.path / "pages/demo/topics/flock-cameras/invasion-of-privacy/position.md"
        ).read_text()
        self.assertIn("mass surveillance and an invasion of privacy", position)
        self.assertNotIn("disagree", position)
        self.assertFalse(position.startswith("Brief:"))
        summary = self.one("summary", key="invasion-of-privacy")
        self.assertEqual(summary["confidence"], "high")
        self.assertEqual(summary["rule"], "default")

    def test_summary_reword_follows_a_posted_prefix(self):
        self.debate.post_rules('Summaries must start with "Brief:".\n')
        self.assertEqual(self.debate.rules().summary_prefix, "Brief:")
        self.assertIn("Brief:", (self.debate.repo.path / "rules.md").read_text())
        self.debate.submit(new_uuid(), page="demo", topic="flock-cameras", body=SURVEILLANCE)
        self.debate.drain()
        position = (
            self.debate.repo.path / "pages/demo/topics/flock-cameras/invasion-of-privacy/position.md"
        ).read_text()
        self.assertTrue(position.startswith("Brief:"))
        summary = self.one("summary", key="invasion-of-privacy")
        self.assertEqual(summary["confidence"], "high")
        self.assertEqual(summary["rule"], "posted")

    def test_key_rename_keeps_history_and_posts_confidence(self):
        self.assertFalse((self.debate.repo.path / "rules.md").exists())
        self.assertTrue(self.debate.rules().allows_rename())
        self.assertTrue(default_rules().allows_rename())
        self.debate.place(
            new_uuid(),
            page="demo",
            topic="flock-cameras",
            key="mass-surveillance",
            body=SURVEILLANCE,
        )
        self.debate.drain()
        self.assertIn(SURVEILLANCE, self.bodies("demo", "flock-cameras", "invasion-of-privacy"))
        self.assertNotIn("mass-surveillance", self.keys("demo", "flock-cameras"))
        history = json.loads(
            (self.debate.repo.path / "pages/demo/topics/flock-cameras/key-history.json").read_text()
        )
        self.assertEqual(history["mass-surveillance"], "invasion-of-privacy")
        self.assertIsInstance(history["mass-surveillance"], str)
        index = json.loads((self.debate.repo.path / "pages/demo/index.json").read_text())
        self.assertEqual(
            index["topics"]["flock-cameras"]["history"]["mass-surveillance"],
            "invasion-of-privacy",
        )
        renamed = self.one("rename", key="invasion-of-privacy")
        self.assertEqual(renamed["from"], "mass-surveillance")
        self.assertEqual(renamed["confidence"], "high")
        self.assertEqual(renamed["rule"], "default")
        self.assertEqual(
            self.debate.resolve("demo", "flock-cameras", "mass-surveillance"),
            "invasion-of-privacy",
        )

    def test_posted_rule_refuses_a_rename(self):
        self.debate.post_rules("Keys never change.\n")
        self.assertIn("Keys never change", (self.debate.repo.path / "rules.md").read_text())
        self.assertFalse(self.debate.rules().allows_rename())
        self.debate.place(
            new_uuid(),
            page="demo",
            topic="flock-cameras",
            key="mass-surveillance",
            body=SURVEILLANCE,
        )
        self.debate.drain()
        self.assertEqual(self.keys("demo", "flock-cameras"), ["mass-surveillance"])
        self.assertFalse(self.kind_present("rename"))
        filed = self.file_decision(SURVEILLANCE)
        self.assertEqual(filed["keys"], ["mass-surveillance"])
        self.assertEqual(filed["confidence"], "high")
        self.assertEqual(filed["rule"], "posted")

    def kind_present(self, kind):
        return any(item["kind"] == kind for item in self.decisions())

    def test_low_confidence_is_posted_and_does_not_change_the_outcome(self):
        body = "These cameras are legal but they are illegal."
        self.assertFalse((self.debate.repo.path / "rules.md").exists())
        self.debate.submit(new_uuid(), page="demo", topic="flock-cameras", body=body)
        self.debate.drain()
        self.assertIn(body, self.bodies("demo", "flock-cameras", "illegal"))
        self.assertNotIn("legal", self.keys("demo", "flock-cameras"))
        self.assertNotIn("uncategorized", self.keys("demo", "flock-cameras"))
        filed = self.file_decision(body)
        self.assertEqual(filed["keys"], ["illegal"])
        self.assertEqual(filed["confidence"], "low")
        self.assertNotEqual(filed["confidence"], "high")
        self.assertEqual(filed["rule"], "default")
        suggested = self.one("suggestion", key="legal")
        self.assertFalse(suggested["created"])
        self.assertEqual(suggested["confidence"], "high")
        self.assertFalse((self.debate.repo.path / "pages/demo/topics/flock-cameras/legal").exists())

    def test_missing_rules_file_uses_the_builtin_default(self):
        self.assertFalse((self.debate.repo.path / "rules.md").exists())
        rules = self.debate.rules()
        baseline = default_rules()
        self.assertEqual(rules.mint, baseline.mint)
        self.assertEqual(rules.keys, baseline.keys)
        self.assertEqual(rules.questions_allowed, baseline.questions_allowed)
        self.assertEqual(rules.ai_may_swear, baseline.ai_may_swear)
        self.assertTrue(rules.allows_new_key())
        self.assertIn("Do not mint a key just to catch every sentence", default_rules_text())
        self.assertIn("The AI does not swear", default_rules_text())
        body = "This shit is mass surveillance."
        self.debate.submit(new_uuid(), page="demo", topic="flock-cameras", body=body)
        self.debate.drain()
        self.assertIn("invasion-of-privacy", self.keys("demo", "flock-cameras"))
        position = (
            self.debate.repo.path / "pages/demo/topics/flock-cameras/invasion-of-privacy/position.md"
        ).read_text().lower()
        self.assertIn("mass surveillance", position)
        self.assertNotIn("shit", position)
        filed = self.file_decision(body)
        self.assertEqual(filed["keys"], ["invasion-of-privacy"])
        self.assertEqual(filed["confidence"], "high")
        self.assertEqual(filed["rule"], "default")
        summary = self.one("summary", key="invasion-of-privacy")
        self.assertEqual(summary["rule"], "default")
        self.assertEqual(summary["confidence"], "high")

    def test_pairs_are_recorded_without_a_merge(self):
        user = new_uuid()
        self.debate.submit(user, page="demo", topic="flock-cameras", body=SURVEILLANCE)
        self.debate.submit(user, page="demo", topic="flock-cameras", body=SECURITY)
        self.debate.drain()
        pairs = json.loads(
            (self.debate.repo.path / "pages/demo/topics/flock-cameras/pairs.json").read_text()
        )
        self.assertIn(["invasion-of-privacy", "national-security"], pairs["pairs"])
        self.assertEqual(pairs["confidence"], "high")
        self.assertEqual(pairs["rule"], "default")
        head = self.debate.repo.head()
        self.assertFalse(
            self.debate.try_rename("demo", "flock-cameras", "national-security", "invasion-of-privacy")
        )
        self.assertEqual(self.debate.repo.head(), head)
        self.assertEqual(
            self.keys("demo", "flock-cameras"),
            ["invasion-of-privacy", "national-security"],
        )

    def test_second_pass_keeps_the_posted_confidence(self):
        self.debate.submit(new_uuid(), page="demo", topic="flock-cameras", body=SURVEILLANCE)
        self.debate.drain()
        posted = self.decisions()
        self.assertTrue(any(item["confidence"] in {"high", "low"} for item in posted))
        head = self.debate.repo.head()
        again = self.debate.drain()
        self.assertEqual(again.commits, 0)
        self.assertEqual(self.debate.repo.head(), head)
        self.assertEqual(self.decisions(), posted)


if __name__ == "__main__":
    unittest.main()
