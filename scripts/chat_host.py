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
from clevertree_chat.wsutil import accept_key, encode_close, encode_text, iter_frames  # noqa: E402

PORT = 8790


class ChatHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s\n" % (fmt % args))

    def do_OPTIONS(self):
        if self.path.startswith("/api/chat") or self.path.startswith("/api/debate"):
            self.send_response(204)
            self._cors()
            self.end_headers()
            return
        self.send_error(404)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path in ("/api/chat/ws", "/api/chat/ws/"):
            return self._websocket(parsed)
        if parsed.path.startswith("/api/chat") or parsed.path.startswith("/api/debate"):
            return self._api(parsed, {})
        if parsed.path == "/chat" or parsed.path.startswith("/chat/"):
            self.path = "/chat/index.html"
            return super().do_GET()
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/chat") or parsed.path.startswith("/api/debate"):
            length = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(length).decode() or "{}") if length else {}
            return self._api(parsed, payload)
        self.send_error(404)

    def _cors(self):
        origin = self.headers.get("Origin") or "*"
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, Idempotency-Key",
        )
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

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
            send_raw(
                json.dumps(
                    {
                        "type": "hello",
                        "topic": topic,
                        "view": view,
                        "activity": activity_from_view(view, visitor),
                        "chat_history": history,
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
                                        )
                                else:
                                    send_raw(
                                        json.dumps(
                                            {
                                                "type": "chat.error",
                                                "topic": topic,
                                                "error": (result or {}).get("error")
                                                or f"submit {code}",
                                            }
                                        )
                                    )
                            except Exception as exc:
                                send_raw(
                                    json.dumps(
                                        {
                                            "type": "chat.error",
                                            "topic": topic,
                                            "error": str(exc),
                                        }
                                    )
                                )
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
