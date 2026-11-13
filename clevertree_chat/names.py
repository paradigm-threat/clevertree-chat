"""Generated visitor names. Professional, safe for work, funny when it fits, simple."""

from __future__ import annotations

import hashlib

ALLOWLIST: tuple[str, ...] = (
    "Polite Badger",
    "Even Ledger",
    "Mild Thunder",
    "Calm Cartographer",
    "Orderly Heron",
    "Fair Compass",
    "Bright Footnote",
    "Steady Oak",
    "Plain Speaker",
    "Soft Gavel",
    "Neat Margin",
    "Civil Sparrow",
    "Measured Fox",
    "Sunny Filing",
    "Gentle Anvil",
    "Quiet Archivist",
    "Kind Lantern",
    "Warm Index",
    "Clear Window",
    "Brass Teapot",
)


def generated_name(uuid: str, topic: str, writing: str) -> str:
    """Pick an allowlisted name from the topic and what this visitor wrote.

    A different body can revise the name. The caller leaves a chosen name alone.
    """
    material = f"{uuid}\n{topic}\n{writing.strip().lower()}".encode()
    number = int(hashlib.sha256(material).hexdigest()[:8], 16)
    return ALLOWLIST[number % len(ALLOWLIST)]


def empty_index() -> dict:
    return {"next_id": 1, "by_uuid": {}, "by_id": {}}


def issue_id(index: dict, uuid: str, name: str, source: str) -> int:
    """Issue the next incremental id. Issued ids are never reused."""
    existing = index["by_uuid"].get(uuid)
    if existing:
        return int(existing["id"])
    short_id = int(index["next_id"])
    index["by_uuid"][uuid] = {
        "id": short_id,
        "name": name,
        "name_source": source,
    }
    index["by_id"][str(short_id)] = uuid
    index["next_id"] = short_id + 1
    return short_id
