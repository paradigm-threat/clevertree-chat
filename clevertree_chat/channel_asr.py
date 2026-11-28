"""Enqueue + drain channel media ASR / video-analyze jobs from [[mp:media]].

Jobs live under var/clevertree-live/queue/channel_asr/ (ephemeral host disk, not git).

* **Audio** — priority 0; Groq Whisper (AWS Transcribe failover on 429 / missing key).
* **Video** — priority 10 + delayed ``not_before``; ffmpeg frame package → Groq VL
  describe + ffmpeg strip → Whisper; ASR-only fallback when VL unavailable.
* Soft Free-tier gates (``CLEVERTREE_ASR_SOFT_*``, ``CLEVERTREE_VISION_SOFT_*``).
* Soft-cap / 429 → leave ``pending`` with ``not_before`` (never drop). No tip mint.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import shutil
import subprocess
import tempfile
import time
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

PRIORITY_AUDIO = 0
PRIORITY_VIDEO = 10
DEFAULT_VIDEO_DELAY_SEC = 120.0
DEFAULT_VIDEO_FRAME_COUNT = 6
DEFAULT_VISION_MODEL = "qwen/qwen3.8-27b"


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _video_delay_sec() -> float:
    raw = (os.environ.get("CLEVERTREE_ASR_VIDEO_DELAY_SEC") or "").strip()
    try:
        return max(0.0, float(raw)) if raw else DEFAULT_VIDEO_DELAY_SEC
    except ValueError:
        return DEFAULT_VIDEO_DELAY_SEC


def _video_frame_count() -> int:
    raw = (os.environ.get("CLEVERTREE_ASR_VIDEO_FRAMES") or "").strip()
    try:
        n = int(raw) if raw else DEFAULT_VIDEO_FRAME_COUNT
    except ValueError:
        n = DEFAULT_VIDEO_FRAME_COUNT
    return max(1, min(n, 12))


def _video_drain_limit() -> int:
    raw = (os.environ.get("CLEVERTREE_ASR_VIDEO_LIMIT") or "1").strip()
    try:
        return max(0, int(raw))
    except ValueError:
        return 1


def _vision_model() -> str:
    return (os.environ.get("GROQ_VISION_MODEL") or DEFAULT_VISION_MODEL).strip()


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
        media_kind = str(item.get("kind") or "audio").strip().lower() or "audio"
        is_video = media_kind == "video"
        job: dict[str, Any] = {
            "id": job_id,
            "site": "myproblem",
            "kind": "channel_asr",
            "topic": (topic or "").strip().lower() or "mp-general",
            "channel": item.get("channel") or f"#{topic}",
            "media_kind": media_kind,
            "priority": PRIORITY_VIDEO if is_video else PRIORITY_AUDIO,
            "url": url,
            "visitor": (visitor or "").strip(),
            "nick": (nick or "").strip(),
            "source": (source or "web").strip() or "web",
            "enqueued_at": _utc_now(),
            "status": "pending",
            "marker_source": item.get("source") or "marker",
        }
        if is_video:
            delay = _video_delay_sec()
            if delay > 0:
                job["not_before"] = time.time() + delay
        path = queue_dir() / f"{job_id}.json"
        path.write_text(json.dumps(job, indent=2) + "\n", encoding="utf-8")
        job["_job_path"] = str(path)
        jobs.append(job)
        log.info(
            "enqueued channel_asr %s kind=%s priority=%s topic=%s",
            job_id,
            job["media_kind"],
            job["priority"],
            job["topic"],
        )
    return jobs


def list_pending_jobs(*, now: float | None = None) -> list[dict[str, Any]]:
    ts = time.time() if now is None else now
    jobs = []
    for path in queue_dir().glob("*.json"):
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

    def sort_key(row: dict[str, Any]) -> tuple:
        try:
            pri = int(row.get("priority"))
        except (TypeError, ValueError):
            pri = (
                PRIORITY_VIDEO
                if str(row.get("media_kind") or "") == "video"
                else PRIORITY_AUDIO
            )
        return (pri, str(row.get("enqueued_at") or ""), str(row.get("id") or ""))

    jobs.sort(key=sort_key)
    return jobs


def select_jobs_for_drain(*, limit: int = 5, now: float | None = None) -> list[dict[str, Any]]:
    """Audio-first selection; at most ``CLEVERTREE_ASR_VIDEO_LIMIT`` videos per tick."""
    pending = list_pending_jobs(now=now)
    if limit <= 0:
        return []
    video_cap = _video_drain_limit()
    audio: list[dict[str, Any]] = []
    video: list[dict[str, Any]] = []
    for job in pending:
        kind = str(job.get("media_kind") or "audio")
        if kind == "video":
            video.append(job)
        else:
            audio.append(job)
    out: list[dict[str, Any]] = []
    for job in audio:
        if len(out) >= limit:
            break
        out.append(job)
    if len(out) < limit and video_cap > 0:
        for job in video[:video_cap]:
            if len(out) >= limit:
                break
            out.append(job)
    return out


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


def _ffmpeg_bin() -> str | None:
    return shutil.which("ffmpeg")


def _ffprobe_duration_s(path: Path) -> float | None:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return None
    try:
        proc = subprocess.run(
            [
                ffprobe,
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        return float((proc.stdout or "").strip())
    except Exception:
        return None


def extract_audio_mp3(video_path: Path) -> Path | None:
    """Strip speech-oriented mono mp3 from a video/audio container."""
    ffmpeg = _ffmpeg_bin()
    if not ffmpeg:
        return None
    out = video_path.with_suffix(".speech.mp3")
    try:
        subprocess.run(
            [
                ffmpeg,
                "-y",
                "-i",
                str(video_path),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-c:a",
                "libmp3lame",
                "-q:a",
                "4",
                str(out),
            ],
            check=True,
            capture_output=True,
            timeout=180,
        )
    except Exception as exc:
        log.info("channel_asr audio strip failed: %s", exc)
        return None
    if out.is_file() and out.stat().st_size > 0:
        return out
    return None


def extract_video_frames(video_path: Path, *, count: int | None = None) -> list[Path]:
    """Timed stills (first + evenly spaced). Empty if ffmpeg unavailable."""
    ffmpeg = _ffmpeg_bin()
    if not ffmpeg:
        return []
    n = count if count is not None else _video_frame_count()
    duration = _ffprobe_duration_s(video_path) or 0.0
    if duration <= 0.5:
        times = [0.0]
    else:
        # Avoid the last instant (often black / incomplete).
        usable = max(duration - 0.25, 0.05)
        if n == 1:
            times = [0.0]
        else:
            times = [usable * i / (n - 1) for i in range(n)]
    frames: list[Path] = []
    for i, t in enumerate(times[:n]):
        out = video_path.with_name(f"{video_path.stem}.frame{i:02d}.jpg")
        try:
            subprocess.run(
                [
                    ffmpeg,
                    "-y",
                    "-ss",
                    f"{t:.3f}",
                    "-i",
                    str(video_path),
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
            continue
        if out.is_file() and out.stat().st_size > 0:
            frames.append(out)
    return frames


def _describe_frames_groq(frames: list[Path]) -> dict[str, str] | None:
    """Groq VL on up to N stills. Returns None when unavailable / soft-capped."""
    if not frames:
        return None
    api_key = (os.environ.get("GROQ_API_KEY") or "").strip()
    if not api_key:
        return None
    try:
        from clevertree_chat import quota

        soft = quota.check_vision()
        if not soft.get("ok"):
            log.info("channel_asr VL soft-capped (%s)", soft.get("reason"))
            return None
    except Exception:
        pass

    model = _vision_model()
    content: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": (
                "These are sequential stills from a short user video in a public help room. "
                "Describe what is visibly happening and what practical problem (if any) is shown. "
                "Be concrete and concise (4–8 sentences). Do not invent brands or text you cannot read. "
                "If frames are blank/unreadable, say so."
            ),
        }
    ]
    for frame in frames[:_video_frame_count()]:
        raw = frame.read_bytes()
        if not raw:
            continue
        data_url = "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii")
        content.append({"type": "image_url", "image_url": {"url": data_url}})
    if len(content) < 2:
        return None

    body = {
        "model": model,
        "temperature": 0.2,
        "max_completion_tokens": 500,
        "messages": [{"role": "user", "content": content}],
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
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    choices = payload.get("choices") or []
    text = ""
    if choices:
        msg = choices[0].get("message") or {}
        text = str(msg.get("content") or "").strip()
    if not text:
        return None
    try:
        from clevertree_chat import quota

        quota.consume_vision()
    except Exception:
        pass
    return {"text": text, "model": model, "provider": "groq"}


def _format_reply(
    job: dict[str, Any],
    *,
    transcript: str,
    asr_model: str,
    visual: str = "",
    visual_model: str = "",
) -> str:
    kind = job.get("media_kind") or "audio"
    speech = (transcript or "").strip() or "(no speech detected)"
    if len(speech) > 1500:
        speech = speech[:1497] + "…"
    vision = (visual or "").strip()
    if vision and len(vision) > 1500:
        vision = vision[:1497] + "…"

    if kind == "video" and vision:
        models = asr_model
        if visual_model:
            models = f"{visual_model}+{asr_model}"
        return (
            f"SI video (vl+asr, {models}):\n"
            f"Visual: {vision}\n"
            f"Speech: {speech}"
        )
    label = "voice" if kind == "audio" else kind
    return f"SI transcript ({label}, {asr_model}): {speech}"


def _leave_pending_rate_limit(job: dict[str, Any], job_path: str, exc: urllib.error.HTTPError) -> dict[str, Any]:
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
        error=f"http_{exc.code}",
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
        "reason": f"http_{exc.code}",
        "pending": True,
        "retry_after_s": wait,
    }


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
                    "soft_cap": True,
                }
        except Exception:
            pass

    mark_job(job_path, "leased")
    tmp: Path | None = None
    extras: list[Path] = []
    try:
        if dry and not api_key and not aws_ready:
            text = f"[dry-run] would transcribe {url}"
            model = "dry-run"
            status = "dry-run"
            visual = ""
            visual_model = ""
            if kind == "video":
                visual = "[dry-run] would sample frames for VL"
                visual_model = "dry-run"
        else:
            visual = ""
            visual_model = ""
            suffix = _suffix_for_url(url)
            tmp = Path(tempfile.mkstemp(prefix="channel-asr-", suffix=suffix, dir=cache_dir())[1])
            _download(url, tmp)

            asr_path = tmp
            if kind == "video":
                frames = extract_video_frames(tmp)
                extras.extend(frames)
                try:
                    described = _describe_frames_groq(frames)
                except urllib.error.HTTPError as exc:
                    if exc.code == 429 and not aws_ready:
                        return _leave_pending_rate_limit(job, job_path, exc)
                    log.warning("channel_asr VL failed http_%s — ASR fallback", exc.code)
                    described = None
                except Exception as exc:
                    log.info("channel_asr VL skipped: %s", exc)
                    described = None
                if described:
                    visual = described.get("text") or ""
                    visual_model = described.get("model") or ""

                stripped = extract_audio_mp3(tmp)
                if stripped is not None:
                    extras.append(stripped)
                    asr_path = stripped

            result = _transcribe_media(asr_path)
            text = result["text"]
            model = result["model"]
            status = "done"
            if result.get("provider") == "groq":
                try:
                    from clevertree_chat import quota

                    quota.consume_asr()
                except Exception:
                    pass

        reply_body = _format_reply(
            job,
            transcript=text,
            asr_model=model,
            visual=visual,
            visual_model=visual_model,
        )
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
            visual=visual or None,
            visual_model=visual_model or None,
            reply_body=reply_body,
            analysis=("vl+asr" if visual else "asr"),
        )
        return {
            "ok": True,
            "id": job.get("id"),
            "status": status,
            "model": model,
            "visual_model": visual_model or None,
            "analysis": "vl+asr" if visual else "asr",
            "text_preview": text[:120],
        }
    except urllib.error.HTTPError as exc:
        msg = f"http_{exc.code}"
        if exc.code == 429 and not aws_ready:
            return _leave_pending_rate_limit(job, job_path, exc)
        mark_job(job_path, "error", error=msg)
        return {"ok": False, "id": job.get("id"), "reason": msg}
    except Exception as exc:
        msg = str(exc)[:200]
        mark_job(job_path, "error", error=msg)
        return {"ok": False, "id": job.get("id"), "reason": msg}
    finally:
        for p in [tmp, *extras]:
            if p is None:
                continue
            try:
                p.unlink(missing_ok=True)
            except Exception:
                pass


def process_pending(*, limit: int = 5, reply: ReplyFn | None = None) -> list[dict[str, Any]]:
    """Drain due jobs audio-first. Soft-cap on one job does not stop other eligible kinds."""
    results: list[dict[str, Any]] = []
    awaiting_provider = False
    for job in select_jobs_for_drain(limit=limit):
        result = process_job(job, reply=reply)
        results.append(result)
        if result.get("pending") and result.get("reason") == "awaiting_asr_provider":
            awaiting_provider = True
            break
        # Soft-cap / rate-limit: continue — select_jobs already preferred audio;
        # another due job may still be runnable (or we stop after limit).
        if result.get("pending") and result.get("soft_cap"):
            continue
    if awaiting_provider and not results:
        return results
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
