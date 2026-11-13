"""Composer, votes, and the batch that rewrites a comments branch.

The batch checks out `comments` only. It does not call a cloud API.
When the queue is drained, the result says the hardware should shut down.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from clevertree_chat import SERVICE_ID
from clevertree_chat.classify import (
    assign_keys,
    unwritten_counter,
    build_position,
    build_questions,
    build_suggestion,
    readable_pairs,
    reading_confidence,
    rename_allowed,
    spec,
    summary_confidence,
)
from clevertree_chat.keys import assert_short_key, slugify
from clevertree_chat.names import empty_index, generated_name, issue_id
from clevertree_chat.policy import Policy, parse_policy
from clevertree_chat.public import FILING
from clevertree_chat.repo import CommentsRepo
from clevertree_chat.rules import Rules, parse_rules

LEGALITY = frozenset({"illegal", "legal"})
UNCATEGORIZED = "uncategorized"


def _shared_comment_ids(final: dict[str, list]) -> dict[int, str]:
    """Map a comment object to the one key that stores its file."""
    counts: dict[int, int] = {}
    for comments in final.values():
        for comment in comments:
            counts[id(comment)] = counts.get(id(comment), 0) + 1
    homes: dict[int, str] = {}
    for comment_id, count in counts.items():
        if count < 2:
            continue
        names = sorted(
            key
            for key, comments in final.items()
            if any(id(comment) == comment_id for comment in comments)
        )
        homes[comment_id] = names[0]
    return homes


def _standing_decisions(
    topic: str,
    assigned: dict[int, list[str]],
    final: dict[str, list],
    history: dict[str, str],
    rule_source: str,
) -> list[dict]:
    """The batch's standing readings. Same posts produce the same list."""
    decisions: list[dict] = []
    seen: set[int] = set()
    for key in sorted(final):
        for comment in final[key]:
            if id(comment) in seen:
                continue
            seen.add(id(comment))
            decisions.append(
                {
                    "comment": comment.id,
                    "confidence": reading_confidence(comment.body),
                    "keys": list(assigned.get(id(comment), [])),
                    "kind": "file",
                    "rule": rule_source,
                    "starting": comment.starting,
                }
            )
    for key in sorted(final):
        decisions.append(
            {
                "confidence": summary_confidence(topic, key),
                "key": key,
                "kind": "summary",
                "rule": rule_source,
            }
        )
    for src, dst in sorted(history.items()):
        decisions.append(
            {
                "confidence": "high",
                "from": src,
                "key": dst,
                "kind": "rename",
                "rule": rule_source,
            }
        )
    existing = set(final)
    suggested: list[str] = []
    for key in sorted(existing):
        info = spec(topic, key)
        if not info:
            continue
        partner = info.get("pair")
        if partner and partner not in existing and partner not in suggested:
            suggested.append(partner)
    cited = False
    for key, key_comments in final.items():
        key_bodies = [comment.body for comment in key_comments]
        if key == "illegal" and "legal" not in existing:
            cited = True
        elif unwritten_counter(key_bodies) and "patriot-act" not in existing:
            cited = True
    if cited and "patriot-act" not in suggested:
        suggested.append("patriot-act")
    for name in suggested:
        decisions.append(
            {
                "confidence": "high",
                "created": False,
                "key": name,
                "kind": "suggestion",
                "rule": rule_source,
            }
        )
    decisions.sort(
        key=lambda item: (
            item.get("kind", ""),
            item.get("key", ""),
            item.get("from", ""),
            item.get("comment", ""),
            ",".join(item.get("keys") or []),
        )
    )
    return decisions


def _dump(data) -> str:
    return json.dumps(data, indent=2, sort_keys=True) + "\n"


def _load(text: str):
    return json.loads(text)


@dataclass
class Comment:
    id: str
    author: int
    body: str
    old_key: str = ""
    starting: str = ""


def format_comment(author: int, body: str, starting: str = "") -> str:
    header = f"author: {author}\n"
    if starting:
        header += f"starting: {starting}\n"
    return f"{header}\n{body.strip()}\n"


def split_comment(text: str) -> tuple[dict[str, str], str]:
    lines = text.splitlines()
    headers: dict[str, str] = {}
    index = 0
    while index < len(lines) and lines[index].strip():
        key, value = lines[index].split(":", 1)
        headers[key.strip()] = value.strip()
        index += 1
    if index < len(lines) and not lines[index].strip():
        index += 1
    return headers, "\n".join(lines[index:]).strip()


def parse_comment(text: str) -> tuple[int, str]:
    headers, body = split_comment(text)
    return int(headers["author"]), body


@dataclass
class DrainResult:
    hardware_should_shut_down: bool
    message: str
    commits: int
    wakes: int
    cloud_api_called: bool = False
    queue: str = "job.json"


@dataclass
class Debate:
    repo: CommentsRepo
    auth: object | None = None
    host_repo: Path | None = None
    _seen_comment_hash: dict = field(default_factory=dict)

    @classmethod
    def create(cls, path: str | Path, *, auth=None, host_repo: str | Path | None = None) -> "Debate":
        host = Path(host_repo).resolve() if host_repo else None
        return cls(repo=CommentsRepo.create(path), auth=auth, host_repo=host)

    def attach_auth(self, auth) -> None:
        self.auth = auth

    def _guard_host(self) -> None:
        if self.host_repo and self.repo.path.resolve() == self.host_repo:
            raise RuntimeError("the host repo is never written")

    def _commit(self, writes: dict[str, str], message: str, deletes: list[str] | None = None) -> bool:
        self._guard_host()
        return self.repo.commit_changes(writes, deletes or [], message, SERVICE_ID)

    def _index(self) -> dict:
        path = self.repo.path / "users" / "index.json"
        if not path.exists():
            return empty_index()
        return _load(path.read_text())

    def knows_user(self, user_uuid: str) -> bool:
        return user_uuid in self._index()["by_uuid"]

    def ensure_user(self, user_uuid: str) -> int:
        """Write the UUID into the user index when a passkey arrives before a post."""
        _valid_uuid(user_uuid)
        index = self._index()
        if user_uuid in index["by_uuid"]:
            return int(index["by_uuid"][user_uuid]["id"])
        name = generated_name(user_uuid, "", "")
        short_id = issue_id(index, user_uuid, name, "generated")
        self._commit({"users/index.json": _dump(index)}, "register visitor")
        return short_id

    def rules(self) -> Rules:
        path = self.repo.path / "rules.md"
        if not path.exists():
            return parse_rules(None)
        return parse_rules(path.read_text())

    def policy(self) -> Policy:
        path = self.repo.path / "policy.md"
        if not path.exists():
            return parse_policy(None)
        return parse_policy(path.read_text())

    def _authorize(self, user_uuid: str, session) -> None:
        _valid_uuid(user_uuid)
        if self.auth is not None and self.auth.has_passkey(user_uuid):
            if session is None or not getattr(session, "http_only", False) or session.uuid != user_uuid:
                raise PermissionError("a bare UUID is not enough")
            if not self.auth.session_matches(session):
                raise PermissionError("a bare UUID is not enough")

    def preview(self, *, page: str, topic: str, body: str) -> dict:
        """Suggest an existing category. Does not file the post or create a topic."""
        topic_key = assert_short_key(slugify(topic))
        existing = [key for key in self._keys(page, topic_key) if key != UNCATEGORIZED]
        named = assign_keys(topic_key, body, set(existing), self.rules())
        suggestion = next((key for key in named if key in existing), None)
        reading = suggestion or next((key for key in named if key != UNCATEGORIZED), UNCATEGORIZED)
        summary = build_position(topic_key, reading, [body], self.rules(), set(existing))
        return {
            "suggestion": suggestion,
            "key": suggestion,
            "topic": topic_key,
            "can_override": False,
            "can_choose_existing": True,
            "summary": summary,
            "existing": existing,
            "created": False,
        }

    def submit(
        self,
        user_uuid: str,
        *,
        page: str,
        topic: str,
        body: str,
        session=None,
        chosen: str | None = None,
        key: str | None = None,
        force=None,
        override_key: str | None = None,
    ) -> dict:
        """File in a chosen existing category, or leave the post uncategorized.

        A typed new key, force, and override are ignored. The choice is only
        the starting slot. The batch may move the post later.
        """
        del key, force, override_key
        return self._file(
            user_uuid,
            page=page,
            topic=topic,
            body=body,
            session=session,
            service_key=None,
            chosen=chosen,
        )

    def place(
        self,
        user_uuid: str,
        *,
        page: str,
        topic: str,
        key: str,
        body: str,
        session=None,
    ) -> dict:
        """Record a comment under a key the live service already chose."""
        return self._file(
            user_uuid,
            page=page,
            topic=topic,
            body=body,
            session=session,
            service_key=assert_short_key(key),
            chosen=None,
        )

    def _file(
        self,
        user_uuid: str,
        *,
        page: str,
        topic: str,
        body: str,
        session,
        service_key: str | None,
        chosen: str | None,
    ) -> dict:
        self._authorize(user_uuid, session)
        topic_key = assert_short_key(slugify(topic))
        requested_page = page
        page = self._home_page(page, topic_key)
        if service_key:
            slot = assert_short_key(service_key)
            starting = ""
        else:
            slot = self._starting_slot(page, topic_key, chosen)
            starting = slot
        assert_short_key(slot)
        index = self._index()
        writing = self._writing_for(index, user_uuid, body)
        if user_uuid not in index["by_uuid"]:
            name = generated_name(user_uuid, topic_key, writing)
            short_id = issue_id(index, user_uuid, name, "generated")
        else:
            short_id = int(index["by_uuid"][user_uuid]["id"])
            if index["by_uuid"][user_uuid]["name_source"] == "generated":
                index["by_uuid"][user_uuid]["name"] = generated_name(user_uuid, topic_key, writing)
        comment_id = self._next_comment_id(page, topic_key, slot)
        comment_path = self._comment_path(page, topic_key, slot, comment_id)
        subscribers = self._read_json(self._key_path(page, topic_key, slot, "subscribers.json"), {"ids": []})
        if short_id not in subscribers["ids"]:
            subscribers["ids"].append(short_id)
            subscribers["ids"] = sorted(set(subscribers["ids"]))
        job = self._read_json(f"pages/{page}/job.json", {"status": "done", "topics": []})
        job["status"] = "dirty"
        if topic_key not in job["topics"]:
            job["topics"].append(topic_key)
            job["topics"].sort()
        writes = {
            "users/index.json": _dump(index),
            comment_path: format_comment(short_id, body, starting),
            self._key_path(page, topic_key, slot, "subscribers.json"): _dump(subscribers),
            f"pages/{page}/job.json": _dump(job),
        }
        suggestion = self.preview(page=page, topic=topic_key, body=body)["suggestion"]
        if requested_page != page:
            pointer_index = self._read_json(
                f"pages/{requested_page}/index.json",
                {"old_keys": {}, "pointers": {}, "topics": {}},
            )
            pointer_index.setdefault("pointers", {})[topic_key] = {
                "page": page,
                "topic": topic_key,
            }
            pointer_index.setdefault("topics", {})
            pointer_index.setdefault("old_keys", {})
            writes[f"pages/{requested_page}/index.json"] = _dump(pointer_index)
        self._commit(writes, "file comment")
        return {
            "key": slot,
            "starting": starting or slot,
            "suggestion": suggestion,
            "topic": topic_key,
            "can_override": False,
            "can_choose_existing": service_key is None,
            "comment_id": comment_id,
            "short_id": short_id,
            "filing_line": FILING,
            "page": page,
        }

    def edit(
        self,
        user_uuid: str,
        *,
        page: str,
        topic: str,
        key: str,
        comment_id: str,
        body: str,
        session=None,
        override_key: str | None = None,
        force=None,
    ) -> None:
        """An edited body re-queues the batch. It does not set the key or the summary."""
        del override_key, force
        self._authorize(user_uuid, session)
        topic_key = assert_short_key(slugify(topic))
        key = assert_short_key(key)
        page = self._home_page(page, topic_key)
        path = self._comment_path(page, topic_key, key, str(comment_id))
        headers, _old = split_comment(self.repo.read(path))
        author = int(headers["author"])
        index = self._index()
        short_id = int(index["by_uuid"][user_uuid]["id"])
        if author != short_id:
            raise PermissionError("only the author edits their comment")
        job = self._read_json(f"pages/{page}/job.json", {"status": "done", "topics": []})
        job["status"] = "dirty"
        if topic_key not in job["topics"]:
            job["topics"].append(topic_key)
        writes = {
            path: format_comment(author, body, headers.get("starting", "")),
            f"pages/{page}/job.json": _dump(job),
        }
        self._commit(writes, "edit comment")

    def set_name(self, user_uuid: str, name: str, session=None) -> None:
        self._authorize(user_uuid, session)
        cleaned = " ".join(name.split())
        if not cleaned:
            raise ValueError("name is empty")
        index = self._index()
        row = index["by_uuid"][user_uuid]
        row["name"] = cleaned
        row["name_source"] = "chosen"
        self._commit({"users/index.json": _dump(index)}, "set visitor name")

    def post_rules(self, markdown: str) -> None:
        """Humans change rules through the API. The AI still commits. This is not a comment."""
        text = markdown if markdown.endswith("\n") else markdown + "\n"
        self._commit({"rules.md": text}, "post rules")

    def post_policy(self, markdown: str) -> None:
        text = markdown if markdown.endswith("\n") else markdown + "\n"
        self._commit({"policy.md": text}, "post policy")

    def vote(
        self,
        user_uuid: str,
        *,
        page: str,
        level: str,
        topic: str,
        key: str | None = None,
        comment: str | None = None,
        session=None,
    ) -> dict:
        """One current vote at each level. The same vote clears. A different one replaces it."""
        self._authorize(user_uuid, session)
        if level not in {"topic", "subtopic", "comment"}:
            raise ValueError("level must be topic, subtopic, or comment")
        topic_key = assert_short_key(slugify(topic))
        page = self._home_page(page, topic_key)
        if not (self.repo.path / "pages" / page / "topics" / topic_key).exists():
            raise ValueError("a vote does not open a topic")
        index = self._index()
        writing = self._writing_for(index, user_uuid, "")
        if user_uuid not in index["by_uuid"]:
            short_id = issue_id(index, user_uuid, generated_name(user_uuid, topic_key, writing), "generated")
        else:
            short_id = int(index["by_uuid"][user_uuid]["id"])
        writes: dict[str, str] = {"users/index.json": _dump(index)}
        if level == "topic":
            self._toggle_topic_vote(writes, page, topic_key, short_id)
        elif level == "subtopic":
            if not key:
                raise ValueError("subtopic vote needs a key")
            self._toggle_subtopic_vote(writes, page, topic_key, assert_short_key(key), short_id)
        else:
            if not key or comment is None:
                raise ValueError("comment vote needs a key and a comment id")
            self._toggle_comment_vote(
                writes, page, topic_key, assert_short_key(key), str(comment), short_id
            )
        self._commit(writes, "record vote")
        return {
            "short_id": short_id,
            "topic": self.tally(page, level="topic", topic=topic_key),
            "subtopic": self.tally(page, level="subtopic", topic=topic_key, key=key) if key else None,
            "comment": self.tally(page, level="comment", topic=topic_key, key=key, comment=comment)
            if key and comment is not None
            else None,
        }

    def tally(self, page: str, *, level: str, topic: str, key: str | None = None, comment: str | None = None) -> int:
        topic_key = assert_short_key(slugify(topic))
        if level == "topic":
            data = self._read_json(f"pages/{page}/topics/{topic_key}/votes.json", {"ids": []})
            return len(data.get("ids", []))
        if not key:
            return 0
        key = assert_short_key(key)
        if level == "subtopic":
            data = self._read_json(self._key_path(page, topic_key, key, "votes.json"), {"ids": []})
            return len(data.get("ids", []))
        data = self._read_json(self._key_path(page, topic_key, key, "comment-votes.json"), {})
        return len(data.get(str(comment), []))

    def try_rename(self, page: str, topic: str, src: str, dst: str) -> bool:
        """Refuse a merge across axes. Perform a same-argument rename when the rules allow it."""
        topic_key = assert_short_key(slugify(topic))
        src = assert_short_key(src)
        dst = assert_short_key(dst)
        if not rename_allowed(topic_key, src, dst, self.rules()):
            return False
        src_dir = self.repo.path / "pages" / page / "topics" / topic_key / src
        if not src_dir.exists():
            return False
        self._apply_rename(page, topic_key, src, dst)
        return True

    def pin_page(
        self,
        page: str,
        *,
        url: str | None = None,
        content_commit: str | None = None,
        thesis: str = "",
    ) -> None:
        import hashlib

        payload = {
            "canonical_url": url,
            "content_commit": content_commit,
            "thesis_hash": hashlib.sha256(thesis.encode()).hexdigest() if thesis else None,
            "thesis_stale": False,
        }
        self._commit({f"pages/{page}/page.json": _dump(payload)}, "pin page")

    def note_host_changed(
        self,
        page: str,
        *,
        content_commit: str | None = None,
        thesis: str | None = None,
    ) -> None:
        import hashlib

        relative = f"pages/{page}/page.json"
        payload = self._read_json(relative, {})
        stale = bool(payload.get("thesis_stale"))
        if content_commit is not None and content_commit != payload.get("content_commit"):
            stale = True
        if thesis is not None:
            digest = hashlib.sha256(thesis.encode()).hexdigest()
            if digest != payload.get("thesis_hash"):
                stale = True
        payload["thesis_stale"] = stale
        self._commit({relative: _dump(payload)}, "flag thesis")

    def resolve(self, page: str, topic: str, key: str) -> str:
        topic_key = assert_short_key(slugify(topic))
        history = self._read_json(
            f"pages/{page}/topics/{topic_key}/key-history.json",
            {},
        )
        index = self._read_json(f"pages/{page}/index.json", {})
        index_history = index.get("topics", {}).get(topic_key, {}).get("history", {})
        seen: set[str] = set()
        current = key
        while current not in seen and (current in history or current in index_history):
            seen.add(current)
            current = history.get(current) or index_history[current]
        return current

    def publish(self, remotes: list[str]) -> None:
        self._guard_host()
        self.repo.publish(remotes)

    def drain(self, arrive=None) -> DrainResult:
        """Run until the job queue is empty. New posts that arrive join this same drain."""
        self._guard_host()
        self.repo.checkout_comments()
        commits = 0
        used_arrive = False
        while True:
            dirty = self._dirty_pages()
            if not dirty:
                break
            progressed = False
            for page in dirty:
                if self._curate_page(page):
                    commits += 1
                    progressed = True
            if arrive is not None and not used_arrive:
                used_arrive = True
                arrive()
                continue
            if not progressed:
                break
        return DrainResult(
            hardware_should_shut_down=True,
            message="The hardware should shut down.",
            commits=commits,
            wakes=1,
            cloud_api_called=False,
            queue="job.json",
        )

    def _curate_page(self, page: str) -> bool:
        rules = self.rules()
        rule_source = "posted" if (self.repo.path / "rules.md").exists() else "default"
        job = self._read_json(f"pages/{page}/job.json", {"status": "done", "topics": []})
        topics = list(job.get("topics") or [])
        topic_root = self.repo.path / "pages" / page / "topics"
        if topic_root.exists():
            for path in topic_root.iterdir():
                if path.is_dir() and path.name not in topics:
                    topics.append(path.name)
        writes: dict[str, str] = {}
        deletes: list[str] = []
        index = self._index()
        events = self._read_json(f"pages/{page}/notifications.json", {"events": []})
        existing_page_index = self._read_json(
            f"pages/{page}/index.json",
            {"old_keys": {}, "pointers": {}, "topics": {}},
        )
        page_index = {
            "old_keys": {},
            "pointers": existing_page_index.get("pointers", {}),
            "topics": {},
        }
        changed_sections: list[tuple[str, str]] = []
        for topic in topics:
            topic_writes, topic_deletes, history, sections, decisions = self._plan_topic(
                page, topic, rules, index, rule_source
            )
            writes.update(topic_writes)
            deletes.extend(topic_deletes)
            prefix = f"pages/{page}/topics/{topic}/"
            subtopics = sorted(
                {
                    relative[len(prefix) :].split("/")[0]
                    for relative in topic_writes
                    if relative.startswith(prefix) and "/" in relative[len(prefix) :]
                }
            )
            page_index["topics"][topic] = {
                "decisions": decisions,
                "history": history,
                "subtopics": subtopics,
            }
            for old, new in history.items():
                page_index["old_keys"][f"{topic}/{old}"] = f"{topic}/{new}"
            changed_sections.extend(sections)
        self._revise_generated_names(index)
        writes["users/index.json"] = _dump(index)
        writes[f"pages/{page}/index.json"] = _dump(page_index)
        if changed_sections:
            for topic, key in changed_sections:
                subscribers = self._planned_subscribers(writes, page, topic, key)
                for short_id in subscribers:
                    for kind in ("position", "questions", "suggested-counter"):
                        events["events"].append(
                            {
                                "kind": kind,
                                "section": f"{topic}/{key}",
                                "subscriber": short_id,
                            }
                        )
            writes[f"pages/{page}/notifications.json"] = _dump(events)
        elif (self.repo.path / "pages" / page / "notifications.json").exists():
            writes[f"pages/{page}/notifications.json"] = _dump(events)
        job["status"] = "done"
        job["topics"] = sorted(set(topics))
        writes[f"pages/{page}/job.json"] = _dump(job)
        if self._already(writes, deletes):
            return False
        return self._commit(writes, "curate comments", deletes)

    def _plan_topic(self, page: str, topic: str, rules: Rules, index: dict, rule_source: str = "default"):
        comments = self._load_comments(page, topic)
        by_folder: dict[str, list[Comment]] = {}
        for comment in comments:
            by_folder.setdefault(comment.old_key, []).append(comment)
        final: dict[str, list[Comment]] = {}
        history = self._read_json(f"pages/{page}/topics/{topic}/key-history.json", {})
        renames: list[tuple[str, str]] = []
        live = {
            key
            for key in self._keys(page, topic)
            if key not in {UNCATEGORIZED, "other"}
        }
        ordered = sorted(
            comments,
            key=lambda comment: (
                1 if comment.old_key == UNCATEGORIZED else 0,
                int(comment.id) if str(comment.id).isdigit() else 0,
                comment.id,
            ),
        )
        assigned: dict[int, list[str]] = {}
        for comment in ordered:
            if not rules.allows_rename() and comment.old_key not in {UNCATEGORIZED, ""}:
                dests = [comment.old_key]
            else:
                dests = assign_keys(topic, comment.body, live, rules)
            assigned[id(comment)] = dests
            for dest in dests:
                if dest not in {UNCATEGORIZED, "other"}:
                    live.add(dest)
        for comment in comments:
            for dest in assigned[id(comment)]:
                final.setdefault(dest, []).append(comment)
        for folder, folder_comments in by_folder.items():
            if folder in {UNCATEGORIZED, "other"}:
                continue
            dests = {dest for comment in folder_comments for dest in assigned.get(id(comment), [])}
            if len(dests) == 1:
                dest = next(iter(dests))
                if dest != folder and rename_allowed(topic, folder, dest, rules):
                    renames.append((folder, dest))
        for src, dst in renames:
            for old, current in list(history.items()):
                if current == src:
                    history[old] = dst
            history[src] = dst
        vote_transfer = {src: dst for src, dst in renames}
        sub_votes = self._gather_id_lists(page, topic, "votes.json", vote_transfer, topic_level=False)
        topic_votes = self._read_json(f"pages/{page}/topics/{topic}/votes.json", {"ids": []})
        subscribers = self._gather_id_lists(page, topic, "subscribers.json", vote_transfer, topic_level=False)
        for key, key_comments in final.items():
            have = set(subscribers.get(key, []))
            for comment in key_comments:
                have.add(comment.author)
            subscribers[key] = sorted(have)
        self._renumber(final)
        comment_votes = self._gather_comment_votes(page, topic, vote_transfer)
        shared_ids = _shared_comment_ids(final)
        existing_keys = set(final)
        writes: dict[str, str] = {}
        pairs, links = self._pairs_for(topic, existing_keys)
        writes[f"pages/{page}/topics/{topic}/pairs.json"] = _dump(
            {
                "confidence": "high",
                "links": [list(item) for item in links],
                "pairs": [list(item) for item in pairs],
                "read": readable_pairs(pairs, links),
                "rule": rule_source,
            }
        )
        writes[f"pages/{page}/topics/{topic}/key-history.json"] = _dump(history)
        writes[f"pages/{page}/topics/{topic}/votes.json"] = _dump({"ids": sorted(set(topic_votes.get("ids", [])))})
        changed: list[tuple[str, str]] = []
        for key, key_comments in sorted(final.items()):
            bodies = [comment.body for comment in key_comments]
            position = build_position(topic, key, bodies, rules, existing_keys)
            questions = build_questions(topic, key)
            suggestion = build_suggestion(topic, key, existing_keys)
            cite_patriot = key == "illegal" and "legal" not in existing_keys
            if not cite_patriot:
                cite_patriot = bool(unwritten_counter(bodies)) and "patriot-act" not in existing_keys
            if cite_patriot:
                suggestion = suggestion.rstrip() + (
                    "\n\nUnwritten counter: patriot-act "
                    "https://www.congress.gov/bill/107th-congress/house-bill/3162"
                    "\n\nThe Patriot Act is a counter nobody has written. It is not a directory.\n"
                )
            previous = self._previous_section(page, topic, key, vote_transfer)
            if previous != (position, questions, suggestion):
                changed.append((topic, key))
            base = f"pages/{page}/topics/{topic}/{key}"
            writes[f"{base}/position.md"] = position
            writes[f"{base}/questions.md"] = questions
            writes[f"{base}/suggested-counter.md"] = suggestion
            writes[f"{base}/votes.json"] = _dump({"ids": sorted(sub_votes.get(key, []))})
            writes[f"{base}/subscribers.json"] = _dump({"ids": sorted(subscribers.get(key, []))})
            cv = {cid: sorted(ids) for cid, ids in sorted(comment_votes.get(key, {}).items()) if ids}
            writes[f"{base}/comment-votes.json"] = _dump(cv)
            listed = []
            for comment in key_comments:
                if id(comment) not in shared_ids:
                    writes[f"{base}/comments/{comment.id}.md"] = format_comment(
                        comment.author, comment.body, comment.starting
                    )
                    continue
                home = shared_ids[id(comment)]
                relative = f"{home}/comments/{comment.id}.md"
                if home == key:
                    writes[f"{base}/comments/{comment.id}.md"] = format_comment(
                        comment.author, comment.body, comment.starting
                    )
                listed.append(
                    {
                        "id": comment.id,
                        "path": relative,
                        "keys": list(assigned.get(id(comment), [])),
                        "confidence": reading_confidence(comment.body),
                    }
                )
            if listed:
                listed.sort(key=lambda item: item["id"])
                writes[f"{base}/listing.json"] = _dump({"comments": listed})
        desired_prefix = f"pages/{page}/topics/{topic}/"
        existing_files = [item for item in self.repo.files() if item.startswith(desired_prefix)]
        deletes = [item for item in existing_files if item not in writes]
        decisions = _standing_decisions(topic, assigned, final, history, rule_source)
        return writes, deletes, history, changed, decisions

    def _previous_section(self, page, topic, key, transfers):
        sources = [key] + [src for src, dst in transfers.items() if dst == key]
        for source in sources:
            position = self._maybe_read(f"pages/{page}/topics/{topic}/{source}/position.md")
            questions = self._maybe_read(f"pages/{page}/topics/{topic}/{source}/questions.md")
            suggestion = self._maybe_read(f"pages/{page}/topics/{topic}/{source}/suggested-counter.md")
            if position is not None:
                return position, questions, suggestion
        return None

    def _pairs_for(self, topic: str, existing: set[str]) -> tuple[list[tuple[str, str]], list[tuple[str, str]]]:
        pairs = []
        seen = set()
        for key in existing:
            info = spec(topic, key)
            if not info:
                continue
            partner = info["pair"]
            if partner in existing:
                item = tuple(sorted((key, partner)))
                if item not in seen:
                    seen.add(item)
                    pairs.append(item)
        pairs.sort()
        links = []
        content = sorted(
            key for key in existing if key not in LEGALITY and key not in {UNCATEGORIZED, "other"}
        )
        legality = sorted(key for key in existing if key in LEGALITY)
        for left in legality:
            for right in content:
                links.append((left, right))
        return pairs, links

    def _revise_generated_names(self, index: dict) -> None:
        bodies_by_id: dict[int, list[str]] = {}
        pages = self.repo.path / "pages"
        if pages.exists():
            for path in sorted(pages.rglob("comments/*.md")):
                author, body = parse_comment(path.read_text())
                topic = path.parts[path.parts.index("topics") + 1]
                bodies_by_id.setdefault(author, []).append(f"{topic}\n{body}")
        for user_uuid, row in index["by_uuid"].items():
            if row.get("name_source") != "generated":
                continue
            writing = "\n".join(bodies_by_id.get(int(row["id"]), []))
            topic = ""
            if writing:
                topic = writing.split("\n", 1)[0]
            row["name"] = generated_name(user_uuid, topic, writing)

    def _apply_rename(self, page: str, topic: str, src: str, dst: str) -> None:
        rules = self.rules()
        if not rename_allowed(topic, src, dst, rules):
            return
        index = self._index()
        rule_source = "posted" if (self.repo.path / "rules.md").exists() else "default"
        writes, deletes, _history, _changed, _decisions = self._plan_topic(
            page, topic, rules, index, rule_source
        )
        # Force the synonym move even when classify already agrees, by rewriting history.
        history = self._read_json(f"pages/{page}/topics/{topic}/key-history.json", {})
        history[src] = dst
        writes[f"pages/{page}/topics/{topic}/key-history.json"] = _dump(history)
        self._commit(writes, "rename key", deletes)

    def _toggle_topic_vote(self, writes, page, topic, short_id) -> None:
        topics_root = self.repo.path / "pages" / page / "topics"
        topics = [path.name for path in topics_root.iterdir() if path.is_dir()] if topics_root.exists() else []
        if topic not in topics:
            topics.append(topic)
        current = None
        stored = {}
        for name in topics:
            data = self._read_json(f"pages/{page}/topics/{name}/votes.json", {"ids": []})
            stored[name] = [int(item) for item in data.get("ids", [])]
            if short_id in stored[name]:
                current = name
        if current == topic:
            stored[topic] = [item for item in stored[topic] if item != short_id]
        else:
            if current:
                stored[current] = [item for item in stored[current] if item != short_id]
            stored.setdefault(topic, [])
            if short_id not in stored[topic]:
                stored[topic].append(short_id)
        for name, ids in stored.items():
            writes[f"pages/{page}/topics/{name}/votes.json"] = _dump({"ids": sorted(ids)})

    def _toggle_subtopic_vote(self, writes, page, topic, key, short_id) -> None:
        keys = self._keys(page, topic)
        if key not in keys:
            raise ValueError("a vote does not open a subtopic")
        stored = {}
        current = None
        for name in keys:
            data = self._read_json(self._key_path(page, topic, name, "votes.json"), {"ids": []})
            stored[name] = [int(item) for item in data.get("ids", [])]
            if short_id in stored[name]:
                current = name
        if current == key:
            stored[key] = [item for item in stored[key] if item != short_id]
        else:
            if current:
                stored[current] = [item for item in stored[current] if item != short_id]
            if short_id not in stored[key]:
                stored[key].append(short_id)
        for name, ids in stored.items():
            writes[self._key_path(page, topic, name, "votes.json")] = _dump({"ids": sorted(ids)})

    def _toggle_comment_vote(self, writes, page, topic, key, comment_id, short_id) -> None:
        found = False
        stored = {}
        current = None
        for name in self._keys(page, topic):
            data = self._read_json(self._key_path(page, topic, name, "comment-votes.json"), {})
            cleaned = {cid: [int(item) for item in ids] for cid, ids in data.items()}
            stored[name] = cleaned
            for cid, ids in cleaned.items():
                if short_id in ids:
                    current = (name, cid)
            comment_path = self.repo.path / self._comment_path(page, topic, name, comment_id)
            if name == key and comment_path.exists():
                found = True
        if not found:
            raise ValueError("a vote does not create a comment")
        if current == (key, comment_id):
            stored[key][comment_id] = [item for item in stored[key].get(comment_id, []) if item != short_id]
        else:
            if current:
                old_key, old_id = current
                stored[old_key][old_id] = [item for item in stored[old_key][old_id] if item != short_id]
            stored.setdefault(key, {})
            stored[key].setdefault(comment_id, [])
            if short_id not in stored[key][comment_id]:
                stored[key][comment_id].append(short_id)
        for name, mapping in stored.items():
            compact = {cid: sorted(ids) for cid, ids in mapping.items() if ids}
            writes[self._key_path(page, topic, name, "comment-votes.json")] = _dump(compact)

    def _gather_id_lists(self, page, topic, filename, transfers, topic_level=False) -> dict[str, list[int]]:
        gathered: dict[str, list[int]] = {}
        for key in self._keys(page, topic):
            data = self._read_json(self._key_path(page, topic, key, filename), {"ids": []})
            dest = transfers.get(key, key)
            gathered.setdefault(dest, [])
            gathered[dest].extend(int(item) for item in data.get("ids", []))
        return {key: sorted(set(ids)) for key, ids in gathered.items()}

    def _gather_comment_votes(self, page, topic, transfers) -> dict[str, dict[str, list[int]]]:
        gathered: dict[str, dict[str, list[int]]] = {}
        for key in self._keys(page, topic):
            data = self._read_json(self._key_path(page, topic, key, "comment-votes.json"), {})
            dest = transfers.get(key, key)
            bucket = gathered.setdefault(dest, {})
            for cid, ids in data.items():
                bucket.setdefault(cid, [])
                bucket[cid].extend(int(item) for item in ids)
        return gathered

    def _planned_subscribers(self, writes, page, topic, key) -> list[int]:
        relative = self._key_path(page, topic, key, "subscribers.json")
        if relative in writes:
            return list(_load(writes[relative]).get("ids", []))
        return list(self._read_json(relative, {"ids": []}).get("ids", []))

    def _load_comments(self, page: str, topic: str) -> list[Comment]:
        comments = []
        for key in self._keys(page, topic):
            directory = self.repo.path / "pages" / page / "topics" / topic / key / "comments"
            if not directory.exists():
                continue
            for path in sorted(directory.glob("*.md")):
                headers, body = split_comment(path.read_text())
                comments.append(
                    Comment(
                        id=path.stem,
                        author=int(headers["author"]),
                        body=body,
                        old_key=key,
                        starting=headers.get("starting", ""),
                    )
                )
        return comments

    def _home_page(self, page: str, topic: str) -> str:
        """A second page stores a pointer. It does not start a second copy of the debate."""
        direct = self.repo.path / "pages" / page / "topics" / topic
        if direct.exists():
            return page
        root = self.repo.path / "pages"
        if not root.exists():
            return page
        for candidate in sorted(path for path in root.iterdir() if path.is_dir()):
            if (candidate / "topics" / topic).is_dir():
                return candidate.name
        return page

    def _starting_slot(self, page: str, topic: str, chosen: str | None) -> str:
        """An existing category, or uncategorized. A new key cannot be typed."""
        if chosen is None or not str(chosen).strip():
            return UNCATEGORIZED
        slot = assert_short_key(str(chosen))
        if slot == UNCATEGORIZED:
            return UNCATEGORIZED
        if slot not in self._keys(page, topic):
            raise ValueError("a new key cannot be typed")
        return slot

    @staticmethod
    def _renumber(final: dict[str, list[Comment]]) -> None:
        """Single-key posts restart at 1 in that key. A shared post keeps one id."""
        counts: dict[int, int] = {}
        for comments in final.values():
            for comment in comments:
                counts[id(comment)] = counts.get(id(comment), 0) + 1
        homes = _shared_comment_ids(final)
        next_id = {key: 1 for key in final}
        kept: dict[int, str] = {}
        for comments in final.values():
            for comment in comments:
                if counts[id(comment)] < 2 or id(comment) in kept:
                    continue
                home = homes[id(comment)]
                kept[id(comment)] = str(next_id[home])
                next_id[home] += 1
        for key, comments in final.items():
            for comment in comments:
                if counts[id(comment)] > 1:
                    comment.id = kept[id(comment)]
                    continue
                comment.id = str(next_id[key])
                next_id[key] += 1

    def _keys(self, page: str, topic: str) -> list[str]:
        root = self.repo.path / "pages" / page / "topics" / topic
        if not root.exists():
            return []
        return sorted(path.name for path in root.iterdir() if path.is_dir())

    def _next_comment_id(self, page: str, topic: str, key: str) -> str:
        directory = self.repo.path / "pages" / page / "topics" / topic / key / "comments"
        numbers = []
        if directory.exists():
            for path in directory.glob("*.md"):
                if path.stem.isdigit():
                    numbers.append(int(path.stem))
        return str(max(numbers, default=0) + 1)

    def _writing_for(self, index: dict, user_uuid: str, extra: str) -> str:
        parts = [extra]
        if user_uuid in index["by_uuid"]:
            short_id = int(index["by_uuid"][user_uuid]["id"])
            pages = self.repo.path / "pages"
            if pages.exists():
                for path in pages.rglob("comments/*.md"):
                    author, body = parse_comment(path.read_text())
                    if author == short_id:
                        parts.append(body)
        return "\n".join(part for part in parts if part)

    def _dirty_pages(self) -> list[str]:
        root = self.repo.path / "pages"
        if not root.exists():
            return []
        dirty = []
        for page in sorted(path for path in root.iterdir() if path.is_dir()):
            job_path = page / "job.json"
            if not job_path.exists():
                continue
            job = json.loads(job_path.read_text())
            if job.get("status") == "dirty":
                dirty.append(page.name)
        return dirty

    def _already(self, writes: dict[str, str], deletes: list[str]) -> bool:
        for relative in deletes:
            if (self.repo.path / relative).exists():
                return False
        for relative, content in writes.items():
            path = self.repo.path / relative
            if not path.exists() or path.read_text() != content:
                return False
        return True

    def _read_json(self, relative: str, default):
        path = self.repo.path / relative
        if not path.exists():
            return json.loads(json.dumps(default))
        return json.loads(path.read_text())

    def _maybe_read(self, relative: str) -> str | None:
        path = self.repo.path / relative
        if not path.exists():
            return None
        return path.read_text()

    @staticmethod
    def _comment_path(page: str, topic: str, key: str, comment_id: str) -> str:
        return f"pages/{page}/topics/{topic}/{key}/comments/{comment_id}.md"

    @staticmethod
    def _key_path(page: str, topic: str, key: str, name: str) -> str:
        return f"pages/{page}/topics/{topic}/{key}/{name}"


def _valid_uuid(value: str) -> None:
    try:
        uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError) as exc:
        raise PermissionError("visitor uuid required") from exc
