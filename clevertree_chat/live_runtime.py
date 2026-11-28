"""Long-lived realtime AI server: DebateService on a comments checkout.

Always-on lightweight path (preview/submit/WS). Heuristic batch drain runs in
a background thread — no GPU, no scripted peers.
"""

from __future__ import annotations

import hashlib
import os
import threading
import time
import uuid as uuidlib
from pathlib import Path
from urllib.parse import urlparse

from clevertree_chat import SERVICE_ID
from clevertree_chat.associations import ASSOCIATIONS_FILE, dump_graph, ensure_page, load_graph
from clevertree_chat.auth import Session
from clevertree_chat.chat_hub import HUB, activity_from_view
from clevertree_chat.pt_seed import REVIEW_TITLES, REVIEW_TOPICS
from clevertree_chat.service import DebateService, PAGE as DEFAULT_PAGE
from clevertree_chat.store import GitHubStore, materialize_auth, materialize_comments
from clevertree_chat.urls import normalize_url

ROOT = Path(__file__).resolve().parents[1]

STARTER_TOPICS = ("flock-cameras", "thc-legalization")
STARTER_TITLES = {
    "flock-cameras": "Should cities use camera networks?",
    "thc-legalization": "Should adult-use cannabis be legal?",
    **REVIEW_TITLES,
}

_lock = threading.RLock()
_service: DebateService | None = None
_store: GitHubStore | None = None
_visitors: set[str] = set()
_drain_thread: threading.Thread | None = None
_drain_stop = threading.Event()
_pages: dict[str, dict] = {}  # topic -> {url, normalized, title}


def _pepper() -> bytes:
    raw = os.environ.get("CLEVERTREE_AUTH_PEPPER", "")
    if raw:
        return raw.encode()
    return b"clevertree-local-pepper"


def comments_path() -> Path:
    for key in ("CLEVERTREE_COMMENTS_PATH", "CLEVERTREE_PT_COMMENTS"):
        env = (os.environ.get(key) or "").strip()
        if env:
            path = Path(env)
            path.mkdir(parents=True, exist_ok=True)
            return path
    sibling = ROOT.parent / "clevertree-chat-comments"
    if (
        os.environ.get("CLEVERTREE_USE_SIBLING", "").strip() in {"1", "true", "yes"}
        and sibling.is_dir()
        and (sibling / "pages").is_dir()
    ):
        return sibling
    path = ROOT / "var" / "clevertree-live" / "comments"
    path.mkdir(parents=True, exist_ok=True)
    return path


def auth_path() -> Path:
    env = (os.environ.get("CLEVERTREE_AUTH_PATH") or "").strip()
    if env:
        return Path(env)
    path = ROOT / "var" / "clevertree-live" / "auth"
    path.mkdir(parents=True, exist_ok=True)
    return path


# Craft IRC rooms (per tip-repo / collection) — not URL debate pages.
CRAFT_TOPICS = frozenset({"ga-savannah-cat-rescue", "mp-general"})


def page_for_topic(topic: str) -> str:
    """PT review rooms use page==topic; product/extension topics live under try."""
    t = (topic or "").strip()
    if t in REVIEW_TOPICS:
        return t
    if t in CRAFT_TOPICS:
        return t
    svc = _service
    if svc is not None:
        root = svc.debate.repo.path / "pages" / t / "topics" / t
        if root.is_dir():
            return t
    return DEFAULT_PAGE


def open_service() -> DebateService:
    global _service, _store
    with _lock:
        if _service is not None:
            return _service
        pepper = _pepper()
        cpath = comments_path()
        apath = auth_path()
        _maybe_seed_fixtures(cpath)
        token = os.environ.get("CLEVERTREE_GITHUB_TOKEN", "").strip()
        sync = os.environ.get("CLEVERTREE_COMMENTS_SYNC", "").strip() in {"1", "true", "yes"}
        if token and sync:
            store = GitHubStore(token, ROOT / "var" / "clevertree-live")
            debate, auth = store.load(pepper)
            _store = store
            _service = DebateService(debate, auth)
        else:
            debate = materialize_comments(cpath, {})
            auth = materialize_auth(apath, {}, pepper)
            debate.attach_auth(auth)
            _store = None
            _service = DebateService(debate, auth)
        return _service


def _maybe_seed_fixtures(cpath: Path) -> None:
    """One-shot light PT seed when the comments tree has no review pages yet."""
    if os.environ.get("CLEVERTREE_SEED_FIXTURES", "1").strip() in {"0", "false", "no"}:
        return
    # Full SoT mount (PVC bootstrap) — never overwrite with fixture seed.
    if (cpath / ".clevertree-full-sot").is_file():
        return
    marker = cpath / ".clevertree-seeded"
    if marker.is_file():
        return
    review = cpath / "pages" / "general" / "topics" / "general"
    if review.is_dir() and any(review.iterdir()):
        marker.write_text("ok\n")
        return
    try:
        import importlib.util

        seed_path = ROOT / "scripts" / "seed_live_comments_from_fixtures.py"
        spec = importlib.util.spec_from_file_location("seed_live_comments", seed_path)
        if spec and spec.loader:
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            mod.seed(cpath)
            marker.write_text("ok\n")
    except Exception:
        # Fixtures optional in slim checkouts
        pass


def _persist() -> None:
    if _store is None or _service is None:
        return
    with _lock:
        _store.save(_service.debate, _service.auth)
    _publish_mesh()


def _publish_mesh() -> None:
    """Best-effort push of the comments tip to catalog remotes (iad1 / forge)."""
    raw = os.environ.get("CLEVERTREE_PUBLISH_REMOTES", "").strip()
    if not raw or _service is None:
        return
    remotes = [r for r in raw.replace(",", " ").split() if r]
    if not remotes:
        return
    try:
        _service.debate.publish(remotes)
    except Exception:
        # Mesh publish must never fail the live submit/drain path.
        pass


def identify(visitor: str = "") -> dict:
    raw = (visitor or "").strip()
    if raw:
        try:
            parsed = str(uuidlib.UUID(raw))
            _visitors.add(parsed)
            return {"visitor": parsed, "created": False}
        except ValueError as exc:
            raise ValueError("visitor must be a UUID") from exc
    minted = str(uuidlib.uuid4())
    _visitors.add(minted)
    return {"visitor": minted, "created": True}


def _page_title(norm: str, href: str = "") -> str:
    raw = href or norm
    try:
        if "://" in raw:
            parts = urlparse(raw)
            host = (parts.hostname or "").lower().removeprefix("www.")
            path = parts.path or ""
        else:
            bits = norm.split("/", 2)
            host = bits[1] if len(bits) > 1 else norm
            path = "/" + bits[2].split("?", 1)[0] if len(bits) > 2 else ""
        path = path.rstrip("/") if path not in ("", "/") else ""
        label = host + path
        return label[:64] + ("…" if len(label) > 64 else "")
    except Exception:
        return (norm or "This page")[:64]


def resolve_page(
    url: str = "",
    normalized: str = "",
    visitor: str = "",
    page_scope: str = "",
) -> dict:
    ident = identify(visitor)
    raw = (url or "").strip()
    norm_in = (normalized or "").strip()
    scope = (page_scope or "").strip().lower()
    hay = f"{raw} {norm_in}".lower()
    for slug, title in STARTER_TITLES.items():
        if slug in hay:
            _pages[slug] = {"url": raw, "normalized": slug, "title": title}
            view = view_topic(slug, ident["visitor"])
            return {
                "visitor": ident["visitor"],
                "visitor_created": ident["created"],
                "topic": slug,
                "guided": False,
                "url": raw,
                "normalized": slug,
                "title": title,
                "exists": bool(view.get("exists")),
                "view": view,
                "page_scope": scope or "path",
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

    # Extension: whole registrable domain → one debate (collapse path + query).
    if scope in {"domain", "site", "host"}:
        norm = _domain_only_norm(norm, raw)

    topic = "u-" + hashlib.sha256(norm.encode("utf-8")).hexdigest()[:16]
    title = _page_title(norm, raw)
    _pages[topic] = {"url": raw, "normalized": norm, "title": title}
    view = view_topic(topic, ident["visitor"])
    return {
        "visitor": ident["visitor"],
        "visitor_created": ident["created"],
        "topic": topic,
        "guided": False,
        "url": raw,
        "normalized": norm,
        "title": title,
        "exists": bool(view.get("exists")),
        "view": view,
        "page_scope": scope or "path",
    }


def _domain_only_norm(norm: str, raw: str = "") -> str:
    """Collapse a normalized URL (or href) to suffix/host/ only."""
    try:
        if raw.startswith("http://") or raw.startswith("https://"):
            parts = urlparse(raw)
            host = (parts.hostname or "").lower().removeprefix("www.")
            if host:
                # Re-normalize via full URL with path /
                return normalize_url(f"{parts.scheme}://{host}/")
        # norm shape: publicSuffix/host/path?...
        bits = norm.split("/", 2)
        if len(bits) >= 2:
            return f"{bits[0]}/{bits[1]}/"
    except Exception:
        pass
    return norm


def view_topic(topic: str, visitor: str = "", focus: str = "") -> dict:
    service = open_service()
    with _lock:
        view = service.view_for_page(page_for_topic(topic), topic, focus=focus, visitor=visitor)
    page = _pages.get(topic) or {}
    view = dict(view)
    view["guided"] = False
    page_title = page.get("title") or STARTER_TITLES.get(topic, topic)
    view["page"] = {
        "url": page.get("url") or "",
        "normalized": page.get("normalized") or topic,
        "title": page_title,
    }
    visitor_row = dict(view.get("visitor") or {})
    visitor_row.setdefault("uuid", visitor or "")
    view["visitor"] = visitor_row
    _apply_room_chrome(topic, view, fallback_title=str(page_title or "Public IRC room"))
    try:
        from clevertree_chat.tracked_problems import tracked_problems_for_topic

        view["tracked_problems"] = tracked_problems_for_topic(topic)
    except Exception:
        view.setdefault("tracked_problems", [])
    return view


def _apply_room_chrome(topic: str, view: dict, *, fallback_title: str) -> None:
    """SI rail chrome from IRC TOPIC + pin METADATA (via irc_chrome cache)."""
    from clevertree_chat.irc_client import channel_for_topic

    try:
        from clevertree_chat import irc_chrome

        chrome = irc_chrome.snapshot_for_hello(topic)
    except Exception:
        chrome = {}
    topic_text = str(chrome.get("topic_text") or "").strip()
    pin = chrome.get("pin") if isinstance(chrome.get("pin"), dict) else None
    pin_body = str((pin or {}).get("body") or "").strip()
    try:
        ch = channel_for_topic("ct", topic)
    except Exception:
        ch = f"#{topic}" if topic else "#web"
    # Title = IRC TOPIC (fallback only when TOPIC not yet known).
    title = topic_text or (fallback_title or "").strip()
    if not title or title == (topic or "").strip():
        title = "Public IRC room" if (topic or "").strip() in {"", "web"} else title or ch
    # Subtitle = pinned PRIVMSG body, else #channel.
    subtitle = pin_body or ch
    view["title"] = title
    view["subtitle"] = subtitle
    view["topic_text"] = topic_text
    view["pin"] = pin
    view["channel"] = chrome.get("channel") or ch


def _idempotency_path() -> Path:
    env = (os.environ.get("CLEVERTREE_LIVE_ROOT") or "").strip()
    root = Path(env) if env else (ROOT / "var" / "clevertree-live")
    root.mkdir(parents=True, exist_ok=True)
    return root / "submit-idempotency.json"


def _load_idempotency() -> dict:
    path = _idempotency_path()
    if not path.is_file():
        return {}
    try:
        import json

        data = json.loads(path.read_text(encoding="utf-8") or "{}")
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save_idempotency(data: dict) -> None:
    import json

    path = _idempotency_path()
    keys = list(data.keys())
    if len(keys) > 2000:
        for old in keys[: len(keys) - 2000]:
            data.pop(old, None)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def dispatch(
    payload: dict, query: dict, cookie: str = "", headers: dict | None = None
) -> tuple[int, dict]:
    action = payload.get("action") or query.get("action") or "view"
    visitor = str(payload.get("visitor") or query.get("visitor") or "")
    topic = str(payload.get("topic") or query.get("topic") or "").strip()

    if action == "identify":
        return 200, identify(visitor)
    if action == "resolve":
        return 200, resolve_page(
            url=str(payload.get("url") or query.get("url") or ""),
            normalized=str(payload.get("normalized") or query.get("normalized") or ""),
            visitor=visitor,
            page_scope=str(payload.get("page_scope") or query.get("page_scope") or ""),
        )
    if action == "topics":
        return 200, {
            "topics": list(STARTER_TOPICS) + list(REVIEW_TOPICS),
        }
    if action in {"channels", "list_channels"}:
        return 200, {"channels": list_known_channels()}
    if action in {"replay", "advance", "play"}:
        return 400, {"error": "scripted demo actions removed; use live submit"}

    if not topic:
        topic = STARTER_TOPICS[0]

    service = open_service()
    page = page_for_topic(topic)
    session = _session(cookie, visitor)

    if action == "preview":
        with _lock:
            result = service.preview_for_page(page, topic, str(payload.get("body") or ""))
        return 200, result

    if action == "submit":
        # Manual !investigate — Free-tier text SI; never a debate claim.
        raw_body = str(payload.get("body") or "").strip()
        try:
            from clevertree_chat import investigate
            from clevertree_chat.channel_asr import default_channel_reply

            focus = investigate.parse_command(raw_body)
            if focus is not None:
                nick = str(payload.get("name") or "").strip()
                try:
                    from clevertree_chat import irc_log_cache

                    irc_log_cache.append_line(
                        topic,
                        body=raw_body,
                        visitor=visitor,
                        source="web",
                        nick=nick,
                    )
                except Exception:
                    pass
                inv = investigate.request_investigate(
                    topic,
                    focus=focus,
                    nick=nick,
                    visitor=visitor,
                    source="web",
                    reply=default_channel_reply,
                )
                if inv.get("ok"):
                    try:
                        drain_investigate_jobs(limit=1)
                    except Exception:
                        pass
                return 200, {
                    "ok": True,
                    "investigate": True,
                    "queued": bool(inv.get("ok")),
                    "reason": inv.get("reason") or "",
                    "message": inv.get("message") or "",
                    "job_id": inv.get("job_id"),
                    "view": view_topic(
                        topic,
                        visitor,
                        str(query.get("subtopic") or payload.get("subtopic") or ""),
                    ),
                }
        except Exception:
            pass
        chosen = payload.get("chosen")
        if chosen is not None:
            chosen = str(chosen).strip() or None
        hdrs = {str(k).lower(): str(v) for k, v in (headers or {}).items()}
        raw_idem = (hdrs.get("idempotency-key") or "").strip() or str(
            payload.get("client_post_id") or ""
        ).strip()
        idem = raw_idem[:128] if raw_idem else ""
        if idem:
            with _lock:
                prior = _load_idempotency().get(idem)
            if isinstance(prior, dict) and prior.get("topic") == topic:
                # Rebuild a fresh view for the same logical post; do not re-file.
                view = view_topic(
                    topic,
                    visitor,
                    str(query.get("subtopic") or payload.get("subtopic") or ""),
                )
                replay = {
                    **{k: v for k, v in prior.items() if k != "view"},
                    "view": view,
                    "idempotent_replay": True,
                }
                return 200, replay
        body_text = str(payload.get("body") or "")
        from clevertree_chat.claim_queue import enqueue_claim, room_queue_only

        if room_queue_only():
            # Room = claim queue: IRC/WS + ephemeral claim JSON only — no SoT commit.
            claim = enqueue_claim(
                topic=topic,
                page=page,
                body=body_text,
                visitor=visitor,
                source=str(payload.get("source") or "web"),
                nick=str(payload.get("name") or "").strip(),
                chosen=chosen,
                client_post_id=idem,
            )
            with _lock:
                view = view_topic(
                    topic,
                    visitor,
                    str(query.get("subtopic") or payload.get("subtopic") or ""),
                )
                result = {
                    "ok": True,
                    "queued": True,
                    "room_queue": True,
                    "comment_id": claim["id"],
                    "id": claim["id"],
                    "starting": "uncategorized",
                    "placed": False,
                    "body": body_text,
                    "view": view,
                }
                _note_provisional_association(service, topic)
                if idem:
                    slim = {k: v for k, v in result.items() if k != "view"}
                    slim["topic"] = topic
                    slim["body"] = body_text
                    store = _load_idempotency()
                    store[idem] = slim
                    _save_idempotency(store)
            return 200, result

        with _lock:
            result = service.submit_for_page(
                page,
                visitor,
                topic,
                body_text,
                chosen=chosen,
                name=payload.get("name"),
                session=session,
            )
            _note_provisional_association(service, topic)
            if idem:
                slim = {
                    k: v
                    for k, v in result.items()
                    if k != "view"
                }
                slim["topic"] = topic
                slim["body"] = body_text
                store = _load_idempotency()
                store[idem] = slim
                _save_idempotency(store)
        _persist()
        _kick_drain()
        return 200, result

    if action == "drain":
        with _lock:
            result = service.drain_for_page(page, topic, visitor)
        _persist()
        return 200, result

    if action == "vote":
        with _lock:
            result = service.vote(
                visitor,
                topic=topic,
                level=str(payload.get("level") or ""),
                key=payload.get("key"),
                comment=payload.get("comment"),
                session=session,
            )
        # vote uses hardcoded PAGE in service — patch via vote_for_page below if needed
        _persist()
        return 200, result

    if action == "name":
        with _lock:
            result = service.set_name(visitor, str(payload.get("name") or ""), topic, session=session)
        _persist()
        return 200, result

    if action == "chat_history":
        from clevertree_chat import irc_log_cache

        limit = payload.get("limit") or query.get("limit")
        try:
            lim = int(limit) if limit is not None else None
        except (TypeError, ValueError):
            lim = None
        return 200, {
            "topic": topic,
            "chat_history": irc_log_cache.recent(topic, limit=lim),
        }

    if action in {"irc_chrome", "channel_chrome"}:
        from clevertree_chat import irc_chrome

        return 200, {"ok": True, "topic": topic, **irc_chrome.snapshot_for_hello(topic)}

    if action in {"set_topic", "irc_set_topic"}:
        from clevertree_chat import irc_chrome

        return 200, irc_chrome.privileged_set_topic(
            topic,
            str(payload.get("topic_text") or payload.get("text") or ""),
            actor={
                "visitor": str(payload.get("visitor") or ""),
                "nick": str(payload.get("nick") or ""),
                "token": str(payload.get("ops_token") or payload.get("token") or ""),
            },
        )

    if action in {"set_pin", "irc_set_pin"}:
        from clevertree_chat import irc_chrome

        return 200, irc_chrome.privileged_set_pin(
            topic,
            str(payload.get("msgid") or ""),
            body=str(payload.get("body") or ""),
            actor={
                "visitor": str(payload.get("visitor") or ""),
                "nick": str(payload.get("nick") or ""),
                "token": str(payload.get("ops_token") or payload.get("token") or ""),
            },
        )

    if action == "drain_irc_logs":
        results = drain_irc_log_jobs(limit=int(payload.get("limit") or 20))
        return 200, {"results": results, "count": len(results)}

    if action == "drain_channel_asr":
        results = drain_channel_asr_jobs(limit=int(payload.get("limit") or 5))
        return 200, {"results": results, "count": len(results)}

    if action == "drain_channel_media_review":
        results = drain_channel_media_review_jobs(limit=int(payload.get("limit") or 5))
        return 200, {"results": results, "count": len(results)}

    if action == "media_review_status":
        from clevertree_chat import channel_media_review

        url = str(payload.get("url") or query.get("url") or "")
        sha = str(payload.get("sha") or query.get("sha") or "")
        if not url and not sha:
            return 400, {"error": "url_or_sha_required"}
        if sha:
            stored = channel_media_review.read_review(sha)
            return 200, {"sha": sha, "review": stored}
        status = channel_media_review.get_review_status(url, sha=sha)
        return 200, {
            "url": url,
            "sha": channel_media_review.sha_for_url(url, sha),
            "status": status,
            "review": channel_media_review.read_review(
                channel_media_review.sha_for_url(url, sha)
            ),
        }

    if action == "drain_investigate":
        results = drain_investigate_jobs(limit=int(payload.get("limit") or 3))
        return 200, {"results": results, "count": len(results)}

    if action == "quota_status":
        from clevertree_chat import quota

        return 200, quota.status()

    if action == "provider_status":
        from clevertree_chat.providers import provider_status

        return 200, provider_status()

    if action == "text_complete":
        # Ops / Phase-2 text SI probe — Groq first, Bedrock on rate-limit failover.
        from clevertree_chat.providers import ProviderError, complete_text

        messages = payload.get("messages")
        if not isinstance(messages, list) or not messages:
            prompt = str(payload.get("prompt") or payload.get("body") or "").strip()
            if not prompt:
                return 400, {"ok": False, "error": "messages_or_prompt_required"}
            messages = [{"role": "user", "content": prompt}]
        try:
            result = complete_text(
                [{"role": str(m.get("role") or "user"), "content": str(m.get("content") or "")} for m in messages if isinstance(m, dict)],
                temperature=float(payload.get("temperature") or 0.2),
                max_tokens=int(payload.get("max_tokens") or 1024),
                response_json=bool(payload.get("response_json")),
            )
        except ProviderError as exc:
            return 502, {
                "ok": False,
                "error": str(exc),
                "provider": exc.provider,
                "status": exc.status,
            }
        return 200, {
            "ok": True,
            "text": result.text,
            "provider": result.provider,
            "model": result.model,
            "failover": result.failover,
        }

    view = view_topic(
        topic, visitor, str(query.get("subtopic") or payload.get("subtopic") or "")
    )
    return 200, view


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


def _note_provisional_association(service: DebateService, topic: str) -> None:
    """On first words for a URL room, record provisional page id in associations.json.

    Batch later merges/links. Resolve/view never write this — only submit does.
    """
    meta = _pages.get(topic) or {}
    norm = str(meta.get("normalized") or "").strip()
    if not norm or not str(topic).startswith("u-"):
        return
    try:
        root = service.debate.repo.path
        graph = load_graph(root)
        row = ensure_page(graph, norm, kind="topic")
        row["topic"] = topic
        if meta.get("url"):
            row["url"] = meta["url"]
        before = (root / ASSOCIATIONS_FILE).read_text() if (root / ASSOCIATIONS_FILE).is_file() else ""
        after = dump_graph(graph)
        if after == before:
            return
        service.debate.repo.commit_changes(
            {ASSOCIATIONS_FILE: after},
            [],
            "note provisional url page",
            SERVICE_ID,
        )
    except Exception:
        # Association graph is best-effort; submit already succeeded.
        pass


def run_drain_once() -> dict | None:
    service = open_service()
    with _lock:
        result = service.debate.drain()
        hooks = {}
        if result.commits:
            try:
                from clevertree_chat.batch_hooks import after_drain

                hooks = after_drain(service.debate)
            except Exception:
                hooks = {"error": "hooks_failed"}
            _persist()
        return {
            "hardware_should_shut_down": result.hardware_should_shut_down,
            "message": result.message,
            "commits": result.commits,
            "hooks": hooks,
        }


def _kick_drain() -> None:
    """Wake the background worker promptly after submit."""
    # Worker polls; a short sleep interval handles this. Optional nudge via event.
    pass


def start_drain_worker(interval_s: float = 2.0) -> None:
    global _drain_thread
    if _drain_thread and _drain_thread.is_alive():
        return
    _drain_stop.clear()

    def loop() -> None:
        last_topics: set[str] = set()
        ticks = 0
        while not _drain_stop.is_set():
            try:
                service = open_service()
                dirty = _dirty_topics(service)
                if dirty:
                    with _lock:
                        drained = service.debate.drain()
                    if drained.commits:
                        try:
                            from clevertree_chat.batch_hooks import after_drain

                            after_drain(service.debate, topics=list(dirty))
                        except Exception:
                            pass
                        _persist()
                        notice = drained.message or "Organized."
                        for topic in dirty:
                            view = view_topic(topic)
                            HUB.broadcast(
                                topic,
                                {
                                    "type": "batch.notice",
                                    "topic": topic,
                                    "notice": notice,
                                    "view": view,
                                },
                            )
                            HUB.broadcast(
                                topic,
                                {"type": "board.snapshot", "topic": topic, "view": view},
                            )
                            last_topics.add(topic)
                # IRC log rotate/enqueue often; accept into SoT on a slower tick
                ticks += 1
                try:
                    from clevertree_chat import irc_log_cache

                    irc_log_cache.rotate_if_needed()
                    if ticks % 15 == 0:  # ~30s at 2s interval
                        drain_irc_log_jobs(limit=10)
                except Exception:
                    pass
                # Channel media ASR (Groq when GROQ_API_KEY set)
                try:
                    if ticks % 5 == 0:  # ~10s
                        drain_channel_asr_jobs(limit=2)
                except Exception:
                    pass
                # Media review covers (Groq vision) — slower slice, lower concurrency
                try:
                    if ticks % 8 == 0:  # ~16s
                        drain_channel_media_review_jobs(limit=1)
                except Exception:
                    pass
                # Manual !investigate text SI (Groq→Bedrock)
                try:
                    if ticks % 7 == 0:
                        drain_investigate_jobs(limit=1)
                except Exception:
                    pass
            except Exception:
                pass
            _drain_stop.wait(interval_s)

    _drain_thread = threading.Thread(target=loop, name="clevertree-drain", daemon=True)
    _drain_thread.start()


def stop_drain_worker() -> None:
    _drain_stop.set()


def _dirty_topics(service: DebateService) -> list[str]:
    """Topics with a dirty job.json under pages/*/."""
    root = service.debate.repo.path / "pages"
    found: list[str] = []
    if not root.is_dir():
        return found
    for page_dir in root.iterdir():
        if not page_dir.is_dir():
            continue
        job = page_dir / "job.json"
        if not job.is_file():
            continue
        try:
            import json

            data = json.loads(job.read_text())
            if str(data.get("status") or "") != "dirty":
                continue
            topics = data.get("topics") or []
            if topics:
                found.extend(str(t) for t in topics)
            else:
                topics_root = page_dir / "topics"
                if topics_root.is_dir():
                    found.extend(p.name for p in topics_root.iterdir() if p.is_dir())
        except Exception:
            topics_root = page_dir / "topics"
            if topics_root.is_dir():
                found.extend(p.name for p in topics_root.iterdir() if p.is_dir())
    return sorted(set(found))


def list_known_channels() -> list[dict]:
    """IRC-style channel catalog for the room switcher (policy + craft + live logs)."""
    import json

    from clevertree_chat.irc_client import CRAFT_CHANNELS, PUBLIC_WEB_CHANNEL, channel_for_topic

    titles = {
        "#web": "Clevertree Chat · public web",
        "#pt": "Paradigm Threat",
        "#mp-general": "MyProblem general",
        "#ga-savannah-cat-rescue": "Savannah Cat Rescue",
        "#songwalker": "SongWalker",
        "#snesology": "SNESology",
    }
    by_ch: dict[str, dict] = {}

    def add(channel: str, *, topic: str = "", title: str = "", source: str = "") -> None:
        ch = (channel or "").strip()
        if not ch:
            return
        if not ch.startswith("#"):
            ch = "#" + ch
        slug = ch.lstrip("#").lower()
        topic_slug = (topic or slug).strip().lower() or slug
        row = by_ch.get(ch) or {
            "channel": ch,
            "topic": topic_slug,
            "title": titles.get(ch) or title or ch,
            "source": source or "known",
        }
        if title and (not row.get("title") or row["title"] == ch):
            row["title"] = title
        if source:
            row["source"] = source
        by_ch[ch] = row

    add(PUBLIC_WEB_CHANNEL, topic="web", title=titles["#web"], source="policy")
    add("#pt", topic="general", title=titles["#pt"], source="policy")
    for topic, ch in CRAFT_CHANNELS.items():
        add(ch, topic=topic, title=titles.get(ch, ""), source="craft")

    policy_path = ROOT / "fronts" / "room" / "channel-policy.json"
    try:
        policy = json.loads(policy_path.read_text(encoding="utf-8"))
    except Exception:
        policy = {}
    repos = policy.get("repos") if isinstance(policy, dict) else {}
    if isinstance(repos, dict):
        for repo_name, repo in repos.items():
            if not isinstance(repo, dict):
                continue
            default = str(repo.get("default_channel") or "").strip()
            if default:
                add(default, source="policy")
            channels = repo.get("channels")
            if isinstance(channels, list):
                for item in channels:
                    if isinstance(item, str):
                        add(item, source="policy")
            elif isinstance(channels, dict):
                for key, meta in channels.items():
                    if isinstance(meta, dict):
                        irc = str(meta.get("irc_channel") or "").strip() or f"#{key}"
                        add(
                            irc,
                            topic=str(key),
                            title=str(meta.get("title") or ""),
                            source=f"policy:{repo_name}",
                        )
                    elif isinstance(meta, str):
                        add(meta, topic=str(key), source=f"policy:{repo_name}")

    # Live log dirs (rooms that have spoken recently / ever on this host).
    try:
        from clevertree_chat import irc_log_cache

        logs = irc_log_cache.irc_logs_dir()
        if logs.is_dir():
            for path in logs.iterdir():
                if not path.is_dir():
                    continue
                topic = path.name
                try:
                    ch = channel_for_topic("pt", topic)
                except Exception:
                    ch = f"#{topic}"
                add(ch, topic=topic, source="live")
    except Exception:
        pass

    # Stable order: policy defaults first, then alpha.
    preferred = ["#web", "#pt", "#mp-general", "#ga-savannah-cat-rescue"]
    ordered: list[dict] = []
    seen: set[str] = set()
    for ch in preferred:
        if ch in by_ch and ch not in seen:
            ordered.append(by_ch[ch])
            seen.add(ch)
    for ch in sorted(by_ch.keys()):
        if ch not in seen:
            ordered.append(by_ch[ch])
            seen.add(ch)
    return ordered


def fanout_submit(
    topic: str,
    visitor: str,
    body: dict,
    *,
    source: str = "web",
    nick: str = "",
    msgid: str = "",
    client_id: str = "",
) -> None:
    """Broadcast post.live after a successful submit; mirror to IRC when bridged."""
    view = body.get("view") or view_topic(topic, visitor)
    filed = str(body.get("comment_id") or body.get("id") or "")
    starting = body.get("starting") or "uncategorized"
    text = body.get("body") or ""
    author = (view.get("visitor") or {}).get("name") or "Visitor"
    client_id = str(client_id or "").strip()
    # IRC bridge already appended the wire line (+ msgid) before submit.
    if source != "irc":
        try:
            from clevertree_chat import irc_log_cache

            irc_log_cache.append_line(
                topic,
                body=str(text),
                visitor=str(visitor or ""),
                source=source,
                nick=nick or str(author),
                msgid=msgid,
            )
        except Exception:
            pass
    # Channel media → ASR queue (no tip mint). Drain posts transcript when keys exist.
    try:
        from clevertree_chat import channel_asr

        channel_asr.enqueue_from_body(
            topic,
            str(text),
            visitor=str(visitor or ""),
            source=source,
            nick=nick or str(author),
        )
    except Exception:
        pass
    # Visual media → review queue (cover until AI clear).
    try:
        from clevertree_chat import channel_media_review

        channel_media_review.enqueue_from_body(
            topic,
            str(text),
            visitor=str(visitor or ""),
            source=source,
            nick=nick or str(author),
        )
    except Exception:
        pass
    chat_line = {
        "ts": None,
        "topic": topic,
        "visitor": visitor,
        "nick": nick or str(author),
        "body": text,
        "source": source,
    }
    if client_id:
        chat_line["client_id"] = client_id
    payload = {
        "type": "post.live",
        "topic": topic,
        "comment": {
            "id": filed,
            "author": author,
            "author_uuid": visitor,
            "body": text,
            "keys": [],
            "starting": starting,
            "placed": False,
            "mine": True,
            "injected": False,
            "kind": "post",
        },
        "view": view,
        "activity": activity_from_view(view, visitor),
        "chat_line": chat_line,
    }
    if client_id:
        payload["client_id"] = client_id
    HUB.broadcast(topic, payload)
    try:
        from clevertree_chat.irc_bridge import get_bridge

        bridge = get_bridge()
        if bridge is not None:
            bridge.announce_submit(topic, str(text), str(author))
    except Exception:
        pass


def drain_irc_log_jobs(*, limit: int = 20) -> list[dict]:
    """Rotate aged segments and accept pending irc_log jobs into comments SoT."""
    from clevertree_chat import chat_transcript, irc_log_cache

    irc_log_cache.rotate_if_needed()
    service = open_service()
    results = []
    for job in irc_log_cache.list_pending_jobs()[:limit]:
        try:
            result = chat_transcript.accept_irc_log_job(
                service.debate,
                job,
                rules=service.debate.rules(),
            )
            job_path = job.get("_job_path")
            if job_path:
                status = "accepted" if result.get("ok") else "failed"
                if result.get("reason") == "chat_store:never":
                    status = "skipped"
                irc_log_cache.mark_job(job_path, status, result=result)
            results.append({"job": job.get("id"), **result})
            _persist()
        except Exception as exc:
            job_path = job.get("_job_path")
            if job_path:
                irc_log_cache.mark_job(job_path, "failed", error=str(exc))
            results.append({"job": job.get("id"), "ok": False, "reason": str(exc)})
    return results


def drain_channel_asr_jobs(*, limit: int = 5) -> list[dict]:
    """Drain pending [[mp:media]] ASR jobs; reply in-channel (no tip mint)."""
    from clevertree_chat import channel_asr

    return channel_asr.process_pending(
        limit=limit,
        reply=channel_asr.default_channel_reply,
    )


def drain_channel_media_review_jobs(*, limit: int = 5) -> list[dict]:
    """Drain pending media review jobs; broadcast media.review on clear/reject."""
    from clevertree_chat import channel_media_review

    return channel_media_review.process_pending(
        limit=limit,
        broadcast=channel_media_review.default_broadcast,
    )


def drain_investigate_jobs(*, limit: int = 3) -> list[dict]:
    """Drain pending !investigate jobs; reply in-channel (no tip mint / no debate dirty)."""
    from clevertree_chat import channel_asr, investigate

    return investigate.process_pending(
        limit=limit,
        reply=channel_asr.default_channel_reply,
    )
