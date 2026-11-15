"""Cite-and-fetch live web pages for batch investigation.

Phase rule: record the URL always; fetch when egress works. Never invent page
bodies. Soft-fail on blocks / timeouts so the curator can still cite the URL.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from html import unescape
from typing import Any

DEFAULT_UA = (
    "ClevertreeChatBot/0.1 (+https://clevertree.chat/dev; research; cite-only)"
)
_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)


@dataclass
class FetchResult:
    url: str
    ok: bool
    status: int | None = None
    title: str = ""
    excerpt: str = ""
    error: str = ""
    blocked: bool = False

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def fetch_enabled() -> bool:
    return os.environ.get("CLEVERTREE_FETCH", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def fetch_url(url: str, *, timeout: float = 12.0, max_bytes: int = 200_000) -> FetchResult:
    """GET a public URL. Returns structured soft-fail result; never raises."""
    href = (url or "").strip()
    if not href.startswith("http://") and not href.startswith("https://"):
        return FetchResult(url=href, ok=False, error="unsupported scheme")
    req = urllib.request.Request(
        href,
        headers={
            "User-Agent": os.environ.get("CLEVERTREE_FETCH_UA", DEFAULT_UA),
            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status = getattr(resp, "status", None) or resp.getcode()
            raw = resp.read(max_bytes)
            charset = "utf-8"
            ctype = resp.headers.get("Content-Type") or ""
            if "charset=" in ctype.lower():
                charset = ctype.lower().split("charset=", 1)[1].split(";")[0].strip() or "utf-8"
            text = raw.decode(charset, errors="replace")
            title = ""
            m = _TITLE_RE.search(text)
            if m:
                title = unescape(re.sub(r"\s+", " ", m.group(1))).strip()[:200]
            excerpt = unescape(re.sub(r"<[^>]+>", " ", text))
            excerpt = re.sub(r"\s+", " ", excerpt).strip()[:400]
            blocked = status in {401, 403, 429, 503} or _looks_blocked(title, excerpt)
            return FetchResult(
                url=href,
                ok=200 <= int(status) < 400 and not blocked,
                status=int(status),
                title=title,
                excerpt=excerpt,
                blocked=blocked,
                error="blocked" if blocked else "",
            )
    except urllib.error.HTTPError as exc:
        blocked = exc.code in {401, 403, 429, 503}
        return FetchResult(
            url=href,
            ok=False,
            status=exc.code,
            error=f"http {exc.code}",
            blocked=blocked,
        )
    except Exception as exc:
        return FetchResult(url=href, ok=False, error=type(exc).__name__ + ": " + str(exc)[:160])


def _looks_blocked(title: str, excerpt: str) -> bool:
    hay = f"{title} {excerpt}".lower()
    needles = (
        "access denied",
        "captcha",
        "cf-browser-verification",
        "attention required",
        "just a moment",
        "enable javascript",
        "unusual traffic",
    )
    return any(n in hay for n in needles)


def probe_egress(urls: list[str] | None = None) -> dict[str, Any]:
    """One-shot egress / anti-bot sample for ops."""
    targets = urls or [
        "https://example.com/",
        "https://api.github.com/zen",
        "https://www.congress.gov/",
    ]
    rows = [fetch_url(u).as_dict() for u in targets]
    return {
        "fetch_enabled": fetch_enabled(),
        "results": rows,
        "ok_count": sum(1 for r in rows if r.get("ok")),
        "blocked_count": sum(1 for r in rows if r.get("blocked")),
    }


def dump_probe(path: str, payload: dict[str, Any]) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, sort_keys=True)
        fh.write("\n")
