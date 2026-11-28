"""Enqueue + drain channel media review (cover until AI clear).

Jobs under var/clevertree-live/queue/channel_media_review/.
Status map: var/clevertree-live/media-review/<sha>.json
Images/GIFs: Groq vision. Video: best-effort (same VL when downloadable as image
poster; otherwise pending until dry-run / later). Audio/PDF/text: auto-clear
(no visual cover required).
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import tempfile
import urllib.error
import urllib.request
import uuid as uuidlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

from clevertree_chat.channel_media import extract_channel_media
from clevertree_chat.irc_log_cache import live_root

log = logging.getLogger("clevertree.channel_media_review")

BroadcastFn = Callable[[str, dict[str, Any]], None]


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def queue_dir() -> Path:
    path = live_root() / "queue" / "channel_media_review"
    path.mkdir(parents=True, exist_ok=True)
    return path


def review_dir() -> Path:
    path = live_root() / "media-review"
    path.mkdir(parents=True, exist_ok=True)
    return path


def cache_dir() -> Path:
    path = live_root() / "cache" / "channel_media_review"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _enabled() -> bool:
    raw = (os.environ.get("CLEVERTREE_CHANNEL_MEDIA_REVIEW") or "1").strip().lower()
    return raw not in {"0", "false", "off", "no"}


def _url_fingerprint(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]


def sha_for_url(url: str, explicit: str = "") -> str:
    explicit = (explicit or "").strip()
    if explicit and len(explicit) >= 16:
        return explicit[:64]
    # Prefer path stem when content-addressed (.../sha.ext)
    path = urlparse(url).path
    name = path.rsplit("/", 1)[-1]
    stem = name.rsplit(".", 1)[0] if "." in name else name
    if len(stem) >= 32 and all(c in "0123456789abcdef" for c in stem.lower()):
        return stem.lower()
    return hashlib.sha256(url.encode("utf-8")).hexdigest()


def read_review(sha: str) -> dict[str, Any] | None:
    path = review_dir() / f"{sha}.json"
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def write_review(sha: str, data: dict[str, Any]) -> Path:
    path = review_dir() / f"{sha}.json"
    payload = dict(data)
    payload["sha"] = sha
    payload["updated_at"] = _utc_now()
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return path


def get_review_status(url: str, *, sha: str = "", marker_review: str = "") -> str:
    """Resolve effective review status for a media URL."""
    explicit = (marker_review or "").strip().lower()
    if explicit in {"clear", "reject", "pending"}:
        # Host map wins when present (SI may clear after marker said pending)
        pass
    sid = sha_for_url(url, sha)
    stored = read_review(sid)
    if stored:
        st = str(stored.get("status") or "").lower()
        if st in {"clear", "reject", "pending"}:
            return st
    if explicit in {"clear", "reject", "pending"}:
        return explicit
    return "pending"


def _already_queued(url: str) -> bool:
    fp = _url_fingerprint(url)
    for path in queue_dir().glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if _url_fingerprint(str(data.get("url") or "")) == fp:
            status = str(data.get("status") or "pending")
            if status in {"pending", "leased", "done", "dry-run", "skipped"}:
                return True
    return False


def enqueue_from_body(
    topic: str,
    body: str,
    *,
    visitor: str = "",
    source: str = "web",
    nick: str = "",
) -> list[dict[str, Any]]:
    if not _enabled():
        return []
    src = (source or "").strip().lower()
    if src in {"si", "asr", "bot", "review"}:
        return []
    items = extract_channel_media(body)
    jobs: list[dict[str, Any]] = []
    for item in items:
        url = str(item["url"])
        kind = str(item.get("kind") or "file")
        sha = sha_for_url(url, str(item.get("sha") or ""))
        # Seed pending map
        if not read_review(sha):
            write_review(
                sha,
                {
                    "status": str(item.get("review") or "pending"),
                    "url": url,
                    "kind": kind,
                    "topic": (topic or "").strip().lower(),
                    "channel": item.get("channel") or f"#{topic}",
                },
            )
        # Non-visual: auto-clear (nothing auto-shown)
        if kind in {"audio", "pdf", "text", "file"}:
            write_review(
                sha,
                {
                    "status": "clear",
                    "url": url,
                    "kind": kind,
                    "topic": (topic or "").strip().lower(),
                    "channel": item.get("channel") or f"#{topic}",
                    "reason": "non_visual_auto_clear",
                },
            )
            continue
        if _already_queued(url):
            continue
        job_id = str(uuidlib.uuid4())
        job = {
            "id": job_id,
            "kind": "channel_media_review",
            "topic": (topic or "").strip().lower() or "web",
            "channel": item.get("channel") or f"#{topic}",
            "media_kind": kind,
            "url": url,
            "sha": sha,
            "visitor": (visitor or "").strip(),
            "nick": (nick or "").strip(),
            "source": (source or "web").strip() or "web",
            "enqueued_at": _utc_now(),
            "status": "pending",
        }
        path = queue_dir() / f"{job_id}.json"
        path.write_text(json.dumps(job, indent=2) + "\n", encoding="utf-8")
        job["_job_path"] = str(path)
        jobs.append(job)
        log.info("enqueued media_review %s kind=%s topic=%s", job_id, kind, job["topic"])
    return jobs


def list_pending_jobs(*, now: float | None = None) -> list[dict[str, Any]]:
    import time

    ts = time.time() if now is None else now
    jobs = []
    for path in sorted(queue_dir().glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if str(data.get("status") or "pending") != "pending":
            continue
        not_before = data.get("not_before")
        if isinstance(not_before, (int, float)) and float(not_before) > ts:
            continue
        data["_job_path"] = str(path)
        jobs.append(data)
    return jobs


def mark_job(job_path: str | Path, status: str, **extra: Any) -> None:
    path = Path(job_path)
    if not path.is_file():
        return
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return
    data["status"] = status
    data.update(extra)
    if status in {"done", "dry-run", "error", "skipped"}:
        data["finished_at"] = _utc_now()
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def _download(url: str, dest: Path, *, max_bytes: int = 12_000_000) -> Path:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "clevertree-media-review/1.0"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise RuntimeError("media_too_large")
    dest.write_bytes(data)
    return dest


def _peek_image_header(url: str, *, max_bytes: int = 65536) -> bytes:
    """Fetch only the start of an image (Range) for dimension sniffing."""
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "clevertree-media-review/1.0",
            "Range": f"bytes=0-{max_bytes - 1}",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read(max_bytes)
    except Exception:
        # Some CDNs ignore Range — fall back to a short full GET capped.
        req2 = urllib.request.Request(
            url,
            headers={"User-Agent": "clevertree-media-review/1.0"},
            method="GET",
        )
        with urllib.request.urlopen(req2, timeout=30) as resp:
            return resp.read(max_bytes)


def _suffix_for_url(url: str) -> str:
    path = urlparse(url).path
    _, _, ext = path.rpartition(".")
    if ext and len(ext) <= 5 and ext.isalnum():
        return "." + ext.lower()
    return ".bin"


DEFAULT_VISION_MODEL = "qwen/qwen3.8-27b"


def vision_model() -> str:
    return (os.environ.get("GROQ_VISION_MODEL") or DEFAULT_VISION_MODEL).strip()


def _png_wh(data: bytes) -> tuple[int, int] | None:
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    import struct

    try:
        return struct.unpack(">II", data[16:24])
    except Exception:
        return None


def _jpeg_wh(data: bytes) -> tuple[int, int] | None:
    # Minimal SOF scan
    if len(data) < 4 or data[:2] != b"\xff\xd8":
        return None
    i = 2
    while i + 9 < len(data):
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in {0xC0, 0xC1, 0xC2}:
            # SOF: length(2) precision(1) height(2) width(2)
            h = (data[i + 5] << 8) | data[i + 6]
            w = (data[i + 7] << 8) | data[i + 8]
            return w, h
        if marker == 0xD9:
            break
        if marker == 0x01 or (0xD0 <= marker <= 0xD9):
            i += 2
            continue
        seglen = (data[i + 2] << 8) | data[i + 3]
        i += 2 + seglen
    return None


def _image_too_small(path: Path) -> bool:
    """Groq vision requires ≥32px in each dimension."""
    try:
        data = path.read_bytes()[:65536]
    except Exception:
        return False
    wh = _png_wh(data) or _jpeg_wh(data)
    if not wh:
        return False
    w, h = wh
    return w < 32 or h < 32


def _vision_groq(
    path: Path,
    *,
    media_kind: str,
    public_url: str = "",
) -> dict[str, Any]:
    api_key = (os.environ.get("GROQ_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("missing_GROQ_API_KEY")
    model = vision_model()
    if _image_too_small(path):
        # Not enough pixels for VL — treat as clear (cannot carry visual harm).
        return {
            "status": "clear",
            "reason": "image_below_vl_min_size",
            "model": model,
            "metered": False,
        }

    # Prefer public CDN URL (cheaper than base64) when it looks like ours.
    image_url = ""
    pub = (public_url or "").strip()
    if pub.startswith("https://") and (
        "b-cdn.net" in pub
        or "bunnycdn" in pub
        or "chat-public/" in pub
        or "/inbox/" in pub
    ):
        image_url = pub
    if not image_url:
        raw = path.read_bytes()
        mime = "image/jpeg"
        suf = path.suffix.lower()
        if suf == ".png":
            mime = "image/png"
        elif suf == ".gif":
            mime = "image/gif"
        elif suf == ".webp":
            mime = "image/webp"
        elif suf == ".avif":
            mime = "image/avif"
        image_url = f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"

    prompt = (
        "You moderate a public IRC debate room. Decide if this "
        f"{media_kind} is appropriate to show uncovered to a general audience "
        "(no illegal content, no graphic sexual content, no extreme gore). "
        'Reply ONLY with JSON: {"status":"clear"|"reject","reason":"short"}.'
    )
    body = {
        "model": model,
        "temperature": 0,
        "max_completion_tokens": 200,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": image_url}},
                ],
            }
        ],
    }
    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "clevertree-chat/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    choices = payload.get("choices") or []
    if not choices:
        raise RuntimeError("groq_empty_choices")
    content = ((choices[0].get("message") or {}).get("content") or "").strip()
    try:
        parsed = json.loads(content)
    except Exception:
        lower = content.lower()
        if "reject" in lower:
            return {
                "status": "reject",
                "reason": content[:200],
                "model": model,
                "metered": True,
            }
        return {
            "status": "clear",
            "reason": content[:200],
            "model": model,
            "metered": True,
        }
    status = str(parsed.get("status") or "pending").lower()
    if status not in {"clear", "reject"}:
        status = "pending"
    return {
        "status": status,
        "reason": str(parsed.get("reason") or "")[:400],
        "model": model,
        "metered": True,
    }


def _extract_video_poster(path: Path) -> Path | None:
    """Best-effort first frame via ffmpeg; None if unavailable."""
    import shutil
    import subprocess

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return None
    out = path.with_suffix(".poster.jpg")
    try:
        subprocess.run(
            [
                ffmpeg,
                "-y",
                "-i",
                str(path),
                "-frames:v",
                "1",
                "-q:v",
                "3",
                str(out),
            ],
            check=True,
            capture_output=True,
            timeout=60,
        )
    except Exception:
        return None
    if out.is_file() and out.stat().st_size > 0:
        return out
    return None


def process_job(
    job: dict[str, Any],
    *,
    broadcast: BroadcastFn | None = None,
) -> dict[str, Any]:
    job_path = job.get("_job_path")
    if not job_path:
        return {"ok": False, "reason": "no_job_path"}
    url = str(job.get("url") or "")
    topic = str(job.get("topic") or "web")
    kind = str(job.get("media_kind") or "image")
    sha = str(job.get("sha") or sha_for_url(url))

    api_key = (os.environ.get("GROQ_API_KEY") or "").strip()
    dry = (os.environ.get("CLEVERTREE_MEDIA_REVIEW_DRY_RUN") or "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    # Only fall back to ASR dry-run when no Groq key (staging without providers).
    if not dry and not api_key:
        asr_dry = (os.environ.get("CLEVERTREE_ASR_DRY_RUN") or "").strip().lower() in {
            "1",
            "true",
            "yes",
            "on",
        }
        if asr_dry:
            dry = True

    if kind not in {"image", "video"}:
        write_review(
            sha,
            {
                "status": "clear",
                "url": url,
                "kind": kind,
                "topic": topic,
                "reason": "non_visual",
            },
        )
        mark_job(job_path, "skipped", reason="non_visual")
        _broadcast_clear(broadcast, topic, sha, url, kind, "clear")
        return {"ok": True, "skipped": True}

    if not api_key and not dry:
        return {"ok": False, "reason": "awaiting_GROQ_API_KEY", "pending": True}

    def _finish(status: str, reason: str, model: str, job_status: str) -> dict[str, Any]:
        write_review(
            sha,
            {
                "status": status,
                "url": url,
                "kind": kind,
                "topic": topic,
                "reason": reason,
                "model": model,
            },
        )
        mark_job(job_path, job_status, review_status=status, reason=reason, model=model)
        _broadcast_clear(broadcast, topic, sha, url, kind, status, reason=reason)
        return {"ok": True, "status": status, "sha": sha, "id": job.get("id")}

    if dry:
        return _finish("clear", "dry-run auto-clear", "dry-run", "dry-run")

    # Soft Free-tier gate ahead of Groq ITPM hard caps.
    try:
        from clevertree_chat import quota

        soft = quota.check_vision()
        if not soft.get("ok"):
            import time

            retry = soft.get("retry_after_s")
            not_before = time.time() + float(retry or 30)
            mark_job(
                job_path,
                "pending",
                reason=soft.get("reason") or "vision_soft_cap",
                not_before=not_before,
            )
            return {
                "ok": False,
                "pending": True,
                "reason": soft.get("reason") or "vision_soft_cap",
                "retry_after_s": retry,
                "id": job.get("id"),
            }
    except Exception:
        pass

    mark_job(job_path, "leased")
    tmp: Path | None = None
    poster: Path | None = None
    try:
        # Still images: prefer CDN URL to Groq (no full download) after a header peek.
        if kind == "image" and url.startswith("https://"):
            header = _peek_image_header(url)
            tmp = Path(
                tempfile.mkstemp(
                    prefix="media-review-peek-",
                    suffix=_suffix_for_url(url),
                    dir=cache_dir(),
                )[1]
            )
            tmp.write_bytes(header)
            result = _vision_groq(tmp, media_kind=kind, public_url=url)
        else:
            suffix = _suffix_for_url(url)
            tmp = Path(
                tempfile.mkstemp(prefix="media-review-", suffix=suffix, dir=cache_dir())[1]
            )
            _download(url, tmp)
            vision_path = tmp
            if kind == "video":
                poster = _extract_video_poster(tmp)
                if poster is None:
                    mark_job(job_path, "pending", reason="awaiting_video_poster")
                    return {
                        "ok": False,
                        "pending": True,
                        "reason": "awaiting_video_poster",
                        "id": job.get("id"),
                    }
                vision_path = poster
            pub = url if kind == "image" and vision_path == tmp else ""
            result = _vision_groq(vision_path, media_kind=kind, public_url=pub)

        if result.get("metered"):
            try:
                from clevertree_chat import quota

                quota.consume_vision()
            except Exception:
                pass

        status = str(result.get("status") or "pending")
        reason = str(result.get("reason") or "")
        model = str(result.get("model") or "")
        if status == "pending":
            mark_job(job_path, "pending", reason="vision_inconclusive")
            return {"ok": False, "pending": True, "reason": "vision_inconclusive"}
        return _finish(status, reason, model, "done")
    except urllib.error.HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode("utf-8", "replace")
        except Exception:
            body = ""
        if exc.code == 429:
            import time

            from clevertree_chat.providers import parse_retry_after_s

            wait = parse_retry_after_s(body, default=20.0)
            try:
                from clevertree_chat import quota

                until = quota.set_vision_cooldown(wait)
                not_before = until
            except Exception:
                not_before = time.time() + wait
            mark_job(
                job_path,
                "pending",
                reason="groq_429",
                not_before=not_before,
                error=body[:300],
            )
            return {
                "ok": False,
                "pending": True,
                "reason": "groq_429",
                "retry_after_s": wait,
                "id": job.get("id"),
            }
        if exc.code == 400 and "at least 32 pixels" in body:
            return _finish("clear", "image_below_vl_min_size", vision_model(), "done")
        if exc.code in {400, 404} and (
            "model_not_found" in body
            or "decommissioned" in body
            or "does not exist" in body
        ):
            # No vision model on this Groq account — leave pending for batch/Cursor.
            mark_job(job_path, "pending", reason="no_vision_model", error=body[:300])
            return {"ok": False, "pending": True, "reason": "no_vision_model"}
        mark_job(job_path, "pending", reason=f"http_{exc.code}", error=body[:300] or str(exc)[:300])
        return {"ok": False, "pending": True, "error": str(exc)}
    except Exception as exc:
        mark_job(job_path, "pending", reason="review_error", error=str(exc)[:300])
        return {"ok": False, "pending": True, "error": str(exc)}
    finally:
        for p in (tmp, poster):
            if p is not None:
                try:
                    p.unlink(missing_ok=True)
                except Exception:
                    pass


def _broadcast_clear(
    broadcast: BroadcastFn | None,
    topic: str,
    sha: str,
    url: str,
    kind: str,
    status: str,
    reason: str = "",
) -> None:
    if broadcast is None:
        return
    try:
        broadcast(
            topic,
            {
                "type": "media.review",
                "topic": topic,
                "sha": sha,
                "url": url,
                "kind": kind,
                "status": status,
                "reason": reason,
            },
        )
    except Exception as exc:
        log.warning("media.review broadcast failed: %s", exc)


def process_pending(
    *,
    limit: int = 2,
    broadcast: BroadcastFn | None = None,
) -> list[dict[str, Any]]:
    results = []
    for job in list_pending_jobs()[:limit]:
        results.append(process_job(job, broadcast=broadcast))
        # Stop the slice on soft/hard rate pressure so we don't stampede Groq.
        if results[-1].get("pending") and results[-1].get("reason") in {
            "groq_429",
            "vision_cooldown",
            "vision_rpm_soft",
            "vision_daily_soft",
            "awaiting_GROQ_API_KEY",
        }:
            break
    return results


def default_broadcast(topic: str, payload: dict[str, Any]) -> None:
    from clevertree_chat.chat_hub import HUB

    HUB.broadcast(topic, payload)
