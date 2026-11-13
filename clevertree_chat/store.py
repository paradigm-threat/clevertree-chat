"""Durable copies of the comments tree and the private auth tree.

The comments branch is the debate. Email HMACs and passkey material stay in
the auth repo. A missing GitHub token keeps the trees on a local directory,
which is enough for tests and is not durable on a serverless disk.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path

from clevertree_chat.gitcmd import run as git_run

from clevertree_chat import SERVICE_EMAIL, SERVICE_ID
from clevertree_chat.auth import AuthRepo
from clevertree_chat.engine import Debate
from clevertree_chat.repo import CommentsRepo

COMMENTS_REPO = "paradigm-threat/clevertree-chat-comments"
AUTH_REPO = "paradigm-threat/clevertree-chat-auth"
COMMENTS_BRANCH = "comments"
AUTH_BRANCH = "main"


def export_tree(path: Path) -> dict[str, str]:
    files: dict[str, str] = {}
    root = Path(path)
    if not root.exists():
        return files
    for item in sorted(root.rglob("*")):
        if not item.is_file() or ".git" in item.parts:
            continue
        files[item.relative_to(root).as_posix()] = item.read_text()
    return files


def materialize_comments(path: Path, files: dict[str, str]) -> Debate:
    path = Path(path)
    if not (path / ".git").exists():
        debate = Debate.create(path)
    else:
        debate = Debate(repo=CommentsRepo(path))
    _overlay_comments(debate, files)
    return debate


def materialize_auth(path: Path, files: dict[str, str], pepper: bytes) -> AuthRepo:
    path = Path(path)
    if not (path / ".git").exists():
        auth = AuthRepo.create(path, pepper)
    else:
        auth = AuthRepo(path, pepper)
    _overlay_plain(path, files)
    return auth


class GitHubStore:
    """Fast-forward the two private repos. Never force-pushes. Never takes a repo name from a request."""

    def __init__(self, token: str, root: Path):
        self.token = token
        self.root = Path(root)
        self.comments_repo = os.environ.get("CLEVERTREE_COMMENTS_REPO", COMMENTS_REPO)
        self.auth_repo = os.environ.get("CLEVERTREE_AUTH_REPO", AUTH_REPO)
        self._seen_comments: dict[str, str] | None = None
        self._seen_auth: dict[str, str] | None = None

    def load(self, pepper: bytes) -> tuple[Debate, AuthRepo]:
        comments = pull_files(self.comments_repo, COMMENTS_BRANCH, self.token)
        auth_files = pull_files(self.auth_repo, AUTH_BRANCH, self.token)
        self._seen_comments = comments
        self._seen_auth = auth_files
        debate = materialize_comments(self.root / "comments", comments)
        auth = materialize_auth(self.root / "auth", auth_files, pepper)
        debate.attach_auth(auth)
        return debate, auth

    def save(self, debate: Debate, auth: AuthRepo) -> None:
        comments = export_tree(debate.repo.path)
        private = export_tree(auth.path)
        if comments != self._seen_comments:
            push_files(self.comments_repo, COMMENTS_BRANCH, comments, self.token)
            self._seen_comments = comments
        if private != self._seen_auth:
            push_files(self.auth_repo, AUTH_BRANCH, private, self.token)
            self._seen_auth = private


def pull_files(repo: str, branch: str, token: str) -> dict[str, str]:
    ref = _request("GET", f"/repos/{repo}/git/ref/heads/{branch}", token, missing_ok=True)
    if ref is None:
        return {}
    tree = _request("GET", f"/repos/{repo}/git/trees/{ref['object']['sha']}?recursive=1", token)
    files: dict[str, str] = {}
    for item in tree.get("tree") or []:
        if item.get("type") != "blob":
            continue
        blob = _request("GET", f"/repos/{repo}/git/blobs/{item['sha']}", token)
        text = blob.get("content") or ""
        if blob.get("encoding") == "base64":
            import base64

            text = base64.b64decode(text).decode()
        files[item["path"]] = text if text.endswith("\n") or text == "" else text + "\n"
    return files


def push_files(repo: str, branch: str, files: dict[str, str], token: str) -> None:
    if not files:
        return
    ref = _request("GET", f"/repos/{repo}/git/ref/heads/{branch}", token, missing_ok=True)
    if ref is None:
        _seed_empty(repo, token)
        ref = _request("GET", f"/repos/{repo}/git/ref/heads/{branch}", token, missing_ok=True)
    parent = ref["object"]["sha"] if ref else None
    commit = _commit_tree(repo, files, parent, token, f"update {branch}")
    if ref is None:
        _request(
            "POST",
            f"/repos/{repo}/git/refs",
            token,
            {"ref": f"refs/heads/{branch}", "sha": commit},
        )
        return
    try:
        _request(
            "PATCH",
            f"/repos/{repo}/git/refs/heads/{branch}",
            token,
            {"sha": commit, "force": False},
        )
    except urllib.error.HTTPError as exc:
        if exc.code not in {409, 422}:
            raise
        latest = _request("GET", f"/repos/{repo}/git/ref/heads/{branch}", token)
        commit = _commit_tree(repo, files, latest["object"]["sha"], token, f"update {branch}")
        _request(
            "PATCH",
            f"/repos/{repo}/git/refs/heads/{branch}",
            token,
            {"sha": commit, "force": False},
        )


def _seed_empty(repo: str, token: str) -> None:
    """An empty GitHub repo rejects the git tree API until the first commit."""
    import base64

    payload = {
        "message": "start repository",
        "content": base64.b64encode(b"Clevertree Chat store.\n").decode(),
        "branch": "main",
    }
    try:
        _request("PUT", f"/repos/{repo}/contents/README", token, payload)
    except RuntimeError as exc:
        if "already exists" not in str(exc).lower() and "422" not in str(exc):
            raise


def _commit_tree(repo: str, files: dict[str, str], parent: str | None, token: str, message: str) -> str:
    tree = _request(
        "POST",
        f"/repos/{repo}/git/trees",
        token,
        {
            "tree": [
                {"path": path, "mode": "100644", "type": "blob", "content": content}
                for path, content in sorted(files.items())
            ]
        },
    )
    body = {"message": message, "tree": tree["sha"], "parents": [parent] if parent else []}
    commit = _request("POST", f"/repos/{repo}/git/commits", token, body)
    return commit["sha"]


def _request(method: str, path: str, token: str, payload: dict | None = None, missing_ok: bool = False):
    data = None if payload is None else json.dumps(payload).encode()
    request = urllib.request.Request(
        "https://api.github.com" + path,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "clevertree-chat",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        if missing_ok and exc.code in {404, 409}:
            return None
        detail = exc.read().decode("utf-8", "replace")
        if token and token in detail:
            detail = detail.replace(token, "[redacted]")
        raise RuntimeError(f"github {method} {path} failed ({exc.code}): {detail[:300]}") from exc


def _overlay_comments(debate: Debate, files: dict[str, str]) -> None:
    if not files:
        return
    existing = set(debate.repo.files())
    deletes = [path for path in existing if path not in files and path != "README"]
    debate.repo.commit_changes(files, deletes, "restore comments", SERVICE_ID)


def _overlay_plain(path: Path, files: dict[str, str]) -> None:
    if not files:
        return
    for relative, content in files.items():
        dest = path / relative
        dest.parent.mkdir(parents=True, exist_ok=True)
        if not dest.exists() or dest.read_text() != content:
            dest.write_text(content)
    for item in path.rglob("*"):
        if not item.is_file() or ".git" in item.parts:
            continue
        relative = item.relative_to(path).as_posix()
        if relative not in files and relative != "README":
            item.unlink()
    git_run(["git", "add", "-A"], path)
    status = git_run(["git", "status", "--porcelain"], path)
    if not status.stdout.strip():
        return
    git_run(
        [
            "git",
            "-c",
            f"user.name={SERVICE_ID}",
            "-c",
            f"user.email={SERVICE_EMAIL}",
            "commit",
            "-m",
            "restore auth",
        ],
        path,
    )
