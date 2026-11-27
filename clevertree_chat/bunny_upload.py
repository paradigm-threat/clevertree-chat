"""Server-side Bunny Storage upload for public chat media.

Uses zone password (BUNNY_STORAGE_API_KEY). Key never leaves the server.
"""

from __future__ import annotations

import hashlib
import os
import re
import time
import urllib.error
import urllib.request
from collections import defaultdict, deque
from typing import Any

from clevertree_chat.media_allowlist import MAX_BYTES, classify_upload

# Soft per-IP rate limit for uploads
_UPLOAD_HITS: dict[str, deque[float]] = defaultdict(deque)
_UPLOAD_WINDOW_S = 60.0
_UPLOAD_MAX_PER_WINDOW = 20


def bunny_configured() -> bool:
    return bool((os.environ.get("BUNNY_STORAGE_API_KEY") or "").strip())


def bunny_settings() -> dict[str, str]:
    key = (os.environ.get("BUNNY_STORAGE_API_KEY") or "").strip()
    zone = (os.environ.get("BUNNY_STORAGE_ZONE") or "myproblem-stills").strip()
    host = (os.environ.get("BUNNY_STORAGE_HOST") or "storage.bunnycdn.com").strip()
    cdn = (
        (os.environ.get("BUNNY_CDN_BASE") or "https://myproblem-stills.b-cdn.net")
        .strip()
        .rstrip("/")
    )
    return {"key": key, "zone": zone, "host": host, "cdn": cdn}


def channel_slug(channel: str) -> str:
    raw = (channel or "").strip().lstrip("#").lower()
    raw = re.sub(r"[^a-z0-9._-]+", "-", raw).strip("-._")
    return raw[:64] or "web"


def check_rate_limit(ip: str) -> bool:
    """Return True if allowed, False if over limit."""
    now = time.time()
    key = (ip or "unknown").strip() or "unknown"
    q = _UPLOAD_HITS[key]
    while q and now - q[0] > _UPLOAD_WINDOW_S:
        q.popleft()
    if len(q) >= _UPLOAD_MAX_PER_WINDOW:
        return False
    q.append(now)
    return True


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def put_bytes(
    data: bytes,
    *,
    bunny_path: str,
    content_type: str,
) -> dict[str, Any]:
    cfg = bunny_settings()
    if not cfg["key"]:
        return {"ok": False, "error": "bunny_not_configured"}
    url = f"https://{cfg['host']}/{cfg['zone']}/{bunny_path.lstrip('/')}"
    req = urllib.request.Request(
        url,
        data=data,
        method="PUT",
        headers={
            "AccessKey": cfg["key"],
            "Content-Type": content_type or "application/octet-stream",
            "User-Agent": "clevertree-chat/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            status = getattr(resp, "status", 200) or 200
    except urllib.error.HTTPError as exc:
        return {"ok": False, "error": f"bunny_upload_{exc.code}"}
    except Exception as exc:
        return {"ok": False, "error": f"bunny_upload_error:{exc}"}
    if status not in {200, 201}:
        return {"ok": False, "error": f"bunny_upload_{status}"}
    cdn_url = f"{cfg['cdn']}/{bunny_path.lstrip('/')}"
    return {"ok": True, "url": cdn_url, "path": bunny_path, "status": status}


def upload_file(
    data: bytes,
    *,
    filename: str,
    content_type: str,
    channel: str,
    kind: str = "",
    client_ip: str = "",
) -> dict[str, Any]:
    """Validate + PUT to ``chat-public/<channel>/<sha>.<ext>``."""
    if len(data) > MAX_BYTES:
        return {"ok": False, "error": "file_too_large", "max_bytes": MAX_BYTES}
    if client_ip and not check_rate_limit(client_ip):
        return {"ok": False, "error": "rate_limited"}

    classified = classify_upload(
        filename=filename,
        content_type=content_type,
        data=data,
        declared_kind=kind,
    )
    if not classified.get("ok"):
        return classified

    slug = channel_slug(channel)
    sha = sha256_hex(data)
    ext = str(classified["ext"])
    bunny_path = f"chat-public/{slug}/{sha}.{ext}"
    put = put_bytes(data, bunny_path=bunny_path, content_type=str(classified["mime"]))
    if not put.get("ok"):
        return put
    return {
        "ok": True,
        "url": put["url"],
        "path": bunny_path,
        "sha256": sha,
        "kind": classified["kind"],
        "mime": classified["mime"],
        "channel": f"#{slug}" if not (channel or "").startswith("#") else (channel or f"#{slug}"),
        "review": "pending",
        "max_bytes": MAX_BYTES,
    }


def format_media_marker(
    *,
    kind: str,
    url: str,
    channel: str,
    review: str = "pending",
    sha256: str = "",
) -> str:
    ch = (channel or "").strip() or "#web"
    if not ch.startswith("#"):
        ch = "#" + ch
    parts = [f"kind={kind}", f"url={url}", f"channel={ch}", f"review={review or 'pending'}"]
    if sha256:
        parts.append(f"sha={sha256[:64]}")
    return "[[mp:media " + " ".join(parts) + "]]"
