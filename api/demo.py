"""Vercel fake debate API for guided demos (flock-cameras, thc-legalization).

In-memory only. No GitHub, no Spot, no real drain. One board per topic per process.
"""

from __future__ import annotations

import hashlib
import html
import json
import sys
import traceback
import uuid as uuidlib
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from clevertree_chat.demos import DEFAULT_TOPIC, get_demo, is_guided, known_topics  # noqa: E402
from clevertree_chat.urls import normalize_url  # noqa: E402

FILING = "Make your opinion finally heard."

GUIDED_TITLES = {
    "flock-cameras": "Should cities use camera networks?",
    "thc-legalization": "Should adult-use cannabis be legal?",
}

# One board per topic. Cold start resets.
_BOARDS: dict[str, dict] = {}
_NEXT_IDS: dict[str, int] = {}
# Visitor UUIDs minted by this process (extension / chat host).
_VISITORS: set[str] = set()


def _escape(text: str) -> str:
    return html.escape(text, quote=False).replace("\n", "<br>")


def _empty_board(topic: str) -> dict:
    return {
        "topic": topic,
        "exists": False,
        "step": 0,
        "comments": [],
        "keys": [],
        "pairs": [],
        "suggestion_sources": set(),
        "script_complete": False,
        "last_notice": "",
        "pending": None,
        "page": {"url": "", "normalized": "", "title": ""},
    }


def board(topic: str) -> dict:
    if topic not in _BOARDS:
        _BOARDS[topic] = _empty_board(topic)
        _NEXT_IDS.setdefault(topic, 1)
    state = _BOARDS[topic]
    state.setdefault("page", {"url": "", "normalized": "", "title": ""})
    return state


def reset_board(topic: str) -> dict:
    previous = _BOARDS.get(topic) or {}
    page = dict(previous.get("page") or {})
    _BOARDS[topic] = _empty_board(topic)
    if page.get("url") or page.get("normalized"):
        _BOARDS[topic]["page"] = page
    _NEXT_IDS[topic] = 1
    return _BOARDS[topic]


def identify(visitor: str = "") -> dict:
    """Mint or validate a visitor UUID. Server is the source of truth for new IDs."""
    raw = (visitor or "").strip()
    if raw:
        try:
            parsed = str(uuidlib.UUID(raw))
            _VISITORS.add(parsed)
            return {"visitor": parsed, "created": False}
        except ValueError as exc:
            raise ValueError("visitor must be a UUID") from exc
    minted = str(uuidlib.uuid4())
    _VISITORS.add(minted)
    return {"visitor": minted, "created": True}


def _page_title(norm: str, href: str = "") -> str:
    raw = href or norm
    try:
        host = ""
        path = ""
        if "://" in raw:
            parts = urlparse(raw)
            host = (parts.hostname or "").lower().removeprefix("www.")
            path = parts.pathname or ""
        else:
            # normalized form: suffix/host/path?query
            bits = norm.split("/", 2)
            host = bits[1] if len(bits) > 1 else norm
            path = "/" + bits[2].split("?", 1)[0] if len(bits) > 2 else ""
        path = path.rstrip("/") if path not in ("", "/") else ""
        label = host + path
        return label[:64] + ("…" if len(label) > 64 else "")
    except Exception:
        return (norm or "This page")[:64]


def _detect_guided(url: str, normalized: str = "") -> str | None:
    hay = f"{url} {normalized}".lower()
    if "flock-cameras" in hay:
        return "flock-cameras"
    if "thc-legalization" in hay:
        return "thc-legalization"
    return None


def resolve_page(url: str = "", normalized: str = "", visitor: str = "") -> dict:
    """Map a tab URL to a server topic id. Guided demos keep fixed slugs."""
    ident = identify(visitor)
    raw = (url or "").strip()
    norm_in = (normalized or "").strip()
    guided = _detect_guided(raw, norm_in)
    if guided:
        state = board(guided)
        state["page"] = {
            "url": raw,
            "normalized": guided,
            "title": GUIDED_TITLES.get(guided, guided),
        }
        return {
            "visitor": ident["visitor"],
            "visitor_created": ident["created"],
            "topic": guided,
            "guided": True,
            "url": raw,
            "normalized": guided,
            "title": GUIDED_TITLES.get(guided, guided),
            "exists": state["exists"],
            "view": build_view(guided, ident["visitor"]),
        }

    norm = norm_in
    if not norm and raw:
        try:
            if raw.startswith("http://") or raw.startswith("https://"):
                norm = normalize_url(raw)
            else:
                norm = "local/unparsed/"
        except Exception:
            norm = "local/unparsed/"
    if not norm:
        norm = "local/new-tab/"

    topic = "u-" + hashlib.sha256(norm.encode("utf-8")).hexdigest()[:16]
    title = _page_title(norm, raw)
    state = board(topic)
    state["page"] = {"url": raw, "normalized": norm, "title": title}
    return {
        "visitor": ident["visitor"],
        "visitor_created": ident["created"],
        "topic": topic,
        "guided": False,
        "url": raw,
        "normalized": norm,
        "title": title,
        "exists": state["exists"],
        "view": build_view(topic, ident["visitor"]),
    }


def _suggestion_rows(state: dict, demo) -> list[dict]:
    rows = []
    seen = set()
    for source in sorted(state["suggestion_sources"]):
        info = demo.SUGGESTIONS.get(source)
        if not info:
            continue
        key = info["key"]
        if key in state["keys"] or key in seen:
            continue
        seen.add(key)
        rows.append(
            {
                "key": key,
                "citation": info.get("citation") or "",
                "note": info.get("note") or "",
            }
        )
    return rows


def _comment_public(comment: dict, section_key: str, visitor: str = "") -> dict:
    keys = list(comment.get("keys") or [])
    return {
        "id": comment["id"],
        "author": comment["author_name"],
        "author_uuid": comment.get("author_uuid") or "",
        "html": _escape(comment["body"]),
        "text": comment["body"],
        "starting": comment["starting"],
        "key": section_key,
        "keys": keys if keys else [section_key],
        "tally": 0,
        "mine": bool(visitor) and comment.get("author_uuid") == visitor,
        "injected": bool(comment.get("injected")),
    }


def build_view(topic: str, visitor: str = "", focus: str = "") -> dict:
    demo = get_demo(topic)
    state = board(topic)
    script = demo.SCRIPT
    page = state.get("page") or {}
    visitor_info = {"uuid": visitor or "", "name": "", "chosen": False}
    if not state["exists"]:
        return {
            "topic": topic,
            "exists": False,
            "focus": "",
            "missing_focus": bool(focus),
            "filing_line": "",
            "existing": [],
            "pairs": [],
            "sections": {},
            "suggestions": [],
            "notices": [],
            "visitor": visitor_info,
            "page": {
                "url": page.get("url") or "",
                "normalized": page.get("normalized") or "",
                "title": page.get("title") or GUIDED_TITLES.get(topic, ""),
            },
            "guided": is_guided(topic),
            "created": False,
            "demo": {
                "step": state["step"],
                "total": len(script),
                "complete": state["script_complete"],
                "notice": state.get("last_notice") or "",
                "pending": state.get("pending"),
            },
        }

    sections: dict[str, dict] = {}
    key_order = list(state["keys"])
    has_uncat = False
    for comment in state["comments"]:
        if not comment.get("placed"):
            continue
        places = comment.get("keys") or ["uncategorized"]
        for key in places:
            if key == "uncategorized":
                has_uncat = True
            elif key not in key_order:
                key_order.append(key)
    if has_uncat and "uncategorized" not in key_order:
        key_order.append("uncategorized")

    for key in key_order:
        comments = []
        for comment in state["comments"]:
            if not comment.get("placed"):
                continue
            places = comment.get("keys") or []
            if key in places:
                comments.append(_comment_public(comment, key, visitor))
        position = demo.POSITIONS.get(key, "")
        sections[key] = {
            "key": key,
            "uncategorized": key == "uncategorized",
            "position_html": _escape(position) if position else "",
            "questions_html": "",
            "comments": comments,
            "tally": 0,
            "mine": False,
            "topic_tally": 0,
            "topic_mine": False,
        }

    pending_id = state.get("pending")
    if pending_id:
        if "uncategorized" not in sections:
            sections["uncategorized"] = {
                "key": "uncategorized",
                "uncategorized": True,
                "position_html": "",
                "questions_html": "",
                "comments": [],
                "tally": 0,
                "mine": False,
                "topic_tally": 0,
                "topic_mine": False,
            }
        for comment in state["comments"]:
            if comment["id"] == pending_id and not comment.get("placed"):
                sections["uncategorized"]["comments"].append(
                    _comment_public(
                        {**comment, "keys": ["uncategorized"], "starting": "uncategorized"},
                        "uncategorized",
                        visitor,
                    )
                )

    notices = []
    if state.get("last_notice"):
        notices.append({"section": "batch", "kind": "demo"})

    return {
        "topic": topic,
        "exists": True,
        "focus": focus if focus in sections else "",
        "missing_focus": bool(focus) and focus not in sections,
        "filing_line": FILING if state["comments"] else "",
        "existing": [key for key in state["keys"] if key != "uncategorized"],
        "pairs": [list(pair) for pair in state["pairs"]],
        "sections": sections,
        "suggestions": _suggestion_rows(state, demo),
        "notices": notices,
        "visitor": visitor_info,
        "page": {
            "url": page.get("url") or "",
            "normalized": page.get("normalized") or "",
            "title": page.get("title") or GUIDED_TITLES.get(topic, ""),
        },
        "guided": is_guided(topic),
        "created": False,
        "demo": {
            "step": state["step"],
            "total": len(script),
            "complete": state["script_complete"],
            "notice": state.get("last_notice") or "",
            "pending": state.get("pending"),
            "next_author": (
                script[state["step"]]["author"]["name"]
                if state["step"] < len(script) and not state.get("pending")
                else ""
            ),
            "next_body": (
                script[state["step"]]["body"]
                if state["step"] < len(script) and not state.get("pending")
                else ""
            ),
        },
        "batch_notice": state.get("last_notice") or "",
    }


def preview(topic: str, body: str) -> dict:
    demo = get_demo(topic)
    state = board(topic)
    existing = [key for key in state["keys"] if key != "uncategorized"]
    suggestion = demo.preview_suggestion(body, existing)
    return {
        "suggestion": suggestion,
        "filed": False,
        "can_choose_existing": True,
        "existing": existing,
        "reading": suggestion or "",
    }


def submit(
    topic: str, visitor: str, body: str, chosen: str | None = None, name: str | None = None
) -> dict:
    state = board(topic)
    text = (body or "").strip()
    if not text:
        raise ValueError("body is required")
    if state.get("pending"):
        raise ValueError("drain the pending post before submitting another")

    ident = identify(visitor)
    visitor = ident["visitor"]

    state["exists"] = True
    starting = "uncategorized"
    if chosen and chosen in state["keys"]:
        starting = chosen

    comment_id = str(_NEXT_IDS.get(topic, 1))
    _NEXT_IDS[topic] = int(comment_id) + 1
    comment = {
        "id": comment_id,
        "author_uuid": visitor,
        "author_name": (name or "").strip() or "Visitor",
        "author_id": 0,
        "body": text,
        "starting": starting,
        "keys": [],
        "placed": False,
        "script_id": None,
    }
    state["comments"].append(comment)
    state["pending"] = comment["id"]
    state["last_notice"] = ""
    return {
        "topic": topic,
        "visitor": visitor,
        "visitor_created": ident["created"],
        "comment_id": comment_id,
        "starting": starting,
        "key": starting,
        "keys": [],
        "created": True,
        "can_choose_existing": False,
        "view": build_view(topic, visitor),
    }


def _apply_drain_for_comment(
    topic: str, state: dict, comment: dict, drain_keys: list[str], step: dict | None
) -> None:
    demo = get_demo(topic)
    comment["keys"] = list(drain_keys)
    comment["placed"] = True
    for key in drain_keys:
        if key != "uncategorized" and key not in state["keys"]:
            state["keys"].append(key)
    if step:
        for source in step.get("open_suggestions_from") or []:
            state["suggestion_sources"].add(source)
        pair = step.get("pair")
        if pair and list(pair) not in state["pairs"] and [pair[1], pair[0]] not in state["pairs"]:
            state["pairs"].append(list(pair))
        state["last_notice"] = step.get("notice") or "Batch placed this post."
        comment["script_id"] = step.get("id")
    else:
        keys = demo.freeform_drain(comment["body"], state)
        comment["keys"] = keys
        for key in keys:
            if key != "uncategorized" and key not in state["keys"]:
                state["keys"].append(key)
        demo.after_freeform(state)
        state["last_notice"] = "Batch placed this post."


def drain(topic: str, visitor: str = "") -> dict:
    demo = get_demo(topic)
    state = board(topic)
    pending_id = state.get("pending")
    if not pending_id:
        return {
            "hardware_should_shut_down": True,
            "message": "nothing to drain",
            "commits": 0,
            "cloud_api_called": False,
            "booted": False,
            "view": build_view(topic, visitor),
        }

    comment = next(c for c in state["comments"] if c["id"] == pending_id)
    script = demo.SCRIPT
    step = None
    if state["step"] < len(script) and comment.get("script_id") is None:
        candidate = script[state["step"]]
        # Match by body so a visitor can take Maya lines under their own name.
        # Peer injects still use the scripted author name.
        if comment["body"] == candidate["body"]:
            from clevertree_chat.chat_hub import script_role

            role = script_role(candidate)
            if role == "peer":
                if comment["author_name"] == candidate["author"]["name"]:
                    step = candidate
            else:
                step = candidate

    if step:
        _apply_drain_for_comment(topic, state, comment, list(step["drain_keys"]), step)
        state["step"] += 1
        if state["step"] >= len(script):
            state["script_complete"] = True
    else:
        _apply_drain_for_comment(topic, state, comment, [], None)

    state["pending"] = None
    result = {
        "hardware_should_shut_down": True,
        "message": state["last_notice"],
        "commits": 1,
        "cloud_api_called": False,
        "booted": False,
        "view": build_view(topic, visitor),
        "batch_notice": state["last_notice"],
    }
    try:
        from clevertree_chat.chat_hub import HUB, PEER_NAMES

        if state["step"] < len(script):
            nxt = script[state["step"]]
            if nxt["author"]["name"] in PEER_NAMES:
                HUB.schedule_peer_after_drain(topic)
    except Exception:
        pass
    return result


def replay(topic: str, step: int | None = None) -> dict:
    """Reset, then optionally advance through scripted steps 0..step-1 fully drained."""
    reset_board(topic)
    if step is None:
        return {"view": build_view(topic), "step": 0}
    demo = get_demo(topic)
    target = max(0, min(int(step), len(demo.SCRIPT)))
    for _index in range(target):
        advance_script_once(topic)
        drain(topic)
    return {"view": build_view(topic), "step": board(topic)["step"]}


def advance_script_once(topic: str) -> dict:
    """Submit the next scripted post (live, uncategorized) without draining."""
    demo = get_demo(topic)
    state = board(topic)
    script = demo.SCRIPT
    if state.get("pending"):
        raise ValueError("drain the pending post before advancing")
    if state["step"] >= len(script):
        state["script_complete"] = True
        return {"done": True, "view": build_view(topic)}
    item = script[state["step"]]
    author = item["author"]
    result = submit(
        topic, author["uuid"], item["body"], chosen=item.get("chosen") or None, name=author["name"]
    )
    pending = next(c for c in board(topic)["comments"] if c["id"] == board(topic)["pending"])
    pending["author_name"] = author["name"]
    pending["author_uuid"] = author["uuid"]
    pending["author_id"] = author["id"]
    return {"done": False, "step_id": item["id"], "view": result["view"], "submitted": result}


def dispatch(payload: dict, query: dict) -> tuple[int, dict]:
    action = payload.get("action") or query.get("action") or "view"
    visitor = str(payload.get("visitor") or query.get("visitor") or "")
    topic = str(payload.get("topic") or query.get("topic") or DEFAULT_TOPIC).strip() or DEFAULT_TOPIC

    if action == "identify":
        return 200, identify(visitor)
    if action == "resolve":
        return 200, resolve_page(
            url=str(payload.get("url") or query.get("url") or ""),
            normalized=str(payload.get("normalized") or query.get("normalized") or ""),
            visitor=visitor,
        )

    try:
        get_demo(topic)
    except ValueError as exc:
        return 400, {"error": str(exc)}

    if action == "preview":
        return 200, preview(topic, str(payload.get("body") or ""))
    if action == "submit":
        chosen = payload.get("chosen")
        if chosen is not None:
            chosen = str(chosen).strip() or None
        return 200, submit(
            topic, visitor, str(payload.get("body") or ""), chosen=chosen, name=payload.get("name")
        )
    if action == "drain":
        return 200, drain(topic, visitor)
    if action == "replay":
        step = payload.get("step", query.get("step"))
        return 200, replay(topic, None if step in (None, "") else int(step))
    if action == "advance":
        return 200, advance_script_once(topic)
    if action == "play":
        advanced = advance_script_once(topic)
        if advanced.get("done"):
            return 200, advanced
        drained = drain(topic, visitor)
        drained["step_id"] = advanced.get("step_id")
        drained["view"] = build_view(topic, visitor)
        return 200, drained
    if action == "topics":
        return 200, {"topics": known_topics()}
    return 200, build_view(
        topic, visitor, str(query.get("subtopic") or payload.get("subtopic") or "")
    )


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
            code, body = dispatch(payload, query)
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

    def _cors(self):
        origin = self.headers.get("Origin") or ""
        allowed = {
            "https://clevertree.chat",
            "http://127.0.0.1:8944",
            "http://127.0.0.1:3000",
            "http://localhost:3000",
            "http://127.0.0.1:8080",
            "http://localhost:8080",
        }
        if origin in allowed or origin.startswith("http://127.0.0.1:") or origin.startswith(
            "http://localhost:"
        ):
            self.send_header("Access-Control-Allow-Origin", origin or "https://clevertree.chat")
        else:
            self.send_header("Access-Control-Allow-Origin", "https://clevertree.chat")
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
