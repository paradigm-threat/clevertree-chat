#!/usr/bin/env python3
"""Prepare Paradigm Threat IRC consolidation: rewrite log lines with [[t:N]] tags.

Dry-run by default. Does not delete Ergo channels — print ops steps for pub1.

Usage:
  python3 scripts/consolidate_pt_channels.py --log-dir /path/to/irc-logs --topics fixtures/pt-topics.json
  python3 scripts/consolidate_pt_channels.py --log-dir ... --topics ... --write /tmp/pt-merged.jsonl
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


def load_slug_to_id(topics_path: Path | None) -> dict[str, int]:
    mapping: dict[str, int] = {"general": 0}
    if not topics_path or not topics_path.is_file():
        return mapping
    data = json.loads(topics_path.read_text(encoding="utf-8"))
    for row in data.get("topics") or []:
        try:
            tid = int(row["id"])
            slug = str(row.get("slug") or "").strip().lower()
        except (KeyError, TypeError, ValueError):
            continue
        if slug:
            mapping[slug] = tid
            mapping[slug.replace("/", "-")] = tid
            mapping[slug.replace("-", "/")] = tid
    return mapping


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--log-dir", type=Path, help="Directory of per-channel log files")
    ap.add_argument("--topics", type=Path, help="chat/topics.json (slug → id)")
    ap.add_argument("--write", type=Path, help="Write merged JSONL (otherwise dry-run)")
    args = ap.parse_args()

    slug_to_id = load_slug_to_id(args.topics)
    unmapped: set[str] = set()

    print("PT consolidation: target channel #pt (topics via trailing [[t:N]])")
    print("Ergo ops (run on pub1 as root when ready):")
    print("  1. Stop joining #pt-* in bridge (CLEVERTREE_IRC_CONSOLIDATE_PT=1).")
    print("  2. Merge logs with this script (--topics chat/topics.json).")
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
        tid = slug_to_id.get(topic)
        if tid is None:
            # try dashed/slashed variants
            tid = slug_to_id.get(topic.replace("/", "-"))
        if tid is None:
            unmapped.add(topic)
            tid = 0
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
            tag = f"[[t:{tid}]]"
            if tag not in text and not re.search(r"\[\[t:\d+\]\]", text):
                text = f"{text} {tag}".strip() if text else tag
            row["text"] = text
            row["channel"] = "#pt"
            row["legacy_topic"] = topic
            row["topic_id"] = tid
            merged.append(row)
        print(f"  + {path.name} → topic={topic} id={tid} lines folded")

    print(f"Total merged lines: {len(merged)}")
    if unmapped:
        print("Unmapped slugs (filed as [[t:0]] — admin should curate topics.json):")
        for s in sorted(unmapped):
            print(f"  - {s}")
    if args.write:
        args.write.write_text(
            "\n".join(json.dumps(r, separators=(",", ":")) for r in merged)
            + ("\n" if merged else ""),
            encoding="utf-8",
        )
        print(f"Wrote {args.write}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
