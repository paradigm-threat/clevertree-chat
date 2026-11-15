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


def page_for_topic(topic: str) -> str:
    """PT review rooms use page==topic; product/extension topics live under try."""
    t = (topic or "").strip()
    if t in REVIEW_TOPICS:
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
    view["page"] = {
        "url": page.get("url") or "",
        "normalized": page.get("normalized") or topic,
        "title": page.get("title") or STARTER_TITLES.get(topic, topic),
    }
    visitor_row = dict(view.get("visitor") or {})
    visitor_row.setdefault("uuid", visitor or "")
    view["visitor"] = visitor_row
    return view


def dispatch(payload: dict, query: dict, cookie: str = "") -> tuple[int, dict]:
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
        chosen = payload.get("chosen")
        if chosen is not None:
            chosen = str(chosen).strip() or None
        with _lock:
            result = service.submit_for_page(
                page,
                visitor,
                topic,
                str(payload.get("body") or ""),
                chosen=chosen,
                name=payload.get("name"),
                session=session,
            )
            _note_provisional_association(service, topic)
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


def fanout_submit(topic: str, visitor: str, body: dict) -> None:
    """Broadcast post.live after a successful submit; mirror to IRC when bridged."""
    view = body.get("view") or view_topic(topic, visitor)
    filed = str(body.get("comment_id") or body.get("id") or "")
    starting = body.get("starting") or "uncategorized"
    text = body.get("body") or ""
    author = (view.get("visitor") or {}).get("name") or "Visitor"
    HUB.broadcast(
        topic,
        {
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
        },
    )
    try:
        from clevertree_chat.irc_bridge import get_bridge

        bridge = get_bridge()
        if bridge is not None:
            bridge.announce_submit(topic, str(text), str(author))
    except Exception:
        pass
