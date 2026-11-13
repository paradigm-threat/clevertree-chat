"""Passkeys in a private repo. The pepper never enters that repo.

WebAuthn only: a discoverable credential with user verification required.
No passwords. No Digital Credentials API.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from dataclasses import dataclass
from pathlib import Path

from clevertree_chat import SERVICE_EMAIL, SERVICE_ID
from clevertree_chat.gitcmd import run as git_run

RELATED_ORIGINS = (
    "https://clevertree.chat",
    "https://myproblem.app",
)
LOGIN_METHOD = "webauthn"


def normalize_email(email: str) -> str:
    return email.strip().lower()


def email_hmac(pepper: bytes, email: str) -> str:
    """HMAC-SHA256(pepper, normalized email). A bare hash is not used."""
    if isinstance(pepper, str):
        pepper = pepper.encode()
    digest = hmac.new(pepper, normalize_email(email).encode(), hashlib.sha256)
    return digest.hexdigest()


def registration_options(uuid: str) -> dict:
    return {
        "rp": {"name": "Clevertree Chat", "id": "clevertree.chat"},
        "user": {"id": uuid, "name": uuid},
        "pubKeyCredParams": [{"type": "public-key", "alg": -7}],
        "authenticatorSelection": {
            "residentKey": "required",
            "requireResidentKey": True,
            "userVerification": "required",
        },
        "attestation": "none",
        "timeout": 60000,
    }


def authentication_options() -> dict:
    return {
        "userVerification": "required",
        "mediation": "conditional",
        "allowCredentials": [],
        "autocomplete": "username webauthn",
    }


@dataclass
class Session:
    """httpOnly cookie equivalent. The API layer refuses a bare UUID once a passkey exists."""

    token: str
    uuid: str
    http_only: bool = True
    name: str = "clevertree_session"

    def header(self) -> str:
        flags = "HttpOnly; Path=/; SameSite=Lax" if self.http_only else "Path=/"
        return f"{self.name}={self.token}; {flags}"


class AuthRepo:
    """Private git repo `clevertree-chat-auth`. Tests pass a temp directory."""

    def __init__(self, path: Path, pepper: bytes):
        self.path = Path(path)
        self.pepper = pepper if isinstance(pepper, bytes) else str(pepper).encode()
        self._sessions: dict[str, str] = {}

    @classmethod
    def create(cls, path: str | Path, pepper: bytes) -> "AuthRepo":
        path = Path(path)
        path.mkdir(parents=True, exist_ok=True)
        git_run(["git", "init", "-b", "main"], path)
        note = path / "README"
        note.write_text(
            "Private auth repo clevertree-chat-auth.\n"
            "Credential id, public key, email HMAC, and the UUID they unlock.\n"
            "The pepper is a node secret and is not stored here.\n"
            "Comments, votes, short ids, and visible names are not stored here.\n"
        )
        git_run(["git", "add", "README"], path)
        git_run(
            [
                "git",
                "-c",
                f"user.name={SERVICE_ID}",
                "-c",
                f"user.email={SERVICE_EMAIL}",
                "commit",
                "-m",
                "start auth repo",
            ],
            path,
        )
        return cls(path, pepper)

    def _write(self, relative: str, content: str, message: str) -> None:
        dest = self.path / relative
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(content)
        git_run(["git", "add", "-A"], self.path)
        git_run(
            [
                "git",
                "-c",
                f"user.name={SERVICE_ID}",
                "-c",
                f"user.email={SERVICE_EMAIL}",
                "commit",
                "-m",
                message,
            ],
            self.path,
        )

    def register_passkey(
        self,
        debate,
        *,
        uuid: str,
        credential_id: str,
        public_key: str,
        email: str | None = None,
    ) -> None:
        record = {
            "credential_id": credential_id,
            "public_key": public_key,
            "uuid": uuid,
        }
        if email:
            record["email_hmac"] = email_hmac(self.pepper, email)
        payload = json.dumps(record, indent=2, sort_keys=True) + "\n"
        self._write(f"credentials/{credential_id}.json", payload, "register passkey")
        if debate is not None and not debate.knows_user(uuid):
            debate.ensure_user(uuid)

    def has_passkey(self, uuid: str) -> bool:
        root = self.path / "credentials"
        if not root.exists():
            return False
        for path in root.glob("*.json"):
            data = json.loads(path.read_text())
            if data.get("uuid") == uuid:
                return True
        return False

    def begin_session(self, credential_id: str) -> Session:
        path = self.path / "credentials" / f"{credential_id}.json"
        data = json.loads(path.read_text())
        token = secrets.token_urlsafe(32)
        session = Session(token=token, uuid=data["uuid"], http_only=True)
        self._sessions[token] = data["uuid"]
        record = json.dumps({"token": token, "uuid": data["uuid"]}, indent=2, sort_keys=True) + "\n"
        self._write(f"sessions/{token}.json", record, "start session")
        return session

    def session_matches(self, session: Session | None) -> bool:
        if session is None or not session.http_only:
            return False
        if self._sessions.get(session.token) == session.uuid:
            return True
        path = self.path / "sessions" / f"{session.token}.json"
        if not path.is_file():
            return False
        data = json.loads(path.read_text())
        return data.get("uuid") == session.uuid and data.get("token") == session.token

    def files_text(self) -> str:
        chunks = []
        for path in sorted(self.path.rglob("*")):
            if not path.is_file() or ".git" in path.parts:
                continue
            chunks.append(path.read_text(errors="replace"))
        return "\n".join(chunks)
