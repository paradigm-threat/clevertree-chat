"""IRC-style display nick sanitize + host claim table.

Claims live under ``var/clevertree-live/nick-claims/{nick_lc}.json`` for fast
uniqueness without scanning the comments user index. Locked claims require
passkey session (or nick passphrase reclaim) to steal/rebind.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from clevertree_chat.irc_log_cache import live_root

_lock = threading.RLock()

# Ergo-ish nick charset; keep short for UI.
_NICK_RE = re.compile(r"^[A-Za-z\[\]\\`_^{|}][A-Za-z0-9\[\]\\`_^{|}-]{0,30}$")
_RESERVED = frozenset(
    {
        "you",
        "anon",
        "anonymous",
        "visitor",
        "clevertree",
        "clevertree-si",
        "si",
        "system",
        "nickserv",
        "chanserv",
        "admin",
        "root",
        "bot",
    }
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def claims_dir() -> Path:
    path = live_root() / "nick-claims"
    path.mkdir(parents=True, exist_ok=True)
    return path


def sanitize_nick(raw: str) -> str:
    """Normalize display nick; raises ValueError if empty/invalid/reserved."""
    cleaned = " ".join((raw or "").strip().split())
    if not cleaned:
        raise ValueError("name is empty")
    # Allow spaces in display → fold to hyphen for claim key / IRC-ish form
    folded = cleaned.replace(" ", "-")
    if len(folded) > 32:
        folded = folded[:32]
    if not _NICK_RE.match(folded):
        # Soften: strip illegal chars
        first = re.sub(r"[^A-Za-z\[\]\\`_^{|}]", "", folded[:1]) or "n"
        rest = re.sub(r"[^A-Za-z0-9\[\]\\`_^{|}-]", "", folded[1:])
        folded = (first + rest)[:32]
    if not folded or not _NICK_RE.match(folded):
        raise ValueError("name has invalid characters")
    if folded.lower() in _RESERVED:
        raise ValueError("name is reserved")
    return folded


def claim_path(nick: str) -> Path:
    return claims_dir() / f"{sanitize_nick(nick).lower()}.json"


def load_claim(nick: str) -> dict[str, Any] | None:
    try:
        path = claim_path(nick)
    except ValueError:
        return None
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def write_claim(
    nick: str,
    *,
    visitor: str,
    locked: bool = False,
    passphrase_hash: str = "",
) -> dict[str, Any]:
    clean = sanitize_nick(nick)
    record = {
        "nick": clean,
        "nick_lc": clean.lower(),
        "visitor": visitor,
        "locked": bool(locked),
        "passphrase_hash": passphrase_hash or "",
        "updated_at": _utc_now(),
    }
    path = claims_dir() / f"{clean.lower()}.json"
    with _lock:
        path.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return record


def clear_visitor_claims(visitor: str, *, keep_nick_lc: str = "") -> None:
    """Drop other claim files owned by visitor when they rename."""
    keep = (keep_nick_lc or "").lower()
    root = claims_dir()
    with _lock:
        for path in root.glob("*.json"):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                continue
            if not isinstance(data, dict):
                continue
            if str(data.get("visitor") or "") != visitor:
                continue
            if str(data.get("nick_lc") or path.stem) == keep:
                continue
            try:
                path.unlink()
            except Exception:
                pass


def next_available_nick(desired: str) -> str:
    """IRC-like suffix when unlocked nick is already taken: bob, bob2, bob3…"""
    base = sanitize_nick(desired)
    candidate = base
    n = 2
    while True:
        prior = load_claim(candidate)
        if prior is None:
            return candidate
        if n > 99:
            raise ValueError("name is unavailable")
        # Preserve case of base + numeric suffix
        candidate = f"{base}{n}"
        if len(candidate) > 32:
            trimmed = base[: max(1, 32 - len(str(n)))]
            candidate = f"{trimmed}{n}"
        n += 1


def passphrase_hash(nick: str, passphrase: str, pepper: bytes | str) -> str:
    nick_lc = sanitize_nick(nick).lower()
    pep = pepper.encode() if isinstance(pepper, str) else pepper
    raw = f"{nick_lc}\0{passphrase}".encode()
    return hmac.new(pep, raw, hashlib.sha256).hexdigest()


def auth_pepper() -> bytes:
    raw = (os.environ.get("CLEVERTREE_AUTH_PEPPER") or "dev-nick-pepper").encode()
    return raw


class NickTakenError(PermissionError):
    """Locked nick owned by another visitor."""

    def __init__(self, nick: str):
        super().__init__("nick_taken")
        self.nick = nick


def claim_nick_for_visitor(
    nick: str,
    visitor: str,
    *,
    locked: bool = False,
    allow_suffix: bool = True,
) -> dict[str, Any]:
    """Reserve nick for visitor. Raises NickTakenError if locked by another."""
    desired = sanitize_nick(nick)
    prior = load_claim(desired)
    if prior and str(prior.get("visitor") or "") != visitor:
        if prior.get("locked"):
            raise NickTakenError(desired)
        if allow_suffix:
            desired = next_available_nick(desired)
        else:
            raise NickTakenError(desired)
    # Re-load after suffix
    prior = load_claim(desired)
    pass_hash = ""
    if prior and str(prior.get("visitor") or "") == visitor:
        pass_hash = str(prior.get("passphrase_hash") or "")
        locked = locked or bool(prior.get("locked"))
    clear_visitor_claims(visitor, keep_nick_lc=desired.lower())
    return write_claim(desired, visitor=visitor, locked=locked, passphrase_hash=pass_hash)


def set_passphrase(nick: str, visitor: str, passphrase: str) -> dict[str, Any]:
    clean = sanitize_nick(nick)
    prior = load_claim(clean)
    if prior and str(prior.get("visitor") or "") not in {"", visitor}:
        if prior.get("locked") and str(prior.get("visitor")) != visitor:
            raise NickTakenError(clean)
    h = passphrase_hash(clean, passphrase, auth_pepper()) if passphrase.strip() else ""
    clear_visitor_claims(visitor, keep_nick_lc=clean.lower())
    return write_claim(clean, visitor=visitor, locked=True, passphrase_hash=h)


def reclaim_with_passphrase(nick: str, visitor: str, passphrase: str) -> dict[str, Any]:
    clean = sanitize_nick(nick)
    prior = load_claim(clean)
    if prior is None:
        raise ValueError("nick_not_claimed")
    stored = str(prior.get("passphrase_hash") or "")
    if not stored:
        raise PermissionError("nick_has_no_passphrase")
    if not hmac.compare_digest(stored, passphrase_hash(clean, passphrase, auth_pepper())):
        raise PermissionError("bad_passphrase")
    clear_visitor_claims(visitor, keep_nick_lc=clean.lower())
    return write_claim(
        clean,
        visitor=visitor,
        locked=True,
        passphrase_hash=stored,
    )
