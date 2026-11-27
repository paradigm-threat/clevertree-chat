"""Enqueue + drain channel media ASR jobs from [[mp:media]] / Bunny URLs.

Jobs live under var/clevertree-live/queue/channel_asr/ (ephemeral PVC, not git).
Provider ASR prefers **Groq Whisper** (``GROQ_API_KEY``); on rate-limit / missing key,
falls through to **AWS** audio when ``CLEVERTREE_ASR_S3_BUCKET`` + AWS credentials
are set (Amazon Transcribe via S3 — Bedrock has no Whisper drop-in). Otherwise jobs
stay pending (or dry-run when ``CLEVERTREE_ASR_DRY_RUN=1``).
Transcripts post back in-channel — no tip mint.
"""

from __future__ import annotations

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

from clevertree_chat.channel_media import asr_eligible, extract_channel_media
from clevertree_chat.irc_log_cache import live_root

log = logging.getLogger("clevertree.channel_asr")

ReplyFn = Callable[[str, str, str], None]  # topic, body, nick


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def queue_dir() -> Path:
    path = live_root() / "queue" / "channel_asr"
    path.mkdir(parents=True, exist_ok=True)
    return path


def cache_dir() -> Path:
    path = live_root() / "cache" / "channel_asr"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _enabled() -> bool:
    raw = (os.environ.get("CLEVERTREE_CHANNEL_ASR") or "1").strip().lower()
    return raw not in {"0", "false", "off", "no"}


def _url_fingerprint(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]


def _already_queued(url: str) -> bool:
    fp = _url_fingerprint(url)
    for path in queue_dir().glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if _url_fingerprint(str(data.get("url") or "")) == fp:
            status = str(data.get("status") or "pending")
            if status in {"pending", "leased", "done", "dry-run"}:
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
    """Detect media markers / Bunny URLs and enqueue ASR jobs. No tip mint."""
    if not _enabled():
        return []
    # SI transcript replies and bot echoes never re-enqueue.
    src = (source or "").strip().lower()
    if src in {"si", "asr", "bot"}:
        return []
    items = [i for i in extract_channel_media(body) if asr_eligible(i)]
    jobs: list[dict[str, Any]] = []
    for item in items:
        url = str(item["url"])
        if _already_queued(url):
            continue
        job_id = str(uuidlib.uuid4())
        job = {
            "id": job_id,
            "site": "myproblem",
            "kind": "channel_asr",
            "topic": (topic or "").strip().lower() or "mp-general",
            "channel": item.get("channel") or f"#{topic}",
            "media_kind": item.get("kind") or "audio",
            "url": url,
            "visitor": (visitor or "").strip(),
            "nick": (nick or "").strip(),
            "source": (source or "web").strip() or "web",
            "enqueued_at": _utc_now(),
            "status": "pending",
            "marker_source": item.get("source") or "marker",
        }
        path = queue_dir() / f"{job_id}.json"
        path.write_text(json.dumps(job, indent=2) + "\n", encoding="utf-8")
        job["_job_path"] = str(path)
        jobs.append(job)
        log.info("enqueued channel_asr %s kind=%s topic=%s", job_id, job["media_kind"], job["topic"])
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


def _download(url: str, dest: Path, *, max_bytes: int = 25_000_000) -> Path:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "clevertree-channel-asr/1.0"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise RuntimeError("media_too_large")
    dest.write_bytes(data)
    return dest


def _suffix_for_url(url: str) -> str:
    path = urlparse(url).path
    _, _, ext = path.rpartition(".")
    if ext and len(ext) <= 5 and ext.isalnum():
        return "." + ext.lower()
    return ".webm"


def _transcribe_groq(path: Path) -> dict[str, str]:
    api_key = (os.environ.get("GROQ_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("missing_GROQ_API_KEY")
    model = (os.environ.get("GROQ_WHISPER_MODEL") or "whisper-large-v3-turbo").strip()
    boundary = f"----clevertree{uuidlib.uuid4().hex}"
    filename = path.name
    file_bytes = path.read_bytes()
    parts: list[bytes] = []
    for name, value in (("model", model), ("language", "en"), ("response_format", "json")):
        parts.append(
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
                f"{value}\r\n"
            ).encode()
        )
    parts.append(
        (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
            f"Content-Type: application/octet-stream\r\n\r\n"
        ).encode()
        + file_bytes
        + b"\r\n"
    )
    parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(parts)
    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/audio/transcriptions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            # Cloudflare 1010 without UA from datacenter IPs
            "User-Agent": "clevertree-chat/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    text = str(payload.get("text") or "").strip()
    return {"text": text, "model": model, "provider": "groq"}


def _aws_asr_ready() -> bool:
    bucket = (os.environ.get("CLEVERTREE_ASR_S3_BUCKET") or "").strip()
    if not bucket:
        return False
    try:
        from clevertree_chat.providers import bedrock_configured

        return bedrock_configured()
    except Exception:
        return False


def _transcribe_aws(path: Path) -> dict[str, str]:
    """Amazon Transcribe via S3 (AWS audio path; Bedrock has no Whisper equivalent).

    Requires ``CLEVERTREE_ASR_S3_BUCKET`` and the same AWS keys as text Bedrock SI.
    Uses boto3 when installed; otherwise raises a clear configuration error.
    """
    bucket = (os.environ.get("CLEVERTREE_ASR_S3_BUCKET") or "").strip()
    if not bucket:
        raise RuntimeError("missing_CLEVERTREE_ASR_S3_BUCKET")
    try:
        from clevertree_chat.providers import bedrock_configured, bedrock_region

        if not bedrock_configured():
            raise RuntimeError("missing_AWS_credentials")
        region = bedrock_region()
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError(f"aws_asr_providers:{exc}") from exc

    try:
        import boto3  # type: ignore
    except ImportError as exc:
        raise RuntimeError("aws_asr_needs_boto3") from exc

    import time

    key = f"channel-asr/{uuidlib.uuid4().hex}{path.suffix or '.webm'}"
    s3 = boto3.client("s3", region_name=region)
    s3.upload_file(str(path), bucket, key)
    media_uri = f"s3://{bucket}/{key}"
    job_name = f"ct-asr-{uuidlib.uuid4().hex[:16]}"
    transcribe = boto3.client("transcribe", region_name=region)
    lang = (os.environ.get("CLEVERTREE_ASR_LANG") or "en-US").strip()
    transcribe.start_transcription_job(
        TranscriptionJobName=job_name,
        Media={"MediaFileUri": media_uri},
        MediaFormat=(path.suffix.lstrip(".") or "webm")[:10],
        LanguageCode=lang,
    )
    deadline = time.time() + float(os.environ.get("CLEVERTREE_ASR_AWS_TIMEOUT_S") or "120")
    while time.time() < deadline:
        desc = transcribe.get_transcription_job(TranscriptionJobName=job_name)
        status = desc["TranscriptionJob"]["TranscriptionJobStatus"]
        if status == "COMPLETED":
            uri = desc["TranscriptionJob"]["Transcript"]["TranscriptFileUri"]
            with urllib.request.urlopen(uri, timeout=60) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            text = str(
                payload.get("results", {}).get("transcripts", [{}])[0].get("transcript") or ""
            ).strip()
            try:
                s3.delete_object(Bucket=bucket, Key=key)
            except Exception:
                pass
            return {"text": text, "model": f"aws-transcribe/{lang}", "provider": "aws"}
        if status == "FAILED":
            reason = desc["TranscriptionJob"].get("FailureReason") or "failed"
            raise RuntimeError(f"aws_transcribe_failed:{reason}")
        time.sleep(2.0)
    raise RuntimeError("aws_transcribe_timeout")


def _transcribe_media(path: Path) -> dict[str, str]:
    """Groq Whisper first; AWS Transcribe when Groq unavailable or rate-limited."""
    groq_err: Exception | None = None
    try:
        return _transcribe_groq(path)
    except urllib.error.HTTPError as exc:
        if exc.code != 429:
            raise
        groq_err = exc
        log.warning("channel_asr Groq 429 — trying AWS ASR failover")
    except RuntimeError as exc:
        if "missing_GROQ_API_KEY" not in str(exc):
            raise
        groq_err = exc
        log.info("channel_asr no Groq key — trying AWS ASR failover")

    if not _aws_asr_ready():
        if groq_err is not None:
            raise groq_err
        raise RuntimeError("no_asr_provider")
    return _transcribe_aws(path)


def _format_reply(job: dict[str, Any], text: str, model: str) -> str:
    kind = job.get("media_kind") or "audio"
    label = "voice" if kind == "audio" else kind
    preview = (text or "").strip()
    if not preview:
        preview = "(no speech detected)"
    if len(preview) > 1500:
        preview = preview[:1497] + "…"
    return f"SI transcript ({label}, {model}): {preview}"


def process_job(job: dict[str, Any], *, reply: ReplyFn | None = None) -> dict[str, Any]:
    """Run one channel_asr job. Returns result dict; updates job file status."""
    job_path = job.get("_job_path")
    if not job_path:
        return {"ok": False, "reason": "no_job_path"}
    url = str(job.get("url") or "")
    topic = str(job.get("topic") or "mp-general")
    kind = str(job.get("media_kind") or "audio")
    if kind == "file":
        mark_job(job_path, "skipped", reason="not_audio")
        return {"ok": True, "skipped": True, "reason": "not_audio"}

    api_key = (os.environ.get("GROQ_API_KEY") or "").strip()
    dry = (os.environ.get("CLEVERTREE_ASR_DRY_RUN") or "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    aws_ready = _aws_asr_ready()
    if not api_key and not aws_ready and not dry:
        # Leave pending for a later drain when keys exist.
        return {"ok": False, "reason": "awaiting_asr_provider", "pending": True}

    # Soft Free-tier gate (ahead of Groq 20 RPM / 2K RPD hard caps).
    if api_key and not dry:
        try:
            from clevertree_chat import quota

            soft = quota.check_asr()
            if not soft.get("ok") and not aws_ready:
                log.info(
                    "channel_asr %s soft-capped (%s) — left pending",
                    job.get("id"),
                    soft.get("reason"),
                )
                return {
                    "ok": False,
                    "id": job.get("id"),
                    "reason": soft.get("reason") or "asr_soft_cap",
                    "pending": True,
                }
        except Exception:
            pass

    mark_job(job_path, "leased")
    tmp: Path | None = None
    try:
        if dry and not api_key and not aws_ready:
            text = f"[dry-run] would transcribe {url}"
            model = "dry-run"
            status = "dry-run"
        else:
            suffix = _suffix_for_url(url)
            tmp = Path(tempfile.mkstemp(prefix="channel-asr-", suffix=suffix, dir=cache_dir())[1])
            _download(url, tmp)
            result = _transcribe_media(tmp)
            text = result["text"]
            model = result["model"]
            status = "done"
            if result.get("provider") == "groq":
                try:
                    from clevertree_chat import quota

                    quota.consume_asr()
                except Exception:
                    pass

        reply_body = _format_reply(job, text, model)
        if reply is not None:
            try:
                reply(topic, reply_body, "clevertree-si")
            except Exception as exc:
                log.warning("channel_asr reply failed: %s", exc)

        mark_job(
            job_path,
            status,
            transcript=text,
            model=model,
            reply_body=reply_body,
        )
        return {
            "ok": True,
            "id": job.get("id"),
            "status": status,
            "model": model,
            "text_preview": text[:120],
        }
    except urllib.error.HTTPError as exc:
        msg = f"http_{exc.code}"
        # Rate-limit without AWS failover: leave pending. Other HTTP → error.
        if exc.code == 429 and not aws_ready:
            import time

            body = ""
            try:
                body = exc.read().decode("utf-8", "replace")
            except Exception:
                body = ""
            try:
                from clevertree_chat.providers import parse_retry_after_s

                wait = parse_retry_after_s(body, default=20.0)
            except Exception:
                wait = 20.0
            mark_job(
                job_path,
                "pending",
                error=msg,
                last_error_at=_utc_now(),
                not_before=time.time() + wait,
            )
            log.warning(
                "channel_asr %s rate-limited by Groq — left pending %.1fs",
                job.get("id"),
                wait,
            )
            return {
                "ok": False,
                "id": job.get("id"),
                "reason": msg,
                "pending": True,
                "retry_after_s": wait,
            }
        mark_job(job_path, "error", error=msg)
        return {"ok": False, "id": job.get("id"), "reason": msg}
    except Exception as exc:
        msg = str(exc)[:200]
        mark_job(job_path, "error", error=msg)
        return {"ok": False, "id": job.get("id"), "reason": msg}
    finally:
        if tmp is not None:
            try:
                tmp.unlink(missing_ok=True)
            except Exception:
                pass


def process_pending(*, limit: int = 5, reply: ReplyFn | None = None) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for job in list_pending_jobs()[:limit]:
        results.append(process_job(job, reply=reply))
        if results[-1].get("pending"):
            # No provider key — stop burning the loop.
            break
    return results


def default_channel_reply(topic: str, body: str, nick: str = "clevertree-si") -> None:
    """Post a chat line into WS history + IRC without minting a tip / debate comment."""
    from clevertree_chat import irc_log_cache
    from clevertree_chat.chat_hub import HUB
    from clevertree_chat.live_runtime import view_topic

    visitor = str(uuidlib.uuid5(uuidlib.NAMESPACE_URL, f"clevertree-si:{topic}"))
    irc_log_cache.append_line(
        topic,
        body=body,
        visitor=visitor,
        source="si",
        nick=nick,
    )
    view = view_topic(topic, visitor)
    HUB.broadcast(
        topic,
        {
            "type": "post.live",
            "topic": topic,
            "comment": {
                "id": "",
                "author": nick,
                "author_uuid": visitor,
                "body": body,
                "keys": [],
                "starting": "other",
                "placed": False,
                "mine": False,
                "injected": True,
                "kind": "si_transcript",
            },
            "view": view,
            "chat_line": {
                "ts": _utc_now(),
                "topic": topic,
                "visitor": visitor,
                "nick": nick,
                "body": body,
                "source": "si",
            },
        },
    )
    try:
        from clevertree_chat.irc_bridge import get_bridge

        bridge = get_bridge()
        if bridge is not None:
            bridge.announce_submit(topic, body, nick)
    except Exception:
        pass
