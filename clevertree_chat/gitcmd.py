"""Git commands for the comments repo.

The live server image has no git binary. Dulwich performs the same
commands in-process. A machine with git keeps using that binary.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path


def use_fallback() -> bool:
    if os.environ.get("CLEVERTREE_GIT_FALLBACK") == "1":
        return True
    return shutil.which("git") is None


def run(args: list[str], cwd, check: bool = True) -> subprocess.CompletedProcess:
    cwd = str(cwd)
    if not use_fallback():
        env = os.environ.copy()
        env["GIT_TERMINAL_PROMPT"] = "0"
        completed = subprocess.run(args, cwd=cwd, capture_output=True, text=True, env=env)
    else:
        completed = _dulwich(args, cwd)
    if check and completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "").strip()
        raise RuntimeError(f"{args} failed ({completed.returncode}): {detail}")
    return completed


def _dulwich(args: list[str], cwd: str) -> subprocess.CompletedProcess:
    from dulwich.diff_tree import RenameDetector, tree_changes
    from dulwich.repo import Repo
    from dulwich import porcelain

    config, command, rest = _parse(args)
    try:
        code, out = _dispatch(Repo, porcelain, tree_changes, RenameDetector, cwd, config, command, rest)
        return subprocess.CompletedProcess(args, code, out, "")
    except Exception as exc:
        return subprocess.CompletedProcess(args, 1, "", str(exc))


def _parse(args: list[str]) -> tuple[dict[str, str], str, list[str]]:
    if not args or args[0] != "git":
        raise ValueError(args)
    index = 1
    config: dict[str, str] = {}
    while index < len(args) and args[index] == "-c":
        key, value = args[index + 1].split("=", 1)
        config[key] = value
        index += 2
    return config, args[index], args[index + 1 :]


def _dispatch(Repo, porcelain, tree_changes, RenameDetector, cwd, config, command, rest):
    if command == "init":
        branch = "main"
        if "-b" in rest:
            branch = rest[rest.index("-b") + 1]
        Repo.init(cwd, mkdir=not Path(cwd).exists(), default_branch=f"refs/heads/{branch}".encode())
        return 0, ""
    if command == "add":
        if not rest or "-A" in rest:
            porcelain.add(cwd)
        else:
            porcelain.add(cwd, paths=rest)
        return 0, ""
    if command == "commit":
        message = rest[rest.index("-m") + 1]
        name = config.get("user.name", "clevertree-chat-ai")
        email = config.get("user.email", "clevertree-chat-ai@clevertree.chat")
        ident = f"{name} <{email}>".encode()
        porcelain.commit(cwd, message=(message if message.endswith("\n") else message + "\n").encode(), author=ident, committer=ident)
        return 0, ""
    if command == "checkout":
        if rest and rest[0] == "-b":
            porcelain.branch_create(cwd, rest[1].encode())
            porcelain.checkout(cwd, target=rest[1].encode(), force=True)
            return 0, ""
        porcelain.checkout(cwd, target=rest[0].encode(), force=True)
        return 0, ""
    repo = Repo(cwd)
    if command == "status":
        return 0, _status(porcelain, cwd)
    if command == "rev-parse":
        if "--abbrev-ref" in rest:
            names = repo.refs.follow(b"HEAD")[0]
            return 0, names[-1].decode().rsplit("/", 1)[-1] + "\n"
        return 0, repo.head().decode() + "\n"
    if command == "log":
        commit = repo[repo.head()]
        author = commit.author.decode()
        person, mail = author.split(" <", 1)
        mail = mail.rstrip(">")
        if "%ae" in " ".join(rest):
            return 0, mail + "\n"
        return 0, person + "\n"
    if command == "ls-files":
        names = sorted(path.decode() for path in repo.open_index())
        text = "\n".join(names)
        return 0, (text + "\n") if text else ""
    if command == "config":
        try:
            value = repo.get_config().get((b"user",), b"name")
        except KeyError:
            return 1, ""
        return 0, value.decode() + "\n"
    if command == "push":
        remote, branch = rest[0], rest[1]
        porcelain.push(cwd, remote, refspecs=[f"refs/heads/{branch}:refs/heads/{branch}".encode()])
        return 0, ""
    if command == "show":
        return _show(repo, tree_changes, RenameDetector, rest)
    if command == "cat-file":
        spec = rest[-1]
        rev, _, path = spec.partition(":")
        if _blob(repo, rev, path) is None:
            return 1, ""
        return 0, ""
    raise ValueError(command)


def _status(porcelain, cwd) -> str:
    state = porcelain.status(cwd)
    lines = []
    for kind, prefix in (("add", "A  "), ("modify", "M  "), ("delete", "D  ")):
        for path in state.staged[kind]:
            lines.append(prefix + _text(path))
    for path in state.unstaged:
        lines.append(" M " + _text(path))
    for path in state.untracked:
        lines.append("?? " + _text(path))
    return ("\n".join(lines) + "\n") if lines else ""


def _show(repo, tree_changes, RenameDetector, rest):
    spec = ""
    for item in rest:
        if item.startswith("-"):
            continue
        spec = item
    if ":" in spec:
        rev, _, path = spec.partition(":")
        blob = _blob(repo, rev, path)
        if blob is None:
            return 1, ""
        return 0, blob.decode()
    rev = spec or "HEAD"
    commit = repo[_commit_sha(repo, rev)]
    parent = repo[commit.parents[0]].tree if commit.parents else None
    changes = tree_changes(
        repo.object_store,
        parent,
        commit.tree,
        rename_detector=RenameDetector(repo.object_store),
    )
    name_status = "--name-status" in rest
    lines = []
    for change in changes:
        kind = _text(change.type)
        old = _text(change.old.path) if change.old is not None and change.old.path else ""
        new = _text(change.new.path) if change.new is not None and change.new.path else ""
        if name_status:
            if kind == "rename":
                lines.append(f"R100\t{old}\t{new}")
            elif kind == "delete":
                lines.append(f"D\t{old}")
            elif kind == "add":
                lines.append(f"A\t{new}")
            else:
                lines.append(f"M\t{new or old}")
        else:
            lines.append(new or old)
    return 0, ("\n".join(line for line in lines if line) + "\n") if lines else ""


def _blob(repo, rev: str, path: str):
    try:
        commit = repo[_commit_sha(repo, rev)]
        _mode, sha = repo[commit.tree].lookup_path(repo.__getitem__, path.encode())
    except KeyError:
        return None
    return repo[sha].data


def _commit_sha(repo, rev: str):
    if rev == "HEAD":
        return repo.head()
    if rev == "HEAD^":
        commit = repo[repo.head()]
        if not commit.parents:
            raise KeyError(rev)
        return commit.parents[0]
    ref = f"refs/heads/{rev}".encode()
    if ref in repo.refs:
        return repo.refs[ref]
    return rev.encode()


def _text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode()
    return str(value)
