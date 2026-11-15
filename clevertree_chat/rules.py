"""Relay default debate rules, and a posted rules.md that can replace them.

The default is built into this module. A missing rules.md does not get a copied file.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class Rules:
    fair: bool = True
    everyone_heard: bool = True
    honest: bool = True
    check_bias: bool = True
    represent_dangerous: bool = True
    users_may_swear: bool = True
    ai_may_swear: bool = False
    emotionless: bool = True
    keys: str = "ai"  # ai | rarely | never
    mint: str = "spill"  # spill | never
    questions_allowed: bool = True
    generated_names: str = (
        "professional, safe for work, funny when it fits, simple"
    )
    summary_prefix: str | None = None

    def allows_rename(self) -> bool:
        return self.keys != "never"

    def allows_new_key(self) -> bool:
        return self.mint != "never"


def default_rules() -> Rules:
    return Rules()


def default_rules_text() -> str:
    """The prose both passes follow when a repo has not posted rules.md."""
    return """# Relay default rules

We say SI (Super Intelligence, i.e. AI) for the software that files, summarizes, and curates.

- SI curates and organizes only. It does not vote, pick winners, or take sides. Preference and tallies are human. It keeps the map fair and legible at a scale a human alone cannot — objective by design, not a referee of truth.
- The debate must be fair.
- Everyone must be heard.
- Every argument must be investigated and represented honestly.
- Check for bias. Mainstream, established opinion is a bias the SI can fall into. Counter opinions are represented accurately, including a message that is dangerous or antisocial.
- People may swear in their own posts. The SI does not swear unless a posted rule says the SI may swear.
- The SI re-represents every opinion without emotion. Nobody is scolded, and the claim is not softened into a different claim.
- Keys are up to the SI. Topics and subtopics may be renamed when the name should change. Old names stay in the index so links follow.
- Do not mint a key just to catch every sentence. Mint one when a post does not fit the keys that already exist.
- File every post as soon as it appears. Do not wait for disagreement before opening a key.
- Agreement under a page thesis still gets distinct sub-axis keys from distinct claim shapes. Do not collapse consensus into `other`.
- The page path is the topic. Never mint a key whose slug equals the page id.
- A non-argument (`lol`, join noise, username-only) is stored under `other`. Prefer `other` over leaving `uncategorized` for a post that is not an argument.
- Unwritten counters stay suggestions, not directories, until someone writes them.
- Questions are allowed. A question that names an axis joins that category. A question that fits an existing key does not open a new one.
- A visitor who has not named themselves gets a generated name from the topic and what they wrote. Keep generated names professional, safe for work, funny when that still fits, and simple.
- Spam is ascertained by the batch SI. After a flag, anyone who sees it may support or protest within 48 hours. If the flag still stands when that window ends, the post is removed from view. After a further 7 days, it is removed entirely. A repo may tighten those clocks or the spam definition in rules.md. Contests inform the batch; they do not rewrite standing rules by themselves.
"""


def parse_rules(text: str | None) -> Rules:
    if text is None or not text.strip():
        return default_rules()
    rules = default_rules()
    lower = text.lower()
    if re.search(
        r"keys never change|keys do not change|keys must not change|"
        r"do not rename keys|renames are frozen|keys change not at all|"
        r"keys do not change at all",
        lower,
    ):
        rules.keys = "never"
    elif re.search(r"keys rarely change|keys change rarely|rename rarely", lower):
        rules.keys = "rarely"
    for line in text.splitlines():
        stripped = line.strip().lower().lstrip("-").strip()
        if stripped in {
            "the ai may swear.",
            "the ai may swear",
            "the si may swear.",
            "the si may swear",
        }:
            rules.ai_may_swear = True
        if (
            "ai swearing is allowed" in stripped
            or "allow the ai to swear" in stripped
            or "si swearing is allowed" in stripped
            or "allow the si to swear" in stripped
        ):
            rules.ai_may_swear = True
    match = re.search(
        r"summaries must start with\s+[\"'\u201c]([^\"'\u201d]+)[\"'\u201d]",
        text,
        re.IGNORECASE,
    )
    if match:
        rules.summary_prefix = match.group(1).strip()
    prefix_line = re.search(r"^summary_prefix:\s*(.+)$", text, re.IGNORECASE | re.MULTILINE)
    if prefix_line:
        rules.summary_prefix = prefix_line.group(1).strip().strip("\"'")
    if re.search(r"never open a new topic|do not open a new topic|no new topics", lower):
        rules.mint = "never"
    if re.search(r"do not ask questions|questions are not allowed|no questions", lower):
        rules.questions_allowed = False
    return rules
