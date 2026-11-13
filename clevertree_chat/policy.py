"""Markdown display policy. The default is built in, not copied in as a file."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class Policy:
    links: bool = True
    images: str = "links"  # links | show


def default_policy() -> Policy:
    return Policy(links=True, images="links")


def parse_policy(text: str | None) -> Policy:
    policy = default_policy()
    if not text or not text.strip():
        return policy
    for line in text.splitlines():
        stripped = line.strip().lower()
        images = re.search(r"images\s*:\s*(show|links)", stripped)
        if images:
            policy.images = images.group(1)
        if "show images" in stripped:
            policy.images = "show"
        links = re.search(r"links\s*:\s*(on|off|allowed)", stripped)
        if links:
            value = links.group(1)
            policy.links = value != "off"
        if "turn links off" in stripped or "links are off" in stripped:
            policy.links = False
    return policy
