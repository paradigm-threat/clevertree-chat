"""Website share paths (/w/…) and empty-until-first-comment."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from clevertree_chat import live_runtime as live
from clevertree_chat.website_href import href_and_scope_from_w


class WebsiteHrefTests(unittest.TestCase):
    def test_host_only_is_domain_scope(self):
        href, scope = href_and_scope_from_w("example.com")
        self.assertEqual(href, "https://example.com/")
        self.assertEqual(scope, "domain")

    def test_host_path_is_path_scope(self):
        href, scope = href_and_scope_from_w("example.com/news/story")
        self.assertEqual(href, "https://example.com/news/story")
        self.assertEqual(scope, "path")

    def test_full_url_and_query_param(self):
        href, scope = href_and_scope_from_w("", "https://www.Example.com/a?utm_source=x&id=9")
        self.assertTrue(href.startswith("https://example.com/a"))
        self.assertIn("id=9", href)
        self.assertEqual(scope, "path")

    def test_encoded_https_remainder(self):
        href, scope = href_and_scope_from_w("https%3A%2F%2Fexample.com%2Fdocs%2F")
        self.assertEqual(href, "https://example.com/docs/")
        self.assertEqual(scope, "path")


class ResolveDoesNotCreateSoT(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.comments = root / "comments"
        self.auth = root / "auth"
        self.comments.mkdir()
        self.auth.mkdir()
        live._service = None
        live._store = None
        live._pages.clear()
        live._visitors.clear()
        self.env = mock.patch.dict(
            "os.environ",
            {
                "CLEVERTREE_COMMENTS_PATH": str(self.comments),
                "CLEVERTREE_AUTH_PATH": str(self.auth),
                "CLEVERTREE_SEED_FIXTURES": "0",
                "CLEVERTREE_COMMENTS_SYNC": "0",
            },
            clear=False,
        )
        self.env.start()

    def tearDown(self):
        self.env.stop()
        live._service = None
        live._store = None
        live._pages.clear()
        self.tmp.cleanup()

    def test_resolve_view_empty_no_topic_dir(self):
        code, resolved = live.dispatch(
            {
                "action": "resolve",
                "url": "https://example.com/article/one",
                "page_scope": "path",
            },
            {},
        )
        self.assertEqual(code, 200)
        topic = resolved["topic"]
        self.assertTrue(topic.startswith("u-"))
        self.assertFalse(resolved["exists"])
        self.assertFalse(resolved["view"]["exists"])
        # No pages/<page>/topics/<topic> until first comment.
        pages = self.comments / "pages"
        if pages.is_dir():
            for topic_dir in pages.glob("*/topics/*"):
                self.assertNotEqual(topic_dir.name, topic)

    def test_submit_creates_topic_then(self):
        code, resolved = live.dispatch(
            {"action": "resolve", "url": "https://example.com/", "page_scope": "domain"},
            {},
        )
        self.assertEqual(code, 200)
        topic = resolved["topic"]
        visitor = resolved["visitor"]
        code2, filed = live.dispatch(
            {
                "action": "submit",
                "topic": topic,
                "visitor": visitor,
                "body": "First point about this site.",
            },
            {},
        )
        self.assertEqual(code2, 200)
        page_root = self.comments / "pages" / "try" / "topics" / topic
        self.assertTrue(page_root.is_dir(), msg=f"expected {page_root}")
        # Provisional page recorded for batch association later.
        assoc = self.comments / "associations.json"
        self.assertTrue(assoc.is_file())
        text = assoc.read_text()
        self.assertIn(resolved["normalized"], text)
        self.assertIn(topic, text)

    def test_domain_and_path_are_different_rooms(self):
        _, domain = live.dispatch(
            {
                "action": "resolve",
                "url": "https://example.com/news/a",
                "page_scope": "domain",
            },
            {},
        )
        _, path = live.dispatch(
            {
                "action": "resolve",
                "url": "https://example.com/news/a",
                "page_scope": "path",
                "visitor": domain["visitor"],
            },
            {},
        )
        self.assertNotEqual(domain["topic"], path["topic"])
        self.assertTrue(domain["normalized"].endswith("example.com/"))
        self.assertIn("news/a", path["normalized"])


if __name__ == "__main__":
    unittest.main()
