"""Scripted flock-cameras demo: Maya and Jordan, optimal SI filing.

No git. No Spot. Keys stay short and distinct. Posts dictate the keys.
"""

from __future__ import annotations

from clevertree_chat.demos.personas import JORDAN, MAYA

TOPIC = "flock-cameras"

POSITIONS = {
    "invasion-of-privacy": "These cameras are mass surveillance and an invasion of privacy.",
    "national-security": "These cameras are needed now for national security and trafficking cases.",
    "illegal": "These cameras are illegal without a warrant.",
    "data-sharing": "Nationwide plate lookups and ICE or CBP access break local and state limits.",
    "uncategorized": "These posts do not form one distinct argument.",
}

SUGGESTIONS = {
    "invasion-of-privacy": {
        "key": "national-security",
        "citation": "",
        "note": "Unwritten counter. Not a directory until someone writes it.",
    },
    "illegal": {
        "key": "legal",
        "citation": "https://www.congress.gov/bill/107th-congress/house-bill/3162",
        "note": "Patriot Act is a counter nobody has written. It is not a directory.",
    },
    "data-sharing": {
        "key": "local-only",
        "citation": "",
        "note": "Unwritten counter: keep scans on a local watch list only.",
    },
}

SCRIPT = [
    {
        "id": "maya-privacy",
        "author": MAYA,
        "body": "These cameras are mass surveillance and an invasion of privacy.",
        "chosen": "",
        "preview": None,
        "live_key": "uncategorized",
        "drain_keys": ["invasion-of-privacy"],
        "notice": "Batch placed this post under invasion-of-privacy.",
        "open_suggestions_from": ["invasion-of-privacy"],
    },
    {
        "id": "jordan-security",
        "author": JORDAN,
        "body": "We need these cameras now for national security and to catch trafficking.",
        "chosen": "",
        "preview": "invasion-of-privacy",
        "live_key": "uncategorized",
        "drain_keys": ["national-security"],
        "notice": "Batch placed this post under national-security and paired the counters.",
        "open_suggestions_from": [],
        "pair": ["invasion-of-privacy", "national-security"],
    },
    {
        "id": "maya-illegal",
        "author": MAYA,
        "body": "But it's illegal! Local data gets searched nationwide.",
        "chosen": "",
        "preview": "invasion-of-privacy",
        "live_key": "uncategorized",
        "drain_keys": ["illegal"],
        "notice": "Batch opened illegal. legal stays a suggestion with a Patriot Act citation.",
        "open_suggestions_from": ["illegal"],
    },
    {
        "id": "jordan-question",
        "author": JORDAN,
        "body": "Are these cameras illegal?",
        "chosen": "",
        "preview": "illegal",
        "live_key": "uncategorized",
        "drain_keys": ["illegal"],
        "notice": "The question joined illegal. It was not put in other.",
        "open_suggestions_from": ["illegal"],
    },
    {
        "id": "maya-multi",
        "author": MAYA,
        "body": "These cameras are illegal mass surveillance.",
        "chosen": "",
        "preview": "illegal",
        "live_key": "uncategorized",
        "drain_keys": ["illegal", "invasion-of-privacy"],
        "notice": "One post, listed from illegal and invasion-of-privacy.",
        "open_suggestions_from": ["illegal"],
    },
    {
        "id": "jordan-sharing",
        "author": JORDAN,
        "body": (
            "Illinois and California already say sharing plate hits with ICE and CBP "
            "breaks state law. The national lookup is the product. Out-of-state travel "
            "searches show why local data should stay local."
        ),
        "chosen": "",
        "preview": None,
        "live_key": "uncategorized",
        "drain_keys": ["data-sharing"],
        "notice": "Batch opened data-sharing. local-only stays a suggestion.",
        "open_suggestions_from": ["data-sharing"],
    },
    {
        "id": "maya-lol",
        "author": MAYA,
        "body": "lol",
        "chosen": "",
        "preview": None,
        "live_key": "uncategorized",
        "drain_keys": ["other"],
        "notice": "Batch filed lol under other. No clever key.",
        "open_suggestions_from": [],
    },
]


def preview_suggestion(body: str, existing: list[str]) -> str | None:
    text = (body or "").lower()
    if "illegal" in text and "illegal" in existing:
        return "illegal"
    if ("privacy" in text or "surveillance" in text) and "invasion-of-privacy" in existing:
        return "invasion-of-privacy"
    if ("security" in text or "traffick" in text) and "national-security" in existing:
        return "national-security"
    if ("ice" in text or "sharing" in text or "lookup" in text) and "data-sharing" in existing:
        return "data-sharing"
    return None


def freeform_drain(text: str, state: dict) -> list[str]:
    lower = text.lower()
    if "illegal" in lower and "surveillance" in lower:
        state["suggestion_sources"].add("illegal")
        return ["illegal", "invasion-of-privacy"]
    if "illegal" in lower:
        state["suggestion_sources"].add("illegal")
        return ["illegal"]
    if "ice" in lower or "cbp" in lower or "sharing" in lower or "lookup" in lower:
        state["suggestion_sources"].add("data-sharing")
        return ["data-sharing"]
    if "security" in lower or "traffick" in lower:
        return ["national-security"]
    if "privacy" in lower or "surveillance" in lower:
        state["suggestion_sources"].add("invasion-of-privacy")
        return ["invasion-of-privacy"]
    return ["uncategorized"]


def after_freeform(state: dict) -> None:
    if (
        "invasion-of-privacy" in state["keys"]
        and "national-security" in state["keys"]
        and ["invasion-of-privacy", "national-security"] not in state["pairs"]
        and ["national-security", "invasion-of-privacy"] not in state["pairs"]
    ):
        state["pairs"].append(["invasion-of-privacy", "national-security"])
