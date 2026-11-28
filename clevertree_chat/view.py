"""A public reading of one topic. It does not create a topic or a key."""

from __future__ import annotations

import re

from clevertree_chat.engine import UNCATEGORIZED, split_comment
from clevertree_chat.markdown_render import render_markdown
from clevertree_chat.public import FILING

_FIELD = re.compile(r"^([A-Za-z][A-Za-z \-]*):\s*(\S.*)$", re.MULTILINE)


def build_view(debate, *, page: str, topic: str, focus: str = "", visitor: str = "") -> dict:
    from clevertree_chat.keys import assert_short_key, slugify

    topic_key = assert_short_key(slugify(topic)) if str(topic or "").strip() else ""
    if not topic_key:
        return _empty("", focus)
    root = debate.repo.path / "pages" / page / "topics" / topic_key
    if not root.is_dir():
        return _empty(topic_key, focus)
    policy = debate.policy()
    names, mine = _names(debate, visitor)
    keys = debate._keys(page, topic_key)
    sections = {}
    for key in keys:
        sections[key] = _section(debate, page, topic_key, key, names, mine, policy)
    pairs = _pairs(debate, page, topic_key, keys)
    return {
        "topic": topic_key,
        "exists": True,
        "focus": focus if focus in keys else "",
        "missing_focus": bool(focus) and focus not in keys,
        "filing_line": FILING if _has_post(sections) else "",
        "existing": [key for key in keys if key != UNCATEGORIZED],
        "pairs": pairs,
        "sections": sections,
        "suggestions": _suggestions(debate, page, topic_key, keys, policy),
        "notices": _notices(debate, page, mine),
        "visitor": _visitor_row(debate, visitor, names, mine),
        "created": False,
        # Live title/subtitle come from IRC TOPIC + METADATA (irc_chrome), not git.
        "title": "",
        "subtitle": "",
        # Filled by live_runtime.view_topic (demo catalog + tip resolutions).
        "tracked_problems": [],
    }


def _empty(topic: str, focus: str) -> dict:
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
        "visitor": {"name": "", "chosen": False},
        "created": False,
        "title": "",
        "subtitle": "",
        "tracked_problems": [],
    }


def _names(debate, visitor: str) -> tuple[dict[int, str], int | None]:
    index = debate._index()
    names: dict[int, str] = {}
    mine = None
    for user_uuid, row in index.get("by_uuid", {}).items():
        names[int(row["id"])] = row.get("name") or "Visitor"
        if visitor and user_uuid == visitor:
            mine = int(row["id"])
    return names, mine


def _visitor_row(debate, visitor: str, names: dict[int, str], mine: int | None) -> dict:
    if mine is None:
        return {"name": "", "chosen": False}
    index = debate._index()
    row = {}
    for user_uuid, item in index.get("by_uuid", {}).items():
        if user_uuid == visitor:
            row = item
            break
    return {
        "name": names.get(mine, ""),
        "chosen": row.get("name_source") == "chosen",
    }


def _section(debate, page, topic, key, names, mine, policy) -> dict:
    base = f"pages/{page}/topics/{topic}/{key}"
    position = debate._maybe_read(f"{base}/position.md") or ""
    questions = debate._maybe_read(f"{base}/questions.md") or ""
    votes = debate._read_json(f"{base}/votes.json", {"ids": []})
    topic_votes = debate._read_json(f"pages/{page}/topics/{topic}/votes.json", {"ids": []})
    comment_votes = debate._read_json(f"{base}/comment-votes.json", {})
    comments = []
    listing = debate._read_json(f"{base}/listing.json", {"comments": []})
    listed = {
        str(item.get("id")): item for item in (listing.get("comments") or []) if item.get("id")
    }
    directory = debate.repo.path / base / "comments"
    if directory.is_dir():
        for path in sorted(directory.glob("*.md"), key=lambda item: item.stem):
            comments.append(
                _comment_row(
                    path.read_text(),
                    path.stem,
                    key,
                    names,
                    mine,
                    policy,
                    comment_votes,
                    listed.get(path.stem, {}).get("keys") or [key],
                )
            )
    for item in listing.get("comments") or []:
        relative = str(item.get("path") or "")
        if not relative or relative.startswith(f"{key}/"):
            continue
        source = debate.repo.path / "pages" / page / "topics" / topic / relative
        if not source.is_file():
            continue
        home = relative.split("/")[0]
        home_votes = debate._read_json(
            f"pages/{page}/topics/{topic}/{home}/comment-votes.json",
            {},
        )
        comments.append(
            _comment_row(
                source.read_text(),
                str(item.get("id") or source.stem),
                key,
                names,
                mine,
                policy,
                home_votes,
                item.get("keys") or [home, key],
            )
        )
    sub_ids = [int(item) for item in votes.get("ids", [])]
    topic_ids = [int(item) for item in topic_votes.get("ids", [])]
    return {
        "key": key,
        "uncategorized": key == UNCATEGORIZED,
        "position_html": render_markdown(position, policy) if position else "",
        "questions_html": render_markdown(questions, policy) if questions else "",
        "comments": comments,
        "tally": len(sub_ids),
        "mine": mine is not None and mine in sub_ids,
        "topic_tally": len(topic_ids),
        "topic_mine": mine is not None and mine in topic_ids,
    }


def _comment_row(text, comment_id, key, names, mine, policy, votes, keys) -> dict:
    headers, body = split_comment(text)
    author = int(headers["author"])
    voters = [int(item) for item in votes.get(str(comment_id), [])]
    places = [item for item in keys if item] or [key]
    return {
        "id": str(comment_id),
        "author": names.get(author, "Visitor"),
        "html": render_markdown(body, policy),
        "text": body,
        "starting": headers.get("starting") or key,
        "key": key,
        "keys": places,
        "tally": len(voters),
        "mine": mine is not None and mine in voters,
    }


def _pairs(debate, page, topic, keys) -> list[list[str]]:
    payload = debate._read_json(
        f"pages/{page}/topics/{topic}/pairs.json",
        {"pairs": []},
    )
    found = []
    for item in payload.get("pairs") or []:
        if len(item) == 2 and item[0] in keys and item[1] in keys:
            found.append([item[0], item[1]])
    return found


def _suggestions(debate, page, topic, keys, policy) -> list[dict]:
    found = []
    seen = set()
    for key in keys:
        if key == UNCATEGORIZED:
            continue
        text = debate._maybe_read(
            f"pages/{page}/topics/{topic}/{key}/suggested-counter.md"
        )
        if not text:
            continue
        fields = {match.group(1).strip(): match.group(2).strip() for match in _FIELD.finditer(text)}
        partner = fields.get("Opposing one-liner", "")
        citation = fields.get("Citation", "")
        if partner and partner not in keys and partner not in seen:
            seen.add(partner)
            found.append(
                {
                    "from": key,
                    "key": partner,
                    "citation": citation,
                    "html": render_markdown(text, policy),
                    "directory": False,
                }
            )
        unwritten = re.search(r"^Unwritten counter:\s*(\S+)\s+(\S+)", text, re.MULTILINE)
        if unwritten and unwritten.group(1) not in keys and unwritten.group(1) not in seen:
            seen.add(unwritten.group(1))
            found.append(
                {
                    "from": key,
                    "key": unwritten.group(1),
                    "citation": unwritten.group(2),
                    "html": "",
                    "directory": False,
                }
            )
    return found


def _notices(debate, page, mine) -> list[dict]:
    if mine is None:
        return []
    payload = debate._read_json(f"pages/{page}/notifications.json", {"events": []})
    notices = []
    for event in payload.get("events") or []:
        if event.get("kind") == "comment":
            continue
        if int(event.get("subscriber", -1)) != mine:
            continue
        if event.get("kind") not in {"position", "questions", "suggested-counter"}:
            continue
        notices.append(
            {
                "kind": event["kind"],
                "section": event.get("section", ""),
            }
        )
    return notices


def _has_post(sections: dict) -> bool:
    return any(section["comments"] for section in sections.values())
