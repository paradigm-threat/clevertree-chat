"""Parse MyProblem public-room media markers for ASR / VL enqueue.

Markers look like:
  [[mp:media kind=audio url=https://…/inbox/chat/…/….webm channel=#mp-general]]
  [[mp:inbox id=… kind=chat url=https://…/inbox/…]]

Also accepts bare Bunny `inbox/` / legacy `chat-public/` URLs when no marker is present.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

MARKER_RE = re.compile(r"\[\[mp:media\s+([^\]]+)\]\]", re.IGNORECASE)
INBOX_MARKER_RE = re.compile(r"\[\[mp:inbox\s+([^\]]+)\]\]", re.IGNORECASE)
ATTR_RE = re.compile(r"(\w+)=([^\s\]]+)")
URL_RE = re.compile(r"https?://[^\s<>\"']+", re.IGNORECASE)
BUNNY_HINT = re.compile(r"b-cdn\.net|bunnycdn|chat-public/|/inbox/", re.IGNORECASE)
AUDIO_EXT = {".webm", ".wav", ".mp3", ".m4a", ".ogg", ".opus", ".flac", ".aac"}
VIDEO_EXT = {".mp4", ".mov", ".mkv", ".webm"}  # webm may be audio-only; kind wins
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"}
TEXT_EXT = {
    ".txt",
    ".md",
    ".markdown",
    ".csv",
    ".tsv",
    ".json",
    ".xml",
    ".yaml",
    ".yml",
    ".log",
    ".html",
    ".htm",
    ".css",
    ".js",
    ".ts",
    ".py",
    ".rs",
    ".go",
    ".sh",
}


def _attrs(blob: str) -> dict[str, str]:
    return {m.group(1).lower(): m.group(2).strip() for m in ATTR_RE.finditer(blob or "")}


def _guess_kind(url: str, explicit: str = "") -> str:
    kind = (explicit or "").strip().lower()
    if kind in {"audio", "video", "image", "pdf", "text", "file"}:
        return kind
    path = urlparse(url).path.lower()
    for ext in IMAGE_EXT:
        if path.endswith(ext):
            return "image"
    if path.endswith(".pdf"):
        return "pdf"
    for ext in TEXT_EXT:
        if path.endswith(ext):
            return "text"
    for ext in AUDIO_EXT:
        if path.endswith(ext) and ext != ".webm":
            return "audio"
    if path.endswith(".webm"):
        return "audio"  # speak notes are webm; video markers set kind=video
    for ext in VIDEO_EXT:
        if path.endswith(ext):
            return "video"
    return "file"


def parse_media_markers(body: str) -> list[dict[str, Any]]:
    """Return media dicts from [[mp:media …]] / [[mp:inbox …]] (deduped by url)."""
    text = body or ""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()

    def _add(match: re.Match[str], source: str) -> None:
        attrs = _attrs(match.group(1))
        url = (attrs.get("url") or "").strip().rstrip(".,);]")
        if not url or not url.startswith("http"):
            return
        if url in seen:
            return
        seen.add(url)
        kind = _guess_kind(url, attrs.get("kind") or "")
        channel = (attrs.get("channel") or "").strip()
        review = (attrs.get("review") or "pending").strip().lower()
        if review not in {"pending", "clear", "reject"}:
            review = "pending"
        sha = (attrs.get("sha") or "").strip()
        object_id = (attrs.get("id") or "").strip()
        out.append(
            {
                "kind": kind,
                "url": url,
                "channel": channel,
                "review": review,
                "sha": sha,
                "object_id": object_id,
                "raw": match.group(0),
                "source": source,
            }
        )

    for match in MARKER_RE.finditer(text):
        _add(match, "marker")
    for match in INBOX_MARKER_RE.finditer(text):
        _add(match, "inbox")
    return out


def extract_bunny_urls(body: str) -> list[str]:
    urls = URL_RE.findall(body or "")
    return list(dict.fromkeys(u.rstrip(".,);]") for u in urls if BUNNY_HINT.search(u)))


def extract_channel_media(body: str) -> list[dict[str, Any]]:
    """Markers first; then bare Bunny chat-public URLs not already covered."""
    items = parse_media_markers(body)
    seen = {i["url"] for i in items}
    for url in extract_bunny_urls(body):
        if url in seen:
            continue
        seen.add(url)
        items.append(
            {
                "kind": _guess_kind(url),
                "url": url,
                "channel": "",
                "review": "pending",
                "sha": "",
                "raw": url,
                "source": "url",
            }
        )
    return items


def extract_inbox_refs(body: str) -> list[str]:
    """Object ids / urls from [[mp:inbox …]] for claim.inbox_refs (deduped, stable order)."""
    refs: list[str] = []
    seen: set[str] = set()
    for match in INBOX_MARKER_RE.finditer(body or ""):
        attrs = _attrs(match.group(1))
        oid = (attrs.get("id") or "").strip()
        url = (attrs.get("url") or "").strip().rstrip(".,);]")
        for candidate in (oid, url):
            if candidate and candidate not in seen:
                seen.add(candidate)
                refs.append(candidate)
    return refs


def asr_eligible(item: dict[str, Any]) -> bool:
    """Audio (and audio-bearing video notes) are ASR candidates; plain files are not."""
    kind = str(item.get("kind") or "")
    return kind in {"audio", "video"}


def visual_cover_eligible(item: dict[str, Any]) -> bool:
    """Images and videos start covered until review clears."""
    kind = str(item.get("kind") or "")
    return kind in {"image", "video"}
