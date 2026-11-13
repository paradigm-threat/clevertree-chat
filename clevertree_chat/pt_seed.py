"""Load Paradigm Threat filed pages into in-memory demo boards for review."""

from __future__ import annotations

import json
import os
from pathlib import Path

# First review surfaces (owner answer to process Q26).
REVIEW_TOPICS = ("5g", "geoengineering", "general")

REVIEW_TITLES = {
    "5g": "5G — filed backlog (review)",
    "geoengineering": "Geoengineering — filed backlog (review)",
    "general": "General — filed backlog (review)",
}

# Cap huge rooms so the demo board stays usable.
MAX_COMMENTS_PER_KEY = {
    "5g": 200,
    "geoengineering": 200,
    "general": 25,
}


def comments_root() -> Path | None:
    env = (os.environ.get("CLEVERTREE_PT_COMMENTS") or "").strip()
    if env:
        path = Path(env)
        if path.is_dir():
            return path
    sibling = Path(__file__).resolve().parents[1].parent / "clevertree-chat-comments"
    if sibling.is_dir() and (sibling / "pages").is_dir():
        return sibling
    fixture = Path(__file__).resolve().parents[1] / "fixtures" / "pt-review"
    if fixture.is_dir():
        return fixture
    return None


def fixture_root() -> Path | None:
    fixture = Path(__file__).resolve().parents[1] / "fixtures" / "pt-review"
    if fixture.is_dir():
        return fixture
    return None


def _split_comment(text: str) -> tuple[dict[str, str], str]:
    lines = text.splitlines()
    headers: dict[str, str] = {}
    index = 0
    while index < len(lines) and lines[index].strip():
        if ":" not in lines[index]:
            break
        key, value = lines[index].split(":", 1)
        headers[key.strip()] = value.strip()
        index += 1
    if index < len(lines) and not lines[index].strip():
        index += 1
    return headers, "\n".join(lines[index:]).strip()


def _load_from_tree(root: Path, topic: str) -> dict | None:
    topic_dir = root / "pages" / topic / "topics" / topic
    if not topic_dir.is_dir():
        return None
    users: dict[str, str] = {}
    users_path = root / "users" / "index.json"
    if users_path.is_file():
        index = json.loads(users_path.read_text(encoding="utf-8"))
        for _uuid, row in (index.get("by_uuid") or {}).items():
            users[str(row.get("id"))] = str(row.get("name") or "Anonymous")

    positions: dict[str, str] = {}
    comments: list[dict] = []
    keys: list[str] = []
    cap = MAX_COMMENTS_PER_KEY.get(topic, 50)
    next_id = 1
    for key_dir in sorted(topic_dir.iterdir()):
        if not key_dir.is_dir():
            continue
        if not (key_dir / "comments").exists():
            continue
        key = key_dir.name
        keys.append(key)
        position_path = key_dir / "position.md"
        positions[key] = position_path.read_text(encoding="utf-8").strip() if position_path.exists() else ""
        paths = sorted(
            (key_dir / "comments").glob("*.md"),
            key=lambda path: (int(path.stem) if path.stem.isdigit() else 0, path.stem),
        )
        for path in paths[:cap]:
            headers, body = _split_comment(path.read_text(encoding="utf-8", errors="replace"))
            author_id = headers.get("author", "")
            comments.append(
                {
                    "id": str(next_id),
                    "author_name": users.get(author_id, f"user-{author_id}" if author_id else "Anonymous"),
                    "author_uuid": "",
                    "body": body or "(no text)",
                    "starting": headers.get("starting") or key,
                    "keys": [key],
                    "placed": True,
                    "injected": False,
                }
            )
            next_id += 1
    pairs_path = topic_dir / "pairs.json"
    pairs = []
    if pairs_path.is_file():
        pairs = json.loads(pairs_path.read_text(encoding="utf-8")).get("pairs") or []
    keys = sorted(keys, key=lambda item: (item in {"other", "uncategorized"}, item))
    return {
        "topic": topic,
        "title": REVIEW_TITLES.get(topic, topic),
        "positions": positions,
        "comments": comments,
        "keys": keys,
        "pairs": pairs,
    }


def load_page_payload(topic: str) -> dict | None:
    """Return a board-ready payload from the comments tree or a JSON fixture."""
    root = comments_root()
    if root is not None:
        payload = _load_from_tree(root, topic)
        if payload is not None:
            return payload
    fixtures = fixture_root()
    if fixtures and (fixtures / f"{topic}.json").is_file():
        return json.loads((fixtures / f"{topic}.json").read_text(encoding="utf-8"))
    return None


def apply_payload(state: dict, payload: dict, positions_target: dict) -> None:
    """Hydrate an empty demo board from a PT payload."""
    state["exists"] = True
    state["script_complete"] = True
    state["last_notice"] = "Filed Paradigm Threat backlog (read/review)."
    state["comments"] = list(payload.get("comments") or [])
    state["keys"] = list(payload.get("keys") or [])
    state["pairs"] = [list(pair) for pair in (payload.get("pairs") or [])]
    state["page"] = {
        "url": f"https://paradigmthreat.net/{payload.get('topic')}",
        "normalized": f"paradigmthreat.net/{payload.get('topic')}",
        "title": payload.get("title") or REVIEW_TITLES.get(payload.get("topic", ""), ""),
    }
    positions_target.clear()
    positions_target.update(payload.get("positions") or {})


def export_fixture(topic: str, dest: Path) -> Path:
    payload = load_page_payload(topic)
    if payload is None:
        raise SystemExit(f"cannot load {topic}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return dest
