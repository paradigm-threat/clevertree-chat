"""Unified Bunny uncurated inbox: per-(source_user, object_id) store + host index.

Path convention: ``inbox/{kind}/{source_user}/{object_id}/{filename}``
Content-addressed bytes may also live under ``blob/<sha>.<ext>`` for dedup;
meta JSON / replaceable objects always use the per-user object path.

Server derives ``source_user`` — clients cannot overwrite another user's prefix.
"""

from __future__ import annotations

import json
import re
import uuid as uuidlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from clevertree_chat.bunny_upload import bunny_configured, put_bytes, sha256_hex
from clevertree_chat.irc_log_cache import live_root
from clevertree_chat.media_allowlist import MAX_BYTES, classify_upload

KINDS = frozenset({"chat", "networker", "si", "batch"})
_SAFE_RE = re.compile(r"[^a-zA-Z0-9._:@+-]+")


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def enabled() -> bool:
    """Inbox path is always available when Bunny is configured; no kill-switch needed."""
    return bunny_configured()


def sanitize_segment(raw: str, *, fallback: str = "anon", max_len: int = 64) -> str:
    s = _SAFE_RE.sub("-", (raw or "").strip()).strip("-._")
    return (s[:max_len] or fallback)


def normalize_kind(kind: str) -> str:
    k = (kind or "chat").strip().lower()
    return k if k in KINDS else "chat"


def mint_object_id() -> str:
    return str(uuidlib.uuid4())


def derive_source_user(
    *,
    visitor: str = "",
    networker_id: str = "",
    si_service: str = "",
    kind: str = "chat",
    headers: dict[str, str] | None = None,
) -> str:
    """Server-side identity — never trust a client-supplied foreign prefix."""
    hdrs = {str(k).lower(): str(v) for k, v in (headers or {}).items()}
    # Prefer explicit SI service for kind=si
    if normalize_kind(kind) == "si":
        svc = (si_service or hdrs.get("x-si-service") or "si:host").strip()
        if not svc.startswith("si:"):
            svc = f"si:{svc}"
        return sanitize_segment(svc, fallback="si:host")
    net = (networker_id or hdrs.get("x-networker-id") or "").strip()
    if net:
        return sanitize_segment(f"nw:{net}", fallback="nw:anon")
    vis = (visitor or hdrs.get("x-visitor-id") or "").strip()
    if vis:
        return sanitize_segment(vis, fallback="anon")
    return "anon"


def object_dir(kind: str, source_user: str, object_id: str) -> str:
    return (
        f"inbox/{normalize_kind(kind)}/"
        f"{sanitize_segment(source_user)}/"
        f"{sanitize_segment(object_id, fallback=mint_object_id())}"
    )


def index_dir(source_user: str) -> Path:
    path = live_root() / "inbox-index" / sanitize_segment(source_user)
    path.mkdir(parents=True, exist_ok=True)
    return path


def index_path(source_user: str, object_id: str) -> Path:
    return index_dir(source_user) / f"{sanitize_segment(object_id)}.json"


def load_index(source_user: str, object_id: str) -> dict[str, Any] | None:
    path = index_path(source_user, object_id)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def upsert_index(record: dict[str, Any]) -> Path:
    source_user = sanitize_segment(str(record.get("source_user") or "anon"))
    object_id = sanitize_segment(str(record.get("object_id") or mint_object_id()))
    path = index_path(source_user, object_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def assert_same_owner(source_user: str, object_id: str, claimed: str) -> dict[str, Any] | None:
    """Reject cross-user replace. Returns error dict or None if ok."""
    prior = load_index(source_user, object_id)
    if prior is None:
        return None
    owner = sanitize_segment(str(prior.get("source_user") or ""))
    if owner and owner != sanitize_segment(claimed):
        return {"ok": False, "error": "object_owned_by_other_user"}
    return None


def put_object(
    data: bytes,
    *,
    filename: str,
    content_type: str = "",
    kind: str = "chat",
    source_user: str,
    object_id: str = "",
    meta: dict[str, Any] | None = None,
    client_ip: str = "",
    skip_classify: bool = False,
    also_blob: bool = True,
) -> dict[str, Any]:
    """Validate + PUT under per-user object path; upsert host index."""
    if len(data) > MAX_BYTES:
        return {"ok": False, "error": "file_too_large", "max_bytes": MAX_BYTES}
    if client_ip:
        from clevertree_chat.bunny_upload import check_rate_limit

        if not check_rate_limit(client_ip):
            return {"ok": False, "error": "rate_limited"}

    src = sanitize_segment(source_user, fallback="anon")
    oid = sanitize_segment(object_id, fallback="") if (object_id or "").strip() else mint_object_id()
    if not oid:
        oid = mint_object_id()
    kind_n = normalize_kind(kind)

    owned = assert_same_owner(src, oid, src)
    if owned:
        return owned
    prior = load_index(src, oid)
    replaced = prior is not None

    mime = content_type or "application/octet-stream"
    ext = "bin"
    classified_kind = kind_n
    if not skip_classify:
        classified = classify_upload(
            filename=filename,
            content_type=content_type,
            data=data,
            declared_kind="",
        )
        if not classified.get("ok"):
            return classified
        mime = str(classified["mime"])
        ext = str(classified["ext"])
        classified_kind = str(classified.get("kind") or kind_n)
    else:
        raw_ext = (filename.rsplit(".", 1)[-1] if "." in filename else "bin").lower()
        ext = re.sub(r"[^a-z0-9]+", "", raw_ext) or "bin"

    sha = sha256_hex(data)
    safe_name = sanitize_segment(Path(filename).name or f"file.{ext}", fallback=f"file.{ext}", max_len=128)
    if "." not in safe_name:
        safe_name = f"{safe_name}.{ext}"

    urls: list[str] = []
    paths: list[str] = []

    # Content-addressed dedup blob (optional)
    if also_blob:
        blob_path = f"blob/{sha}.{ext}"
        put_blob = put_bytes(data, bunny_path=blob_path, content_type=mime)
        if put_blob.get("ok"):
            urls.append(str(put_blob["url"]))
            paths.append(blob_path)

    obj_path = f"{object_dir(kind_n, src, oid)}/{safe_name}"
    put = put_bytes(data, bunny_path=obj_path, content_type=mime)
    if not put.get("ok"):
        return put
    urls.insert(0, str(put["url"]))
    paths.insert(0, obj_path)

    record = {
        "object_id": oid,
        "source_user": src,
        "kind": kind_n,
        "status": "pending",
        "urls": urls,
        "paths": paths,
        "filename": safe_name,
        "content_hash": sha,
        "mime": mime,
        "classified_kind": classified_kind,
        "bytes": len(data),
        "updated_at": _utc_now(),
        "created_at": (prior or {}).get("created_at") or _utc_now(),
        "meta": meta or {},
        "replaced": replaced,
    }
    upsert_index(record)
    return {
        "ok": True,
        "object_id": oid,
        "source_user": src,
        "kind": kind_n,
        "urls": urls,
        "url": urls[0] if urls else "",
        "paths": paths,
        "path": paths[0] if paths else "",
        "sha256": sha,
        "mime": mime,
        "classified_kind": classified_kind,
        "replaced": replaced,
        "max_bytes": MAX_BYTES,
    }


def put_json_object(
    payload: dict[str, Any] | list[Any] | str,
    *,
    kind: str,
    source_user: str,
    object_id: str = "",
    filename: str = "payload.json",
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if isinstance(payload, str):
        raw = payload.encode("utf-8")
    else:
        raw = (json.dumps(payload, indent=2, sort_keys=True) + "\n").encode("utf-8")
    return put_object(
        raw,
        filename=filename,
        content_type="application/json",
        kind=kind,
        source_user=source_user,
        object_id=object_id,
        meta=meta,
        skip_classify=True,
        also_blob=False,
    )


def format_inbox_marker(
    *,
    object_id: str,
    url: str = "",
    kind: str = "chat",
    source_user: str = "",
) -> str:
    parts = [f"id={object_id}", f"kind={normalize_kind(kind)}"]
    if source_user:
        parts.append(f"user={sanitize_segment(source_user)}")
    if url:
        parts.append(f"url={url}")
    return "[[mp:inbox " + " ".join(parts) + "]]"


def put_si_artifact(
    data: bytes | dict[str, Any] | str,
    *,
    service: str = "si:host",
    object_id: str = "",
    filename: str = "assessment.json",
    content_type: str = "",
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Store SI-generated assessment/media under ``inbox/si/...``."""
    src = derive_source_user(kind="si", si_service=service)
    if isinstance(data, (dict, list)):
        return put_json_object(
            data,
            kind="si",
            source_user=src,
            object_id=object_id,
            filename=filename,
            meta=meta,
        )
    if isinstance(data, str):
        raw = data.encode("utf-8")
        ctype = content_type or "text/plain; charset=utf-8"
    else:
        raw = data
        ctype = content_type or "application/octet-stream"
    return put_object(
        raw,
        filename=filename,
        content_type=ctype,
        kind="si",
        source_user=src,
        object_id=object_id,
        meta=meta,
        skip_classify=True,
        also_blob=True,
    )
