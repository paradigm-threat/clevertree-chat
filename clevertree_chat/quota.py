"""Soft Free-tier budgets in front of Groq hard limits.

Counters live under var/clevertree-live/quota/ (host disk, not git).
"""

from __future__ import annotations

import json
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from clevertree_chat.irc_log_cache import live_root

_lock = threading.RLock()


def _utc_day() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def quota_dir() -> Path:
    path = live_root() / "quota"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _day_path() -> Path:
    return quota_dir() / f"{_utc_day()}.json"


def _load() -> dict[str, Any]:
    path = _day_path()
    if not path.is_file():
        return {"day": _utc_day(), "investigate": {"total": 0, "channels": {}}, "asr": {"total": 0, "minute": {}}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        data = {}
    if not isinstance(data, dict):
        data = {}
    data.setdefault("day", _utc_day())
    data.setdefault("investigate", {"total": 0, "channels": {}})
    data.setdefault("asr", {"total": 0, "minute": {}})
    inv = data["investigate"]
    if not isinstance(inv, dict):
        inv = {"total": 0, "channels": {}}
        data["investigate"] = inv
    inv.setdefault("total", 0)
    inv.setdefault("channels", {})
    asr = data["asr"]
    if not isinstance(asr, dict):
        asr = {"total": 0, "minute": {}}
        data["asr"] = asr
    asr.setdefault("total", 0)
    asr.setdefault("minute", {})
    return data


def _save(data: dict[str, Any]) -> None:
    path = _day_path()
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def _int_env(name: str, default: int) -> int:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        return max(0, int(raw))
    except ValueError:
        return default


def investigate_cooldown_s() -> int:
    return _int_env("CLEVERTREE_INVESTIGATE_COOLDOWN_S", 600)


def investigate_daily_max() -> int:
    return _int_env("CLEVERTREE_INVESTIGATE_DAILY_MAX", 48)


def asr_soft_rpd() -> int:
    return _int_env("CLEVERTREE_ASR_SOFT_RPD", 1500)


def asr_soft_rpm() -> int:
    return _int_env("CLEVERTREE_ASR_SOFT_RPM", 15)


def check_investigate(topic: str) -> dict[str, Any]:
    """Return {ok, reason, retry_after_s, remaining_day, message} without consuming."""
    t = (topic or "").strip().lower() or "mp-general"
    cooldown = investigate_cooldown_s()
    daily_max = investigate_daily_max()
    with _lock:
        data = _load()
        inv = data["investigate"]
        total = int(inv.get("total") or 0)
        channels = inv.get("channels") or {}
        if not isinstance(channels, dict):
            channels = {}
        ch = channels.get(t) if isinstance(channels.get(t), dict) else {}
        last_ts = float(ch.get("last_ts") or 0)
        now = time.time()
        remaining_day = max(0, daily_max - total)
        if daily_max and total >= daily_max:
            return {
                "ok": False,
                "reason": "daily_max",
                "retry_after_s": None,
                "remaining_day": 0,
                "message": (
                    f"SI: investigate daily Free-tier budget used ({daily_max}/day). "
                    "Try again tomorrow UTC."
                ),
            }
        if cooldown and last_ts and (now - last_ts) < cooldown:
            left = int(cooldown - (now - last_ts))
            mins = max(1, (left + 59) // 60)
            return {
                "ok": False,
                "reason": "cooldown",
                "retry_after_s": left,
                "remaining_day": remaining_day,
                "message": (
                    f"SI: investigate cooling down ({mins}m left) — Free-tier budget."
                ),
            }
        return {
            "ok": True,
            "reason": "",
            "retry_after_s": 0,
            "remaining_day": remaining_day,
            "message": "",
        }


def consume_investigate(topic: str) -> dict[str, Any]:
    """Atomically check + consume one investigate slot."""
    t = (topic or "").strip().lower() or "mp-general"
    with _lock:
        gate = check_investigate(t)
        if not gate["ok"]:
            return gate
        data = _load()
        inv = data["investigate"]
        channels = inv.setdefault("channels", {})
        if not isinstance(channels, dict):
            channels = {}
            inv["channels"] = channels
        ch = channels.get(t)
        if not isinstance(ch, dict):
            ch = {}
        now = time.time()
        ch["last_ts"] = now
        ch["count"] = int(ch.get("count") or 0) + 1
        channels[t] = ch
        inv["total"] = int(inv.get("total") or 0) + 1
        _save(data)
        remaining = max(0, investigate_daily_max() - int(inv["total"]))
        return {
            "ok": True,
            "reason": "",
            "retry_after_s": 0,
            "remaining_day": remaining,
            "message": "",
        }


def check_asr() -> dict[str, Any]:
    """Soft ASR gate (RPM + RPD). Does not consume."""
    rpd = asr_soft_rpd()
    rpm = asr_soft_rpm()
    minute_key = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
    with _lock:
        data = _load()
        asr = data["asr"]
        total = int(asr.get("total") or 0)
        minute = asr.get("minute") or {}
        if not isinstance(minute, dict):
            minute = {}
        # prune old minute buckets
        keep = {k: v for k, v in minute.items() if str(k) >= minute_key[:-1]}  # rough
        # Keep only last 3 minute keys
        keys = sorted(str(k) for k in minute.keys())[-3:]
        minute = {k: minute[k] for k in keys if k in minute}
        asr["minute"] = minute
        cur = int(minute.get(minute_key) or 0)
        if rpd and total >= rpd:
            return {
                "ok": False,
                "reason": "asr_daily_soft",
                "message": f"ASR soft daily cap ({rpd})",
            }
        if rpm and cur >= rpm:
            return {
                "ok": False,
                "reason": "asr_rpm_soft",
                "message": f"ASR soft RPM cap ({rpm})",
            }
        return {"ok": True, "reason": "", "message": ""}


def consume_asr() -> dict[str, Any]:
    gate = check_asr()
    if not gate["ok"]:
        return gate
    minute_key = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
    with _lock:
        data = _load()
        asr = data["asr"]
        minute = asr.setdefault("minute", {})
        if not isinstance(minute, dict):
            minute = {}
            asr["minute"] = minute
        minute[minute_key] = int(minute.get(minute_key) or 0) + 1
        asr["total"] = int(asr.get("total") or 0) + 1
        # prune
        keys = sorted(str(k) for k in minute.keys())[-5:]
        asr["minute"] = {k: minute[k] for k in keys if k in minute}
        _save(data)
        return {"ok": True, "reason": "", "message": ""}


def status() -> dict[str, Any]:
    with _lock:
        data = _load()
        inv = data.get("investigate") or {}
        asr = data.get("asr") or {}
        return {
            "day": data.get("day") or _utc_day(),
            "investigate": {
                "total": int(inv.get("total") or 0),
                "daily_max": investigate_daily_max(),
                "cooldown_s": investigate_cooldown_s(),
                "channels": inv.get("channels") or {},
            },
            "asr": {
                "total": int(asr.get("total") or 0),
                "soft_rpd": asr_soft_rpd(),
                "soft_rpm": asr_soft_rpm(),
            },
        }
