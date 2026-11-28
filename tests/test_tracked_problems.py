"""Tracked-problem catalog + sort for SI panel."""

from __future__ import annotations

import unittest
from pathlib import Path

from clevertree_chat.tracked_problems import (
    load_demo_catalog,
    merge_tip_resolutions,
    sort_tracked_problems,
    tracked_problems_for_topic,
)

ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "fronts" / "room" / "tracked-problems.demo.json"


class TrackedProblemsTests(unittest.TestCase):
    def test_demo_catalog_lamp_solved_opens_first(self):
        rows = tracked_problems_for_topic("mp-general")
        self.assertTrue(rows)
        self.assertEqual(rows[0]["status"], "open")
        lamp = next(r for r in rows if r["id"] == "lamp-coach-lantern")
        self.assertEqual(lamp["status"], "solved")
        self.assertEqual(rows[-1]["id"], "lamp-coach-lantern")
        statuses = [r["status"] for r in rows]
        if "solved" in statuses and "open" in statuses:
            self.assertLess(statuses.index("open"), statuses.index("solved"))

    def test_garage_ring_open_with_tip_slug(self):
        rows = tracked_problems_for_topic("mp-general")
        garage = next(r for r in rows if r["id"] == "garage-ring-power")
        self.assertEqual(garage["status"], "open")
        self.assertEqual(garage["tip_slug"], "garage-ring-power")

    def test_tip_resolution_overlay_marks_solved(self):
        rows = tracked_problems_for_topic(
            "mp-general",
            tip_resolutions={"garage-ring-power": "solved"},
        )
        garage = next(r for r in rows if r["id"] == "garage-ring-power")
        self.assertEqual(garage["status"], "solved")
        self.assertEqual(garage["source"], "tip")

    def test_sort_open_before_solved(self):
        mixed = [
            {"id": "a", "title": "A", "status": "solved", "updated_at": "2026-11-28T00:00:00Z"},
            {"id": "b", "title": "B", "status": "open", "updated_at": "2026-11-20T00:00:00Z"},
            {"id": "c", "title": "C", "status": "open", "updated_at": "2026-11-27T00:00:00Z"},
        ]
        sorted_rows = sort_tracked_problems(mixed)
        self.assertEqual([r["id"] for r in sorted_rows], ["c", "b", "a"])

    def test_merge_idempotent_without_tips(self):
        cat = load_demo_catalog(DEMO)
        base = cat["mp-general"]
        self.assertEqual(merge_tip_resolutions(base, None), base)


if __name__ == "__main__":
    unittest.main()
