#!/usr/bin/env python3
"""Prepare Paradigm Threat IRC consolidation: rewrite log lines with [[t:]] tags.

Dry-run by default. Does not delete Ergo channels — print ops steps for pub1.

Usage:
  python3 scripts/consolidate_pt_channels.py --log-dir /path/to/irc-logs
  python3 scripts/consolidate_pt_channels.py --log-dir ... --write /tmp/pt-merged.jsonl
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

TOPIC_CH = re.compile(r"^#?pt-(.+)$", re.I)


def topic_from_name(name: str) -> str | None:
    m = TOPIC_CH.match(name.strip())
    return m.group(1).lower() if m else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--log-dir", type=Path, help="Directory of per-channel log files")
    ap.add_argument("--write", type=Path, help="Write merged JSONL (otherwise dry-run)")
    args = ap.parse_args()

    print("PT consolidation: target channel #pt (topics via [[t:…]] tags)")
    print("Ergo ops (run on pub1 as root when ready):")
    print("  1. Stop joining #pt-* in bridge (CLEVERTREE_IRC_CONSOLIDATE_PT=1).")
    print("  2. Merge logs with this script.")
    print("  3. Optionally remove empty legacy channels in Ergo after cutover.")
    print()

    if not args.log_dir or not args.log_dir.is_dir():
        print("No --log-dir; dry policy only.")
        return 0

    merged: list[dict] = []
    for path in sorted(args.log_dir.iterdir()):
        if not path.is_file():
            continue
        topic = topic_from_name(path.stem) or topic_from_name(path.name)
        if not topic and path.stem in {"pt", "#pt"}:
            topic = "general"
        if not topic:
            continue
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
                text = str(row.get("text") or row.get("body") or "")
            except json.JSONDecodeError:
                row = {"text": line}
                text = line
            if f"[[t:{topic}]]" not in text and topic != "general":
                text = f"[[t:{topic}]] {text}".strip()
            row["text"] = text
            row["channel"] = "#pt"
            row["legacy_topic"] = topic
            merged.append(row)
        print(f"  + {path.name} → topic={topic} lines folded")

    print(f"Total merged lines: {len(merged)}")
    if args.write:
        args.write.write_text(
            "\n".join(json.dumps(r, separators=(",", ":")) for r in merged) + ("\n" if merged else ""),
            encoding="utf-8",
        )
        print(f"Wrote {args.write}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
