"""Live debate endpoint. The batch is the in-process curator, not a GPU."""

from __future__ import annotations

import json
import os
import sys
import traceback
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from clevertree_chat.auth import Session  # noqa: E402
from clevertree_chat.service import DebateService  # noqa: E402
from clevertree_chat.store import GitHubStore, materialize_auth, materialize_comments  # noqa: E402


def _pepper() -> bytes:
    raw = os.environ.get("CLEVERTREE_AUTH_PEPPER", "")
    if raw:
        return raw.encode()
    if os.environ.get("VERCEL"):
        raise RuntimeError("CLEVERTREE_AUTH_PEPPER is not set")
    return b"clevertree-local-pepper"


def _root() -> Path:
    if os.environ.get("VERCEL"):
        return Path("/tmp/clevertree-live")
    return ROOT / "var" / "clevertree-live"


def open_service():
    token = os.environ.get("CLEVERTREE_GITHUB_TOKEN", "").strip()
    pepper = _pepper()
    root = _root()
    root.mkdir(parents=True, exist_ok=True)
    if token:
        store = GitHubStore(token, root)
        debate, auth = store.load(pepper)
        return DebateService(debate, auth), store
    debate = materialize_comments(root / "comments", {})
    auth = materialize_auth(root / "auth", {}, pepper)
    debate.attach_auth(auth)
    return DebateService(debate, auth), None


def _session(header: str, visitor: str):
    if not header or not visitor:
        return None
    token = ""
    for part in header.split(";"):
        name, _, value = part.strip().partition("=")
        if name == "clevertree_session":
            token = value
    if not token:
        return None
    return Session(token=token, uuid=visitor, http_only=True)


def dispatch(payload: dict, query: dict, cookie: str) -> tuple[int, dict, str | None]:
    action = payload.get("action") or query.get("action") or "view"
    visitor = str(payload.get("visitor") or query.get("visitor") or "")
    topic = str(payload.get("topic") or query.get("topic") or "")
    service, store = open_service()
    session = _session(cookie, visitor)
    writing = action in {"submit", "drain", "vote", "name", "passkey"}
    cookie_out = None
    if action == "preview":
        result = service.preview(topic, str(payload.get("body") or ""))
    elif action == "submit":
        chosen = payload.get("chosen")
        if chosen is not None:
            chosen = str(chosen).strip() or None
        result = service.submit(
            visitor,
            topic,
            str(payload.get("body") or ""),
            chosen=chosen,
            name=payload.get("name"),
            session=session,
        )
    elif action == "drain":
        result = service.drain(topic, visitor)
    elif action == "vote":
        result = service.vote(
            visitor,
            topic=topic,
            level=str(payload.get("level") or ""),
            key=payload.get("key"),
            comment=payload.get("comment"),
            session=session,
        )
    elif action == "name":
        result = service.set_name(visitor, str(payload.get("name") or ""), topic, session=session)
    elif action == "passkey":
        if payload.get("op") == "register":
            result = service.register_passkey(
                visitor,
                str(payload.get("credential_id") or ""),
                str(payload.get("public_key") or ""),
                payload.get("email"),
            )
            cookie_out = result["session"].header()
            result = {"saved": True}
        else:
            result = service.passkey_options(visitor)
    else:
        result = service.view(topic, str(query.get("subtopic") or payload.get("subtopic") or ""), visitor)
        writing = False
    if writing and store is not None:
        store.save(service.debate, service.auth)
    return 200, result, cookie_out


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self._handle()

    def do_POST(self):
        self._handle()

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s\n" % (fmt % args))

    def _handle(self):
        try:
            parsed = urlparse(self.path)
            query = {key: values[-1] for key, values in parse_qs(parsed.query).items()}
            payload = {}
            length = int(self.headers.get("Content-Length") or 0)
            if length:
                payload = json.loads(self.rfile.read(length).decode() or "{}")
            code, body, cookie = dispatch(payload, query, self.headers.get("Cookie") or "")
        except PermissionError as exc:
            code, body, cookie = 403, {"error": str(exc)}, None
        except ValueError as exc:
            code, body, cookie = 400, {"error": str(exc)}, None
        except Exception as exc:
            sys.stderr.write(traceback.format_exc())
            code, body, cookie = 500, {"error": str(exc)}, None
        raw = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self._cors()
        if cookie:
            self.send_header("Set-Cookie", cookie + "; Secure")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "https://clevertree.chat")
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
