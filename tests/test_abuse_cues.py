"""CPU abuse cue scanner for investigate context."""

from __future__ import annotations

import unittest

from clevertree_chat.abuse_cues import scan_line, scan_lines


class AbuseCueTests(unittest.TestCase):
    def test_clean(self):
        self.assertEqual(scan_line("Public chat should stay free forever."), [])

    def test_spam(self):
        hits = scan_line("FREE NITRO click here discord.gg/abc123 limited time")
        self.assertIn("spam", hits)

    def test_fraud(self):
        hits = scan_line("Send BTC to this wallet or wire transfer gift card now")
        self.assertIn("scam/fraud", hits)

    def test_harass(self):
        hits = scan_line("just kys already")
        self.assertIn("harassment", hits)

    def test_scan_lines_caps(self):
        rows = scan_lines(
            [
                "hello",
                "buy viagra now",
                "normal claim about privacy",
                "send usdt seed phrase",
            ],
            limit=2,
        )
        self.assertEqual(len(rows), 2)
        self.assertIn("spam", rows[0]["cues"])


if __name__ == "__main__":
    unittest.main()
