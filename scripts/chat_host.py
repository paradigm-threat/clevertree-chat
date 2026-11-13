#!/usr/bin/env python3
"""Intake-style Clevertree Chat host: static /chat + /api/chat HTTP + WebSocket.

Default: http://127.0.0.1:8790
Production: reverse-proxied on intake.myproblem.app (see docs/chat-host.md).
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

from api import demo  # noqa: E402
from clevertree_chat.chat_hub import HUB, activity_from_view  # noqa: E402
from clevertree_chat.wsutil import accept_key, encode_close, encode_text, iter_frames  # noqa: E402

PORT = 8790


class ChatHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s\n" % (fmt % args))

    def do_OPTIONS(self):
        if self.path.startswith("/api/chat"):
            self.send_response(204)
            self._cors()
            self.end_headers()
            return
        self.send_error(404)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path in ("/api/chat/ws", "/api/chat/ws/"):
            return self._websocket(parsed)
        if parsed.path.startswith("/api/chat"):
            return self._api(parsed, {})
        if parsed.path == "/chat" or parsed.path.startswith("/chat/"):
            self.path = "/chat/index.html"
            return super().do_GET()
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/chat"):
            length = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(length).decode() or "{}") if length else {}
            return self._api(parsed, payload)
        self.send_error(404)

    def _cors(self):
        origin = self.headers.get("Origin") or "*"
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _api(self, parsed, payload: dict):
        query = {key: values[-1] for key, values in parse_qs(parsed.query).items()}
        # Map /api/chat -> demo dispatch (same actions)
        try:
            code, body = demo.dispatch(payload, query)
            if isinstance(body, dict) and "view" in body:
                body["activity"] = activity_from_view(body["view"], str(payload.get("visitor") or query.get("visitor") or ""))
            elif isinstance(body, dict) and body.get("exists") is not None:
                body["activity"] = activity_from_view(body, str(payload.get("visitor") or query.get("visitor") or ""))
            # Fan-out after mutating actions
            action = payload.get("action") or query.get("action") or "view"
            topic = str(payload.get("topic") or query.get("topic") or "")
            visitor = str(payload.get("visitor") or query.get("visitor") or "")
            if action == "submit" and code == 200 and topic:
                comment = None
                state = demo.board(topic)
                if state.get("pending"):
                    comment = next(c for c in state["comments"] if c["id"] == state["pending"])
                HUB.broadcast(
                    topic,
                    {
                        "type": "post.live",
                        "topic": topic,
                        "comment": {
                            "id": comment["id"] if comment else "",
                            "author": comment["author_name"] if comment else "",
                            "author_uuid": comment.get("author_uuid") if comment else "",
                            "body": comment["body"] if comment else "",
                            "keys": [],
                            "starting": "uncategorized",
                            "placed": False,
                            "mine": bool(visitor) and comment and comment.get("author_uuid") == visitor,
                            "injected": False,
                            "kind": "post",
                        },
                        "view": body.get("view"),
                    },
                )
            if action == "drain" and code == 200 and topic:
                HUB.broadcast(
                    topic,
                    {
                        "type": "batch.notice",
                        "topic": topic,
                        "notice": body.get("batch_notice") or body.get("message") or "",
                        "view": body.get("view"),
                    },
                )
                HUB.broadcast(
                    topic,
                    {"type": "board.snapshot", "topic": topic, "view": body.get("view")},
                )
            if action == "replay" and code == 200 and topic:
                HUB.cancel_timer(topic)
                HUB.broadcast(
                    topic,
                    {"type": "board.snapshot", "topic": topic, "view": body.get("view")},
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
        try:
            from clevertree_chat.demos import get_demo

            get_demo(topic)
        except ValueError as exc:
            self.send_error(400, str(exc))
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
        # Hello + current snapshot
        try:
            view = demo.build_view(topic, visitor)
            send_raw(
                json.dumps(
                    {
                        "type": "hello",
                        "topic": topic,
                        "view": view,
                        "activity": activity_from_view(view, visitor),
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
                    if opcode == 0x8:  # close
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
                        if msg.get("type") == "ping":
                            send_raw(json.dumps({"type": "pong"}))
        except Exception:
            pass
        finally:
            HUB.unsubscribe(topic, send_raw)


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    server = ThreadingHTTPServer(("0.0.0.0", port), ChatHandler)
    print(f"clevertree chat host http://127.0.0.1:{port}/chat", flush=True)
    print(f"websocket ws://127.0.0.1:{port}/api/chat/ws", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
