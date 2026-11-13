"""Git comments branch. Commits set the author with -c, not git config."""

from __future__ import annotations

import subprocess
from pathlib import Path

from clevertree_chat import SERVICE_EMAIL, SERVICE_ID
from clevertree_chat.gitcmd import run as git_run

_BINARY_SUFFIXES = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".bin",
    ".exe",
    ".pdf",
    ".zip",
}


class CommentsRepo:
    BRANCH = "comments"

    def __init__(self, path: Path):
        self.path = Path(path)

    @classmethod
    def create(cls, path: str | Path) -> "CommentsRepo":
        path = Path(path)
        path.mkdir(parents=True, exist_ok=True)
        init = git_run(["git", "init", "-b", "main"], path, check=False)
        if init.returncode != 0:
            git_run(["git", "init"], path)
            git_run(["git", "checkout", "-b", "main"], path)
        (path / "README").write_text("Debate records live on the comments branch.\n")
        git_run(["git", "add", "README"], path)
        _commit(path, "start comments repo")
        git_run(["git", "checkout", "-b", "comments"], path)
        return cls(path)

    def _run(self, args: list[str], check: bool = True) -> subprocess.CompletedProcess:
        return git_run(args, self.path, check=check)

    def branch(self) -> str:
        return self._run(["git", "rev-parse", "--abbrev-ref", "HEAD"]).stdout.strip()

    def checkout_comments(self) -> None:
        if self.branch() != self.BRANCH:
            self._run(["git", "checkout", self.BRANCH])

    def status(self) -> str:
        return self._run(["git", "status", "--porcelain"]).stdout

    def head(self) -> str:
        return self._run(["git", "rev-parse", "HEAD"]).stdout.strip()

    def log_author(self, rev: str = "HEAD") -> str:
        return self._run(["git", "log", "-1", "--format=%an", rev]).stdout.strip()

    def commit_files_list(self, rev: str = "HEAD") -> list[str]:
        text = self._run(["git", "show", "--name-only", "--pretty=format:", rev]).stdout
        return [line for line in text.splitlines() if line.strip()]

    def local_identity_configured(self) -> bool:
        completed = self._run(["git", "config", "--local", "--get", "user.name"], check=False)
        return completed.returncode == 0 and bool(completed.stdout.strip())

    def files(self) -> list[str]:
        text = self._run(["git", "ls-files"]).stdout
        return [line for line in text.splitlines() if line.strip()]

    def read(self, relative: str) -> str:
        return (self.path / relative).read_text()

    def commit_changes(
        self,
        writes: dict[str, str],
        deletes: list[str],
        message: str,
        author: str,
    ) -> bool:
        if author is None or str(author).strip() == "" or str(author).lower() == "anonymous":
            raise PermissionError("anonymous writes are rejected")
        if author != SERVICE_ID:
            raise PermissionError("only clevertree-chat-ai may commit comment-branch files")
        for relative, content in writes.items():
            suffix = Path(relative).suffix.lower()
            if suffix in _BINARY_SUFFIXES:
                raise ValueError("binaries are rejected")
            if not isinstance(content, str) or "\0" in content:
                raise ValueError("binaries are rejected")
        self.checkout_comments()
        for relative, content in writes.items():
            dest = self.path / relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(content)
        for relative in deletes:
            dest = self.path / relative
            if dest.is_file():
                dest.unlink()
        _prune_empty(self.path / "pages")
        self._run(["git", "add", "-A"])
        if not self.status().strip():
            return False
        _commit(self.path, message)
        if self.log_author() != SERVICE_ID:
            raise RuntimeError("comment-branch commit author was not the AI service")
        return True

    def publish(self, remotes: list[str]) -> None:
        self.checkout_comments()
        for remote in remotes:
            self._run(["git", "push", str(remote), self.BRANCH])


def git_commit_command(message: str) -> list[str]:
    """The commit argv. Identity is -c on this command, never git config."""
    return [
        "git",
        "-c",
        f"user.name={SERVICE_ID}",
        "-c",
        f"user.email={SERVICE_EMAIL}",
        "commit",
        "-m",
        message,
    ]


def _commit(path: Path, message: str) -> None:
    git_run(git_commit_command(message), path)


def _prune_empty(root: Path) -> None:
    if not root.exists():
        return
    for path in sorted(root.rglob("*"), reverse=True):
        if path.is_dir() and not any(path.iterdir()):
            path.rmdir()
