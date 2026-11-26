"""Manual ``!investigate`` — only path that spends Groq text SI Free-tier RPD.

CPU heuristics still file every message. Whisper ASR stays automatic (soft-capped).
"""

from __future__ import annotations

import json
import logging
import os
import re
import uuid as uuidlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from clevertree_chat.irc_log_cache import live_root, recent
from clevertree_chat import quota

log = logging.getLogger("clevertree.investigate")

ReplyFn = Callable[[str, str, str], None]

_CMD_RE = re.compile(r"^!investigate(?:\s+(.*))?$", re.IGNORECASE | re.DOTALL)


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def enabled() -> bool:
    raw = (os.environ.get("CLEVERTREE_INVESTIGATE") or "1").strip().lower()
    return raw not in {"0", "false", "off", "no"}


def parse_command(text: str) -> str | None:
    """Return focus string (possibly empty) if text is !investigate; else None."""
    body = (text or "").strip()
    if body.startswith("<") and "> " in body[:40]:
        body = body.split("> ", 1)[1].strip()
    m = _CMD_RE.match(body)
    if not m:
        return None
    focus = (m.group(1) or "").strip()
    return focus


def queue_dir() -> Path:
    path = live_root() / "queue" / "investigate"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _context_lines(topic: str, *, limit: int = 40) -> list[str]:
    rows = recent(topic, limit=limit)
    lines: list[str] = []
    for row in rows:
        nick = (row.get("nick") or row.get("visitor") or "?").strip() or "?"
        body = str(row.get("body") or "").strip()
        if not body:
            continue
        # Skip prior SI investigate spam in context budget
        if body.lower().startswith("si: investigate cooling") or body.lower().startswith(
            "si investigate:"
        ):
            continue
        lines.append(f"<{nick}> {body}")
    return lines


def _clean_si_text(text: str) -> str:
    """Drop leaked chain-of-thought; keep heading block when present."""
    body = (text or "").strip()
    if not body:
        return ""
    lower = body.lower()
    # Prefer the structured block if the model narrated then answered.
    for marker in ("**topics:**", "topics:"):
        idx = lower.find(marker)
        if idx > 0:
            body = body[idx:].strip()
            break
    # Reject pure meta / instruction replay.
    meta_starts = (
        "we need to respond",
        "the user provided",
        "the assistant",
        "as clevertree si",
        "i will now",
    )
    if any(body.lower().startswith(m) for m in meta_starts) and "topics:" not in body.lower():
        return ""
    return body


def _build_messages(topic: str, focus: str) -> list[dict[str, str]]:
    from clevertree_chat.abuse_cues import scan_lines

    lines = _context_lines(topic, limit=40)
    transcript_bits = [ln for ln in lines if "SI transcript (" in ln][-5:]
    chat_bits = [ln for ln in lines if "SI transcript (" not in ln][-35:]
    context = "\n".join(chat_bits[-30:] + transcript_bits)
    if len(context) > 6000:
        context = context[-6000:]
    cue_hits = scan_lines(chat_bits[-40:], limit=8)
    cue_block = "(none)"
    if cue_hits:
        cue_block = "\n".join(
            f"- {','.join(h['cues'])}: {h['line']}" for h in cue_hits
        )
    focus_line = focus.strip() if focus else (
        "(organize recent channel: topics/axes, open counters, abuse/fraud risk, "
        "and one SI ask)"
    )
    system = (
        "You are Clevertree SI for a public IRC channel. Curate only — no votes, "
        "no winners, no sides. Prefer fairness and organization over persuasion.\n"
        "Reply in under 160 words using these exact headings:\n"
        "Topics: (short axis labels for distinct claims; use 'other' for non-arguments)\n"
        "Hurdles: (missing counters, unclear claims, low-confidence spots)\n"
        "Abuse: (none | spam | scam/fraud | harassment — one line why; do not invent)\n"
        "Ask: (at most one SI ask for the owner/channel)\n"
        "Ignore emoji-only noise. Do not invent standing exceptions or private rules. "
        "CPU abuse cues below are hints only — confirm from the lines. "
        "Output ONLY the four headings and their lines — no chain-of-thought, "
        "no restating these instructions."
    )
    user = (
        f"Channel topic: {topic}\n"
        f"Investigate focus: {focus_line}\n\n"
        f"CPU abuse cues (hint):\n{cue_block}\n\n"
        f"Recent channel lines (oldest→newest):\n{context or '(empty)'}\n"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def enqueue(
    topic: str,
    *,
    focus: str = "",
    nick: str = "",
    visitor: str = "",
    source: str = "irc",
) -> dict[str, Any]:
    job_id = str(uuidlib.uuid4())
    t = (topic or "").strip().lower() or "mp-general"
    job = {
        "id": job_id,
        "kind": "investigate",
        "topic": t,
        "focus": (focus or "").strip(),
        "nick": (nick or "").strip(),
        "visitor": (visitor or "").strip(),
        "source": (source or "irc").strip() or "irc",
        "enqueued_at": _utc_now(),
        "status": "pending",
    }
    path = queue_dir() / f"{job_id}.json"
    path.write_text(json.dumps(job, indent=2) + "\n", encoding="utf-8")
    job["_job_path"] = str(path)
    log.info("enqueued investigate %s topic=%s", job_id, t)
    return job


def mark_job(job_path: str, status: str, **extra: Any) -> None:
    path = Path(job_path)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        data = {}
    data["status"] = status
    data["updated_at"] = _utc_now()
    for k, v in extra.items():
        data[k] = v
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def list_pending_jobs() -> list[dict[str, Any]]:
    jobs: list[dict[str, Any]] = []
    for path in sorted(queue_dir().glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if str(data.get("status") or "pending") != "pending":
            continue
        data["_job_path"] = str(path)
        jobs.append(data)
    return jobs


def request_investigate(
    topic: str,
    *,
    focus: str = "",
    nick: str = "",
    visitor: str = "",
    source: str = "irc",
    reply: ReplyFn | None = None,
) -> dict[str, Any]:
    """Quota-gate, then enqueue. On deny, optionally reply in-channel."""
    if not enabled():
        msg = "SI: investigate is disabled on this host."
        if reply is not None:
            try:
                reply(topic, msg, "clevertree-si")
            except Exception:
                pass
        return {"ok": False, "reason": "disabled", "message": msg}

    gate = quota.consume_investigate(topic)
    if not gate["ok"]:
        msg = str(gate.get("message") or "SI: investigate budget denied.")
        if reply is not None:
            try:
                reply(topic, msg, "clevertree-si")
            except Exception:
                pass
        return {"ok": False, **gate}

    job = enqueue(
        topic,
        focus=focus,
        nick=nick,
        visitor=visitor,
        source=source,
    )
    return {
        "ok": True,
        "job_id": job.get("id"),
        "remaining_day": gate.get("remaining_day"),
        "message": "SI: investigate queued.",
    }


def process_job(job: dict[str, Any], *, reply: ReplyFn | None = None) -> dict[str, Any]:
    job_path = job.get("_job_path")
    if not job_path:
        return {"ok": False, "reason": "no_job_path"}
    topic = str(job.get("topic") or "mp-general")
    focus = str(job.get("focus") or "")
    mark_job(job_path, "leased")
    try:
        from clevertree_chat.providers import ProviderError, complete_text

        messages = _build_messages(topic, focus)
        result = complete_text(
            messages,
            temperature=0.2,
            max_tokens=900,
            response_json=False,
        )
        text = _clean_si_text((result.text or "").strip())
        if not text:
            text = "(no findings)"
        if len(text) > 1200:
            text = text[:1197] + "…"
        provider = result.provider
        model = result.model
        body = f"SI investigate ({provider}/{model}): {text}"
        if reply is not None:
            try:
                reply(topic, body, "clevertree-si")
            except Exception as exc:
                log.warning("investigate reply failed: %s", exc)
        mark_job(
            job_path,
            "done",
            reply_body=body,
            provider=provider,
            model=model,
            failover=bool(result.failover),
        )
        return {
            "ok": True,
            "id": job.get("id"),
            "status": "done",
            "provider": provider,
            "model": model,
        }
    except ProviderError as exc:
        msg = str(exc)[:200]
        # Leave pending on rate-limit so Soft/Bedrock can retry later
        if exc.status == 429 or "rate" in msg.lower():
            mark_job(job_path, "pending", error=msg, last_error_at=_utc_now())
            return {"ok": False, "id": job.get("id"), "reason": msg, "pending": True}
        mark_job(job_path, "error", error=msg)
        if reply is not None:
            try:
                reply(
                    topic,
                    f"SI investigate failed: {msg}",
                    "clevertree-si",
                )
            except Exception:
                pass
        return {"ok": False, "id": job.get("id"), "reason": msg}
    except Exception as exc:
        msg = str(exc)[:200]
        mark_job(job_path, "error", error=msg)
        return {"ok": False, "id": job.get("id"), "reason": msg}


def process_pending(*, limit: int = 3, reply: ReplyFn | None = None) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for job in list_pending_jobs()[:limit]:
        results.append(process_job(job, reply=reply))
    return results
