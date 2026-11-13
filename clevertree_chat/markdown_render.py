"""Render a safe Markdown subset. Raw HTML is escaped and not rendered."""

from __future__ import annotations

import re

from clevertree_chat.policy import Policy

_TOKEN = re.compile(
    r"!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)",
)


def _escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _safe_url(url: str) -> bool:
    lowered = url.strip().lower()
    if lowered.startswith(("javascript:", "data:", "vbscript:")):
        return False
    if lowered.startswith(("http://", "https://")):
        return True
    if lowered.startswith("/") and not lowered.startswith("//"):
        return True
    return False


def render_markdown(text: str, policy: Policy | None = None) -> str:
    """Return HTML for a safe subset. Images follow the policy."""
    policy = policy or Policy()
    out: list[str] = []
    cursor = 0
    for match in _TOKEN.finditer(text):
        out.append(_escape(text[cursor : match.start()]))
        cursor = match.end()
        image = match.group(0).startswith("!")
        if image:
            alt, url = match.group(1), match.group(2)
            if not _safe_url(url):
                out.append(_escape(alt or url))
                continue
            if policy.images == "show":
                out.append(f'<img alt="{_escape(alt)}" src="{_escape(url)}">')
            elif policy.links:
                label = alt or url
                out.append(f'<a href="{_escape(url)}">{_escape(label)}</a>')
            else:
                out.append(_escape(alt or url))
        else:
            label, url = match.group(3), match.group(4)
            if policy.links and _safe_url(url):
                out.append(f'<a href="{_escape(url)}">{_escape(label)}</a>')
            else:
                out.append(_escape(label))
    out.append(_escape(text[cursor:]))
    return "".join(out)
