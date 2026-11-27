"""Whitelist MIME / magic-byte checks for chat media uploads.

Allowed: images, video, audio, PDF, and plain text (sniffed). Everything else rejected.
"""

from __future__ import annotations

from typing import Any

MAX_BYTES = 50 * 1024 * 1024  # 50 MiB — ~30s typical phone 1080p30 with headroom

# Declared MIME → canonical kind
MIME_KIND: dict[str, str] = {
    "image/jpeg": "image",
    "image/jpg": "image",
    "image/png": "image",
    "image/gif": "image",
    "image/webp": "image",
    "image/avif": "image",
    "video/mp4": "video",
    "video/webm": "video",
    "video/quicktime": "video",
    "audio/mpeg": "audio",
    "audio/mp3": "audio",
    "audio/mp4": "audio",
    "audio/webm": "audio",
    "audio/ogg": "audio",
    "audio/wav": "audio",
    "audio/x-wav": "audio",
    "audio/flac": "audio",
    "audio/aac": "audio",
    "application/pdf": "pdf",
    "text/plain": "text",
    "text/markdown": "text",
    "text/csv": "text",
    "text/html": "text",
    "text/xml": "text",
    "text/css": "text",
    "text/javascript": "text",
    "application/json": "text",
    "application/xml": "text",
    "application/yaml": "text",
    "application/x-yaml": "text",
    "text/yaml": "text",
}

EXT_KIND: dict[str, str] = {
    "jpg": "image",
    "jpeg": "image",
    "png": "image",
    "gif": "image",
    "webp": "image",
    "avif": "image",
    "mp4": "video",
    "webm": "video",  # may be audio; MIME/kind wins
    "mov": "video",
    "m4v": "video",
    "mp3": "audio",
    "m4a": "audio",
    "ogg": "audio",
    "opus": "audio",
    "wav": "audio",
    "flac": "audio",
    "aac": "audio",
    "pdf": "pdf",
    "txt": "text",
    "md": "text",
    "markdown": "text",
    "csv": "text",
    "tsv": "text",
    "json": "text",
    "xml": "text",
    "yaml": "text",
    "yml": "text",
    "log": "text",
    "html": "text",
    "htm": "text",
    "css": "text",
    "js": "text",
    "ts": "text",
    "py": "text",
    "rs": "text",
    "go": "text",
    "sh": "text",
    "c": "text",
    "h": "text",
    "cpp": "text",
    "hpp": "text",
    "java": "text",
    "rb": "text",
    "php": "text",
    "sql": "text",
    "toml": "text",
    "ini": "text",
    "cfg": "text",
    "conf": "text",
}

# Exts we never accept even if sniff looks text-like
DANGEROUS_EXT = {
    "exe",
    "dll",
    "so",
    "dylib",
    "bat",
    "cmd",
    "com",
    "msi",
    "scr",
    "ps1",
    "vbs",
    "jscript",
    "jar",
    "apk",
    "dmg",
    "pkg",
    "deb",
    "rpm",
    "wasm",
    "bin",
    "iso",
    "img",
}


def normalize_ext(filename: str) -> str:
    name = (filename or "").rsplit("/", 1)[-1]
    if "." not in name:
        return ""
    return name.rsplit(".", 1)[-1].lower().replace(" ", "")


def normalize_mime(mime: str) -> str:
    raw = (mime or "").split(";", 1)[0].strip().lower()
    if raw == "image/jpg":
        return "image/jpeg"
    if raw == "audio/mp3":
        return "audio/mpeg"
    return raw


def sniff_magic(data: bytes) -> str | None:
    """Return canonical MIME from magic bytes, or None if unknown."""
    if not data:
        return None
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if len(data) >= 12 and data[4:8] == b"ftyp":
        brand = data[8:12]
        if brand in (b"avif", b"avis"):
            return "image/avif"
        if brand in (b"isom", b"iso2", b"mp41", b"mp42", b"M4V ", b"M4A ", b"qt  "):
            # Distinguish audio-ish M4A loosely via brand
            if brand in (b"M4A ",):
                return "audio/mp4"
            return "video/mp4"
        return "video/mp4"
    if data[:4] == b"\x1aE\xdf\xa3":
        return "video/webm"  # EBML — webm/mkv; treat as webm container
    if data[:4] == b"OggS":
        return "audio/ogg"
    if data[:4] == b"fLaC":
        return "audio/flac"
    if data[:4] == b"RIFF" and len(data) >= 12 and data[8:12] == b"WAVE":
        return "audio/wav"
    if len(data) >= 3 and data[:3] == b"ID3":
        return "audio/mpeg"
    if len(data) >= 2 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0:
        return "audio/mpeg"
    if data[:5] == b"%PDF-":
        return "application/pdf"
    return None


def is_plain_text(data: bytes, *, sample: int = 8192) -> bool:
    """True when bytes look like plain text (not binary)."""
    if not data:
        return True
    chunk = data[:sample]
    if b"\x00" in chunk:
        return False
    # High ratio of non-text control bytes → binary
    weird = 0
    for b in chunk:
        if b < 9 or (13 < b < 32 and b != 27):
            weird += 1
    return (weird / max(len(chunk), 1)) <= 0.30


def classify_upload(
    *,
    filename: str,
    content_type: str,
    data: bytes,
    declared_kind: str = "",
) -> dict[str, Any]:
    """Validate and classify an upload.

    Returns ``{ok, kind, mime, ext, error?}``.
    """
    if len(data) > MAX_BYTES:
        return {"ok": False, "error": "file_too_large", "max_bytes": MAX_BYTES}
    if not data:
        return {"ok": False, "error": "empty_file"}

    ext = normalize_ext(filename)
    if ext in DANGEROUS_EXT:
        return {"ok": False, "error": "type_not_allowed", "ext": ext}

    declared = normalize_mime(content_type)
    magic = sniff_magic(data)
    want_kind = (declared_kind or "").strip().lower()

    # Prefer magic when present
    mime = magic or declared
    if not mime and ext in EXT_KIND:
        # Infer a MIME for text/ext-only cases
        kind_from_ext = EXT_KIND[ext]
        if kind_from_ext == "text":
            mime = "text/plain"
        elif kind_from_ext == "pdf":
            mime = "application/pdf"
        elif kind_from_ext == "image":
            mime = f"image/{ext if ext != 'jpg' else 'jpeg'}"
        elif kind_from_ext == "audio":
            mime = f"audio/{ext}"
        elif kind_from_ext == "video":
            mime = f"video/{ext}"

    mime = normalize_mime(mime or "")
    kind = MIME_KIND.get(mime)

    # Plain text path: allow text/* and a few application/* when sniff passes
    if kind is None and (
        mime.startswith("text/")
        or mime in {"application/json", "application/xml", "application/yaml", "application/x-yaml"}
        or (ext in EXT_KIND and EXT_KIND[ext] == "text")
    ):
        if is_plain_text(data):
            kind = "text"
            mime = mime if mime.startswith("text/") or mime in MIME_KIND else "text/plain"
        else:
            return {"ok": False, "error": "not_plain_text", "mime": mime}

    if kind is None:
        # Last chance: pure text sniff with known text ext or empty mime
        if (not mime or mime == "application/octet-stream") and is_plain_text(data):
            if not ext or EXT_KIND.get(ext) == "text":
                kind = "text"
                mime = "text/plain"
            else:
                return {"ok": False, "error": "type_not_allowed", "mime": mime or "unknown", "ext": ext}
        else:
            return {"ok": False, "error": "type_not_allowed", "mime": mime or "unknown", "ext": ext}

    # webm container: respect declared video vs audio
    if mime in {"video/webm", "audio/webm"} or (ext == "webm"):
        if want_kind in {"audio", "video"}:
            kind = want_kind
            mime = f"{want_kind}/webm"
        elif declared.startswith("audio/"):
            kind = "audio"
            mime = "audio/webm"
        elif declared.startswith("video/") or magic == "video/webm":
            kind = "video"
            mime = "video/webm"

    if want_kind in {"image", "video", "audio", "pdf", "text", "file"} and want_kind != "file":
        # Don't let client upgrade kinds; only refine webm/audio-video
        if want_kind != kind and not (kind in {"audio", "video"} and want_kind in {"audio", "video"}):
            # Ignore mismatched declare; keep sniffed kind
            pass

    # Ext must not contradict dangerous; if ext known, should match family
    if ext and ext in EXT_KIND:
        ext_kind = EXT_KIND[ext]
        if ext_kind != kind and not (
            ext == "webm" and kind in {"audio", "video"}
        ):
            # Allow text sniff with odd ext only if already classified text via MIME
            if not (kind == "text" and is_plain_text(data)):
                return {
                    "ok": False,
                    "error": "ext_mime_mismatch",
                    "ext": ext,
                    "kind": kind,
                }

    if kind == "text" and not is_plain_text(data):
        return {"ok": False, "error": "not_plain_text"}

    safe_ext = ext
    if not safe_ext:
        safe_ext = {
            "image": "bin",
            "video": "webm",
            "audio": "webm",
            "pdf": "pdf",
            "text": "txt",
        }.get(kind, "bin")
        if mime == "image/jpeg":
            safe_ext = "jpg"
        elif mime == "image/png":
            safe_ext = "png"
        elif mime == "image/gif":
            safe_ext = "gif"
        elif mime == "image/webp":
            safe_ext = "webp"
        elif mime == "image/avif":
            safe_ext = "avif"
        elif mime == "video/mp4":
            safe_ext = "mp4"
        elif mime == "application/pdf":
            safe_ext = "pdf"
        elif mime == "audio/mpeg":
            safe_ext = "mp3"
        elif mime == "audio/wav":
            safe_ext = "wav"

    safe_ext = "".join(c for c in safe_ext if c.isalnum())[:8] or "bin"

    return {
        "ok": True,
        "kind": kind,
        "mime": mime or "application/octet-stream",
        "ext": safe_ext,
    }
