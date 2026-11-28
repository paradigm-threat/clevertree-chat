#!/usr/bin/env python3
"""Realtime AI server: durable /api/chat + WebSocket on comments SoT.

Default: http://127.0.0.1:8790
Production: api.clevertree.chat (see docs/chat-host.md).
"""

from __future__ import annotations

import json
import sys
import traceback
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from clevertree_chat.chat_hub import HUB, activity_from_view  # noqa: E402
from clevertree_chat import live_runtime as live  # noqa: E402
from clevertree_chat.media_allowlist import MAX_BYTES  # noqa: E402
from clevertree_chat.wsutil import accept_key, encode_close, encode_text, iter_frames  # noqa: E402

PORT = 8790

UPLOAD_PATHS = {
    "/api/chat/media/upload",
    "/api/chat/media/upload/",
    "/api/debate/media/upload",
    "/api/debate/media/upload/",
}

INBOX_UPLOAD_PATHS = {
    "/api/inbox/upload",
    "/api/inbox/upload/",
    "/api/chat/inbox/upload",
    "/api/chat/inbox/upload/",
}

# Static files Google (and anyone) may fetch. Everything else under ROOT is 404 —
# including directory listings of scripts/, clevertree_chat/, infra/, etc.
PUBLIC_STATIC_EXACT = {
    "/styles.css",
    "/favicon.ico",
    "/icon-128x128.png",
    "/robots.txt",
}
PUBLIC_STATIC_PREFIXES = (
    "/chat",
    "/fronts/",
    "/assets/",
)

ROBOTS_TXT = """\
User-agent: *
Disallow: /
Allow: /chat
Allow: /fronts/
Allow: /assets/
Allow: /styles.css
Allow: /favicon.ico
Allow: /icon-128x128.png

# Indexing SoT is https://clevertree.chat (Vercel). This host is API + embed UI.
"""


def _parse_multipart(content_type: str, body: bytes) -> dict:
    """Minimal multipart/form-data parser → {name: (filename, content_type, bytes)|str}."""
    if "boundary=" not in (content_type or ""):
        return {}
    boundary = content_type.split("boundary=", 1)[1].strip().strip('"')
    if not boundary:
        return {}
    delim = b"--" + boundary.encode("utf-8")
    out: dict = {}
    for part in body.split(delim):
        if not part or part in (b"--", b"--\r\n", b"\r\n"):
            continue
        if part.startswith(b"--"):
            continue
        if part.startswith(b"\r\n"):
            part = part[2:]
        if part.endswith(b"\r\n"):
            part = part[:-2]
        if b"\r\n\r\n" not in part:
            continue
        header_blob, data = part.split(b"\r\n\r\n", 1)
        if data.endswith(b"\r\n"):
            data = data[:-2]
        headers = {}
        for line in header_blob.split(b"\r\n"):
            if b":" in line:
                k, v = line.split(b":", 1)
                headers[k.decode("utf-8", "replace").strip().lower()] = v.decode(
                    "utf-8", "replace"
                ).strip()
        disp = headers.get("content-disposition", "")
        name = ""
        filename = None
        for piece in disp.split(";"):
            piece = piece.strip()
            if piece.startswith("name="):
                name = piece.split("=", 1)[1].strip().strip('"')
            elif piece.startswith("filename="):
                filename = piece.split("=", 1)[1].strip().strip('"')
        if not name:
            continue
        ctype = headers.get("content-type", "application/octet-stream")
        if filename is not None:
            out[name] = (filename, ctype, data)
        else:
            out[name] = data.decode("utf-8", "replace")
    return out


class ChatHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s\n" % (fmt % args))

    def list_directory(self, path):  # noqa: ARG002 — signature fixed by base class
        """Never expose repo / app directory listings on the public API host."""
        self.send_error(404, "Not found")
        return None

    def end_headers(self):
        # This host is API + embed UI — indexing SoT is clevertree.chat (Vercel).
        self.send_header("X-Robots-Tag", "noindex, nofollow")
        super().end_headers()

    def do_OPTIONS(self):
        if (
            self.path.startswith("/api/chat")
            or self.path.startswith("/api/debate")
            or self.path.startswith("/api/inbox")
        ):
            self.send_response(204)
            self._cors()
            self.end_headers()
            return
        self.send_error(404)

    def _is_public_static(self, path: str) -> bool:
        if path in PUBLIC_STATIC_EXACT:
            return True
        if path == "/chat" or path.startswith("/chat/"):
            return True
        return any(path.startswith(prefix) for prefix in PUBLIC_STATIC_PREFIXES)

    def _serve_robots(self) -> None:
        raw = ROBOTS_TXT.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Cache-Control", "public, max-age=300")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path or "/"
        if parsed.path in ("/api/chat/ws", "/api/chat/ws/"):
            return self._websocket(parsed)
        if parsed.path.startswith("/api/chat") or parsed.path.startswith("/api/debate"):
            return self._api(parsed, {})
        if path == "/robots.txt":
            return self._serve_robots()
        if not self._is_public_static(path):
            self.send_error(404, "Not found")
            return
        if path == "/chat" or path.startswith("/chat/"):
            self.path = "/chat/index.html"
            return super().do_GET()
        return super().do_GET()

    def do_HEAD(self):
        # Base SimpleHTTPRequestHandler.do_HEAD bypasses do_GET — enforce the
        # same public-static allowlist so source files are not HEAD-reachable.
        parsed = urlparse(self.path)
        path = parsed.path or "/"
        if parsed.path.startswith("/api/chat") or parsed.path.startswith("/api/debate"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self._cors()
            self.end_headers()
            return
        if path == "/robots.txt":
            raw = ROBOTS_TXT.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Cache-Control", "public, max-age=300")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            return
        if not self._is_public_static(path):
            self.send_error(404, "Not found")
            return
        if path == "/chat" or path.startswith("/chat/"):
            self.path = "/chat/index.html"
        return super().do_HEAD()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path in UPLOAD_PATHS:
            return self._media_upload(parsed)
        if parsed.path in {"/api/inbox/index", "/api/inbox/index/"}:
            return self._inbox_index_upsert(parsed)
        if parsed.path in INBOX_UPLOAD_PATHS or parsed.path.startswith("/api/inbox/"):
            return self._inbox_upload(parsed)
        if parsed.path.startswith("/api/chat") or parsed.path.startswith("/api/debate"):
            length = int(self.headers.get("Content-Length") or 0)
            if length > MAX_BYTES + 1024:
                return self._json(413, {"error": "file_too_large", "max_bytes": MAX_BYTES})
            payload = json.loads(self.rfile.read(length).decode() or "{}") if length else {}
            return self._api(parsed, payload)
        self.send_error(404)

    def do_PUT(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/inbox/") and parsed.path not in INBOX_UPLOAD_PATHS:
            return self._inbox_upload(parsed, replace=True)
        self.send_error(404)

    def _cors(self):
        origin = self.headers.get("Origin") or "*"
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, Idempotency-Key, X-Visitor-Id, X-Networker-Id, X-SI-Service",
        )
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")

    def _json(self, code: int, body: dict):
        raw = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _client_ip(self) -> str:
        xff = (self.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
        if xff:
            return xff
        return self.client_address[0] if self.client_address else ""

    def _media_upload(self, parsed):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return self._json(400, {"error": "missing_body"})
        if length > MAX_BYTES + (1024 * 64):
            # Drain a bit then reject so clients don't hang forever
            remaining = length
            while remaining > 0:
                chunk = self.rfile.read(min(65536, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
            return self._json(413, {"error": "file_too_large", "max_bytes": MAX_BYTES})
        content_type = self.headers.get("Content-Type") or ""
        if "multipart/form-data" not in content_type:
            return self._json(400, {"error": "expected_multipart"})
        body = self.rfile.read(length)
        form = _parse_multipart(content_type, body)
        file_field = form.get("file")
        if not isinstance(file_field, tuple) or len(file_field) != 3:
            return self._json(400, {"error": "missing_file"})
        filename, file_ctype, data = file_field
        channel = str(form.get("channel") or "web")
        kind = str(form.get("kind") or "")
        visitor = str(form.get("visitor") or self.headers.get("X-Visitor-Id") or "")
        object_id = str(form.get("object_id") or "")
        try:
            from clevertree_chat import bunny_upload

            result = bunny_upload.upload_file(
                data,
                filename=str(filename or "upload.bin"),
                content_type=str(file_ctype or "application/octet-stream"),
                channel=channel,
                kind=kind,
                client_ip=self._client_ip(),
                visitor=visitor,
                object_id=object_id,
            )
        except Exception as exc:
            sys.stderr.write(traceback.format_exc())
            return self._json(500, {"error": str(exc)})
        if not result.get("ok"):
            err = str(result.get("error") or "upload_failed")
            code = 413 if err == "file_too_large" else 429 if err == "rate_limited" else 503 if err == "bunny_not_configured" else 400
            if err.startswith("bunny_upload"):
                code = 502
            if err == "object_owned_by_other_user":
                code = 403
            return self._json(code, result)
        # Prefer inbox marker when upload landed under inbox/; else legacy media marker.
        if result.get("marker_inbox"):
            result["marker"] = result["marker_inbox"]
        else:
            from clevertree_chat.bunny_upload import format_media_marker

            result["marker"] = format_media_marker(
                kind=str(result.get("kind") or "file"),
                url=str(result.get("url") or ""),
                channel=str(result.get("channel") or channel),
                review="pending",
                sha256=str(result.get("sha256") or ""),
            )
        return self._json(200, result)

    def _inbox_index_upsert(self, parsed):
        """POST /api/inbox/index — twin writers (e.g. MyProblem) register Bunny objects."""
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return self._json(400, {"error": "missing_body"})
        if length > 256 * 1024:
            return self._json(413, {"error": "body_too_large"})
        try:
            payload = json.loads(self.rfile.read(length).decode() or "{}")
        except Exception:
            return self._json(400, {"error": "invalid_json"})
        if not isinstance(payload, dict):
            return self._json(400, {"error": "expected_object"})
        try:
            from clevertree_chat import inbox

            source_user = inbox.sanitize_segment(
                str(payload.get("source_user") or ""), fallback=""
            )
            object_id = inbox.sanitize_segment(
                str(payload.get("object_id") or ""), fallback=""
            )
            if not source_user or not object_id:
                return self._json(400, {"error": "source_user_and_object_id_required"})
            owned = inbox.assert_same_owner(source_user, object_id, source_user)
            # assert_same_owner compares claimed vs prior owner; for twin upsert
            # of a new object prior is None. If prior exists under another user, reject.
            if owned:
                return self._json(403, owned)
            prior = inbox.load_index(source_user, object_id)
            record = {
                "object_id": object_id,
                "source_user": source_user,
                "kind": inbox.normalize_kind(str(payload.get("kind") or "chat")),
                "status": str(payload.get("status") or "pending"),
                "urls": list(payload.get("urls") or ([payload.get("url")] if payload.get("url") else [])),
                "paths": list(payload.get("paths") or ([payload.get("path")] if payload.get("path") else [])),
                "filename": str(payload.get("filename") or ""),
                "content_hash": str(payload.get("content_hash") or payload.get("sha256") or ""),
                "mime": str(payload.get("mime") or ""),
                "bytes": int(payload.get("bytes") or 0),
                "updated_at": inbox._utc_now(),
                "created_at": (prior or {}).get("created_at") or inbox._utc_now(),
                "meta": payload.get("meta") if isinstance(payload.get("meta"), dict) else {},
                "replaced": prior is not None,
            }
            inbox.upsert_index(record)
            return self._json(200, {"ok": True, "object_id": object_id, "source_user": source_user})
        except Exception as exc:
            sys.stderr.write(traceback.format_exc())
            return self._json(500, {"error": str(exc)})

    def _inbox_upload(self, parsed, replace: bool = False):
        """POST /api/inbox/upload or PUT /api/inbox/{object_id}."""
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return self._json(400, {"error": "missing_body"})
        if length > MAX_BYTES + (1024 * 64):
            remaining = length
            while remaining > 0:
                chunk = self.rfile.read(min(65536, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
            return self._json(413, {"error": "file_too_large", "max_bytes": MAX_BYTES})

        path_parts = [p for p in parsed.path.strip("/").split("/") if p]
        path_object_id = ""
        if replace and len(path_parts) >= 3 and path_parts[0] == "api" and path_parts[1] == "inbox":
            path_object_id = path_parts[2]

        content_type = self.headers.get("Content-Type") or ""
        body = self.rfile.read(length)
        kind = "chat"
        filename = "upload.bin"
        file_ctype = "application/octet-stream"
        data = b""
        object_id = path_object_id
        visitor = self.headers.get("X-Visitor-Id") or ""
        networker_id = self.headers.get("X-Networker-Id") or ""
        si_service = self.headers.get("X-SI-Service") or ""

        if "multipart/form-data" in content_type:
            form = _parse_multipart(content_type, body)
            file_field = form.get("file")
            if isinstance(file_field, tuple) and len(file_field) == 3:
                filename, file_ctype, data = file_field
            elif isinstance(form.get("payload"), tuple) and len(form["payload"]) == 3:
                filename, file_ctype, data = form["payload"]
            elif isinstance(form.get("batch"), str):
                data = str(form.get("batch")).encode("utf-8")
                filename = "batch.json"
                file_ctype = "application/json"
            else:
                return self._json(400, {"error": "missing_file"})
            kind = str(form.get("kind") or kind)
            object_id = str(form.get("object_id") or object_id)
            visitor = str(form.get("visitor") or visitor)
            networker_id = str(form.get("networker_id") or networker_id)
            si_service = str(form.get("si_service") or si_service)
        elif "application/json" in content_type:
            data = body
            filename = "payload.json"
            file_ctype = "application/json"
            try:
                parsed_json = json.loads(body.decode() or "{}")
                if isinstance(parsed_json, dict):
                    kind = str(parsed_json.get("kind") or kind)
                    object_id = str(parsed_json.get("object_id") or object_id)
                    visitor = str(parsed_json.get("visitor") or visitor)
                    networker_id = str(parsed_json.get("networker_id") or networker_id)
                    if "data" in parsed_json and isinstance(parsed_json["data"], (dict, list)):
                        data = (json.dumps(parsed_json["data"]) + "\n").encode("utf-8")
            except Exception:
                pass
        else:
            data = body

        if not data:
            return self._json(400, {"error": "missing_file"})

        try:
            from clevertree_chat import inbox

            source_user = inbox.derive_source_user(
                visitor=visitor,
                networker_id=networker_id,
                si_service=si_service,
                kind=kind,
                headers={
                    "x-visitor-id": visitor,
                    "x-networker-id": networker_id,
                    "x-si-service": si_service,
                },
            )
            skip = file_ctype.startswith("application/json") or filename.endswith(".json")
            result = inbox.put_object(
                data if isinstance(data, (bytes, bytearray)) else bytes(data),
                filename=str(filename or "upload.bin"),
                content_type=str(file_ctype or "application/octet-stream"),
                kind=kind,
                source_user=source_user,
                object_id=object_id,
                client_ip=self._client_ip(),
                skip_classify=skip,
            )
        except Exception as exc:
            sys.stderr.write(traceback.format_exc())
            return self._json(500, {"error": str(exc)})

        if not result.get("ok"):
            err = str(result.get("error") or "upload_failed")
            code = (
                413
                if err == "file_too_large"
                else 429
                if err == "rate_limited"
                else 503
                if err == "bunny_not_configured"
                else 403
                if err == "object_owned_by_other_user"
                else 400
            )
            if err.startswith("bunny_upload"):
                code = 502
            return self._json(code, result)

        from clevertree_chat.inbox import format_inbox_marker

        result["marker"] = format_inbox_marker(
            object_id=str(result.get("object_id") or ""),
            url=str(result.get("url") or ""),
            kind=str(result.get("kind") or kind),
            source_user=str(result.get("source_user") or ""),
        )
        return self._json(200, result)

    def _api(self, parsed, payload: dict):
        query = {key: values[-1] for key, values in parse_qs(parsed.query).items()}
        try:
            code, body = live.dispatch(
                payload,
                query,
                self.headers.get("Cookie") or "",
                headers={
                    "Idempotency-Key": self.headers.get("Idempotency-Key") or "",
                },
            )
            if isinstance(body, dict) and "view" in body:
                body["activity"] = activity_from_view(
                    body["view"], str(payload.get("visitor") or query.get("visitor") or "")
                )
            elif isinstance(body, dict) and body.get("exists") is not None:
                body["activity"] = activity_from_view(
                    body, str(payload.get("visitor") or query.get("visitor") or "")
                )
            action = payload.get("action") or query.get("action") or "view"
            topic = str(payload.get("topic") or query.get("topic") or "")
            visitor = str(payload.get("visitor") or query.get("visitor") or "")
            if (
                action == "submit"
                and code == 200
                and topic
                and not (isinstance(body, dict) and body.get("idempotent_replay"))
            ):
                live.fanout_submit(topic, visitor, body if isinstance(body, dict) else {})
            if action == "drain" and code == 200 and topic:
                HUB.broadcast(
                    topic,
                    {
                        "type": "batch.notice",
                        "topic": topic,
                        "notice": (body or {}).get("batch_notice")
                        or (body or {}).get("message")
                        or "",
                        "view": (body or {}).get("view"),
                    },
                )
                HUB.broadcast(
                    topic,
                    {"type": "board.snapshot", "topic": topic, "view": (body or {}).get("view")},
                )
        except ValueError as exc:
            code, body = 400, {"error": str(exc)}
        except Exception as exc:
            sys.stderr.write(traceback.format_exc())
            code, body = 500, {"error": str(exc)}
        raw = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _websocket(self, parsed):
        key = self.headers.get("Sec-WebSocket-Key")
        if not key:
            self.send_error(400, "Missing Sec-WebSocket-Key")
            return
        query = {k: v[-1] for k, v in parse_qs(parsed.query).items()}
        topic = (query.get("topic") or "").strip()
        visitor = (query.get("visitor") or "").strip()
        if not topic:
            self.send_error(400, "topic required")
            return

        self.send_response(101, "Switching Protocols")
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", accept_key(key))
        self.end_headers()

        def send_raw(text: str) -> None:
            self.wfile.write(encode_text(text))
            self.wfile.flush()

        HUB.subscribe(topic, send_raw)
        try:
            from clevertree_chat import irc_log_cache

            view = live.view_topic(topic, visitor)
            history = irc_log_cache.recent(topic)
            media_reviews = {}
            try:
                from clevertree_chat import channel_media_review

                # Snapshot host review map (sha → status) for cover hydration.
                for path in channel_media_review.review_dir().glob("*.json"):
                    try:
                        data = json.loads(path.read_text(encoding="utf-8"))
                    except Exception:
                        continue
                    st = str(data.get("status") or "")
                    if st not in {"clear", "reject", "pending"}:
                        continue
                    sha = str(data.get("sha") or path.stem)
                    url = str(data.get("url") or "")
                    if sha:
                        media_reviews[sha] = st
                    if url:
                        media_reviews[url] = st
            except Exception:
                media_reviews = {}
            chrome = {}
            try:
                from clevertree_chat import irc_chrome

                chrome = irc_chrome.snapshot_for_hello(topic)
            except Exception:
                chrome = {}
            send_raw(
                json.dumps(
                    {
                        "type": "hello",
                        "topic": topic,
                        "view": view,
                        "activity": activity_from_view(view, visitor),
                        "chat_history": history,
                        "media_reviews": media_reviews,
                        "channel": chrome.get("channel") or "",
                        "topic_text": chrome.get("topic_text") or "",
                        "pin": chrome.get("pin"),
                    }
                )
            )
            send_raw(
                json.dumps(
                    {
                        "type": "chat.history",
                        "topic": topic,
                        "lines": history,
                    }
                )
            )
        except Exception:
            send_raw(json.dumps({"type": "hello", "topic": topic, "view": {"exists": False}}))

        buf = bytearray()
        try:
            while True:
                chunk = self.connection.recv(4096)
                if not chunk:
                    break
                buf.extend(chunk)
                for opcode, payload in iter_frames(buf):
                    if opcode == 0x8:
                        try:
                            self.wfile.write(encode_close())
                            self.wfile.flush()
                        except Exception:
                            pass
                        return
                    if opcode == 0x1:
                        try:
                            msg = json.loads(payload.decode("utf-8"))
                        except Exception:
                            continue
                        mtype = msg.get("type")
                        if mtype == "ping":
                            send_raw(json.dumps({"type": "pong"}))
                        elif mtype in {"chat.send", "chat.post", "privmsg"}:
                            body = str(
                                msg.get("body") or msg.get("text") or ""
                            ).strip()
                            if not body:
                                continue
                            vid = str(msg.get("visitor") or visitor or "").strip()
                            client_id = str(
                                msg.get("client_id") or msg.get("clientId") or ""
                            ).strip()
                            try:
                                code, result = live.dispatch(
                                    {
                                        "action": "submit",
                                        "topic": topic,
                                        "visitor": vid,
                                        "body": body,
                                        "name": msg.get("name") or msg.get("nick"),
                                    },
                                    {},
                                    "",
                                )
                                if code == 200:
                                    res = result if isinstance(result, dict) else {}
                                    # !investigate is handled in dispatch; no debate fanout.
                                    if not res.get("investigate"):
                                        live.fanout_submit(
                                            topic,
                                            vid,
                                            res,
                                            source="ws",
                                            nick=str(
                                                msg.get("name")
                                                or msg.get("nick")
                                                or ""
                                            ),
                                            client_id=client_id,
                                        )
                                else:
                                    err_payload = {
                                        "type": "chat.error",
                                        "topic": topic,
                                        "error": (result or {}).get("error")
                                        or f"submit {code}",
                                    }
                                    if client_id:
                                        err_payload["client_id"] = client_id
                                    send_raw(json.dumps(err_payload))
                            except Exception as exc:
                                err_payload = {
                                    "type": "chat.error",
                                    "topic": topic,
                                    "error": str(exc),
                                }
                                if client_id:
                                    err_payload["client_id"] = client_id
                                send_raw(json.dumps(err_payload))
        except Exception:
            pass
        finally:
            HUB.unsubscribe(topic, send_raw)


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    live.open_service()
    live.start_drain_worker()
    try:
        from clevertree_chat.irc_bridge import enabled, start_bridge

        if enabled():
            start_bridge()
            print("IRC bridge enabled", flush=True)
        else:
            print("IRC bridge off (set CLEVERTREE_IRC_ENABLE=1)", flush=True)
    except Exception as exc:
        print(f"IRC bridge not started: {exc}", flush=True)
    server = ThreadingHTTPServer(("0.0.0.0", port), ChatHandler)
    print(f"clevertree realtime AI host http://127.0.0.1:{port}/chat", flush=True)
    print(f"websocket ws://127.0.0.1:{port}/api/chat/ws", flush=True)
    print(f"comments SoT {live.comments_path()}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
