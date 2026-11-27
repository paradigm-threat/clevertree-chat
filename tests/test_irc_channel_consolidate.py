"""PT channel consolidation + craft channel mapping."""

from __future__ import annotations

import os
import unittest

from clevertree_chat.irc_client import (
    channel_for_topic,
    ensure_trailing_tag,
    parse_context_tags,
    topic_for_channel,
)


class TestIrcChannelConsolidate(unittest.TestCase):
    def setUp(self) -> None:
        os.environ["CLEVERTREE_IRC_CONSOLIDATE_PT"] = "1"

    def test_pt_topics_share_one_channel(self) -> None:
        self.assertEqual(channel_for_topic("pt", "flock-cameras"), "#pt")
        self.assertEqual(channel_for_topic("pt", "5g"), "#pt")
        self.assertEqual(channel_for_topic("pt", "general"), "#pt")
        self.assertEqual(channel_for_topic("pt", ""), "#pt")

    def test_public_web(self) -> None:
        self.assertEqual(channel_for_topic("pt", "web"), "#web")
        self.assertEqual(topic_for_channel("pt", "#web"), "web")

    def test_craft_unchanged(self) -> None:
        self.assertEqual(
            channel_for_topic("pt", "ga-savannah-cat-rescue"),
            "#ga-savannah-cat-rescue",
        )

    def test_topic_for_pt(self) -> None:
        self.assertEqual(topic_for_channel("pt", "#pt"), "general")
        self.assertEqual(topic_for_channel("pt", "#pt-flock-cameras"), "general")

    def test_trailing_tags(self) -> None:
        self.assertEqual(ensure_trailing_tag("hi", "[[t:0]]"), "hi [[t:0]]")
        self.assertEqual(ensure_trailing_tag("hi [[t:0]]", "[[t:0]]"), "hi [[t:0]]")
        tags = parse_context_tags("hello [[t:3]] [[d:Example.com]]")
        self.assertEqual(tags["topic_id"], 3)
        self.assertEqual(tags["domain"], "example.com")

    def test_legacy_mode(self) -> None:
        os.environ["CLEVERTREE_IRC_CONSOLIDATE_PT"] = "0"
        self.assertEqual(channel_for_topic("pt", "flock-cameras"), "#pt-flock-cameras")
        os.environ["CLEVERTREE_IRC_CONSOLIDATE_PT"] = "1"


if __name__ == "__main__":
    unittest.main()
