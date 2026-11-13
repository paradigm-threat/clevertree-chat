"""Scripted thc-legalization demo: Maya and Jordan, post-driven filing.

Medical and adult-use appear in the posts. Keys open only when a post forces them.
No git. No Spot.
"""

from __future__ import annotations

from clevertree_chat.demos.personas import JORDAN, MAYA

TOPIC = "thc-legalization"

POSITIONS = {
    "personal-freedom": (
        "Adults should be free to use THC, and patients should not beg for medical access."
    ),
    "public-health-harm": (
        "High-THC products raise youth and mental-health harm that legalization can worsen."
    ),
    "tax-and-regulate": (
        "Tax, test, and sell in stores so the legal market funds rules and treatment."
    ),
    "illicit-market": (
        "Legal shops do not end the illicit market; untaxed supply still undercuts stores."
    ),
    "uncategorized": "These posts do not form one distinct argument.",
}

SUGGESTIONS = {
    "personal-freedom": {
        "key": "public-health-harm",
        "citation": "",
        "note": "Unwritten counter. Not a directory until someone writes it.",
    },
    "illicit-market": {
        "key": "federal-ban",
        "citation": "",
        "note": "Unwritten counter: keep the federal ban. It is not a directory until someone writes it.",
    },
}

SCRIPT = [
    {
        "id": "maya-adult-use",
        "author": MAYA,
        "body": (
            "Adults should be free to use THC. Ending prohibition is a personal freedom "
            "question, not a corporate favor."
        ),
        "chosen": "",
        "preview": None,
        "live_key": "uncategorized",
        "drain_keys": ["personal-freedom"],
        "notice": "Batch placed this post under personal-freedom.",
        "open_suggestions_from": ["personal-freedom"],
    },
    {
        "id": "jordan-harm",
        "author": JORDAN,
        "body": (
            "High-THC concentrates and edibles are already linked to ER visits and youth "
            "exposure. Legalization without hard public-health limits makes that harm worse."
        ),
        "chosen": "",
        "preview": "personal-freedom",
        "live_key": "uncategorized",
        "drain_keys": ["public-health-harm"],
        "notice": "Batch placed this post under public-health-harm and paired the counters.",
        "open_suggestions_from": [],
        "pair": ["personal-freedom", "public-health-harm"],
    },
    {
        "id": "maya-medical",
        "author": MAYA,
        "body": (
            "My mom's oncologist already recommends cannabis for nausea. Adult-use shops "
            "without a clear medical path still leave patients negotiating with pharmacists."
        ),
        "chosen": "",
        "preview": "personal-freedom",
        "live_key": "uncategorized",
        "drain_keys": ["personal-freedom"],
        "notice": "The medical-access post joined personal-freedom. The posts forced that key, not a topic menu.",
        "open_suggestions_from": [],
    },
    {
        "id": "jordan-tax",
        "author": JORDAN,
        "body": (
            "Tax it, test it, sell it in licensed stores. That is how you set potency rules "
            "and fund treatment instead of pretending a ban still works."
        ),
        "chosen": "",
        "preview": None,
        "live_key": "uncategorized",
        "drain_keys": ["tax-and-regulate"],
        "notice": "Batch opened tax-and-regulate because this post argued regulation, not freedom.",
        "open_suggestions_from": [],
    },
    {
        "id": "maya-illicit",
        "author": MAYA,
        "body": (
            "Legal shops did not kill the illicit market. Untaxed dealers still undercut the "
            "store price, and high-THC product keeps crossing state lines."
        ),
        "chosen": "",
        "preview": "tax-and-regulate",
        "live_key": "uncategorized",
        "drain_keys": ["illicit-market"],
        "notice": "Batch opened illicit-market. federal-ban stays a suggestion, not a directory.",
        "open_suggestions_from": ["illicit-market"],
    },
    {
        "id": "jordan-federal",
        "author": JORDAN,
        "body": "So should the federal ban just stay forever while states legalize around it?",
        "chosen": "",
        "preview": "illicit-market",
        "live_key": "uncategorized",
        "drain_keys": ["illicit-market"],
        "notice": "The federal-ban question joined illicit-market. federal-ban was not opened.",
        "open_suggestions_from": ["illicit-market"],
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
    if (
        "freedom" in text or "prohibit" in text or "adult" in text or "patient" in text or "medical" in text
    ) and "personal-freedom" in existing:
        return "personal-freedom"
    if (
        "harm" in text or "youth" in text or "er visit" in text or "potency" in text or "mental" in text
    ) and "public-health-harm" in existing:
        return "public-health-harm"
    if ("tax" in text or "regulate" in text or "licensed" in text) and "tax-and-regulate" in existing:
        return "tax-and-regulate"
    if (
        "illicit" in text or "street" in text or "untaxed" in text or "federal" in text
    ) and "illicit-market" in existing:
        return "illicit-market"
    return None


def freeform_drain(text: str, state: dict) -> list[str]:
    lower = text.lower()
    if "illicit" in lower or "untaxed" in lower or "street market" in lower:
        state["suggestion_sources"].add("illicit-market")
        return ["illicit-market"]
    if "tax" in lower or "regulate" in lower or "licensed" in lower:
        return ["tax-and-regulate"]
    if "youth" in lower or "er visit" in lower or "potency" in lower or "public-health" in lower:
        return ["public-health-harm"]
    if (
        "freedom" in lower
        or "prohibit" in lower
        or "medical" in lower
        or "patient" in lower
        or "adult" in lower
    ):
        state["suggestion_sources"].add("personal-freedom")
        return ["personal-freedom"]
    if len(lower) < 12:
        return ["uncategorized"]
    return ["uncategorized"]


def after_freeform(state: dict) -> None:
    if (
        "personal-freedom" in state["keys"]
        and "public-health-harm" in state["keys"]
        and ["personal-freedom", "public-health-harm"] not in state["pairs"]
        and ["public-health-harm", "personal-freedom"] not in state["pairs"]
    ):
        state["pairs"].append(["personal-freedom", "public-health-harm"])
