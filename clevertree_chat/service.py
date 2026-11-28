"""The live debate API. A choice is only the starting slot. The batch may move it."""

from __future__ import annotations

import time

from clevertree_chat.auth import Session, authentication_options, registration_options
from clevertree_chat.gauge import measure_batch, record_submit
from clevertree_chat.view import build_view

PAGE = "try"


class DebateService:
    def __init__(self, debate, auth):
        self.debate = debate
        self.auth = auth

    def view(self, topic: str, focus: str = "", visitor: str = "") -> dict:
        return self.view_for_page(PAGE, topic, focus=focus, visitor=visitor)

    def view_for_page(self, page: str, topic: str, focus: str = "", visitor: str = "") -> dict:
        if not str(topic or "").strip():
            return build_view(self.debate, page=page, topic="", focus=focus, visitor=visitor)
        return build_view(self.debate, page=page, topic=topic, focus=focus, visitor=visitor)

    def preview(self, topic: str, body: str) -> dict:
        return self.preview_for_page(PAGE, topic, body)

    def preview_for_page(self, page: str, topic: str, body: str) -> dict:
        result = self.debate.preview(page=page, topic=topic, body=body or "")
        result["filed"] = False
        return result

    def submit(
        self,
        visitor: str,
        topic: str,
        body: str,
        chosen: str | None = None,
        name: str | None = None,
        session: Session | None = None,
    ) -> dict:
        return self.submit_for_page(
            PAGE, visitor, topic, body, chosen=chosen, name=name, session=session
        )

    def submit_for_page(
        self,
        page: str,
        visitor: str,
        topic: str,
        body: str,
        chosen: str | None = None,
        name: str | None = None,
        session: Session | None = None,
    ) -> dict:
        started = time.perf_counter()
        filed = self.debate.submit(
            visitor,
            page=page,
            topic=topic,
            body=body,
            chosen=chosen or None,
            session=session,
        )
        if name and str(name).strip():
            self.debate.set_name(visitor, name, session=session)
        latency_ms = (time.perf_counter() - started) * 1000
        record_submit(self.debate, filed["starting"], latency_ms)
        filed["latency_ms"] = round(latency_ms, 3)
        filed["body"] = body
        filed["view"] = self.view_for_page(page, topic, visitor=visitor)
        return filed

    def drain(self, topic: str = "", visitor: str = "") -> dict:
        return self.drain_for_page(PAGE, topic, visitor)

    def drain_for_page(self, page: str, topic: str = "", visitor: str = "") -> dict:
        result = self.debate.drain()
        hooks = {}
        if result.commits:
            try:
                from clevertree_chat.batch_hooks import after_drain

                hooks = after_drain(self.debate, topics=[topic] if topic else None)
            except Exception:
                hooks = {"error": "hooks_failed"}
        echo = measure_batch(self.debate)
        return {
            "hardware_should_shut_down": result.hardware_should_shut_down,
            "message": result.message,
            "commits": result.commits,
            "batch_notice": result.message,
            "cloud_api_called": bool(echo.get("cloud_api_called")),
            "booted": bool(echo.get("booted")),
            "wake_requested": bool(echo.get("wake_requested")),
            "wake": echo["wake"],
            "decommission": echo["decommission"],
            "hooks": hooks,
            "view": self.view_for_page(page, topic, visitor=visitor) if topic else None,
        }

    def vote(
        self,
        visitor: str,
        *,
        topic: str,
        level: str,
        key: str | None = None,
        comment: str | None = None,
        session: Session | None = None,
    ) -> dict:
        self.debate.vote(
            visitor,
            page=PAGE,
            level=level,
            topic=topic,
            key=key,
            comment=comment,
            session=session,
        )
        return self.view(topic, visitor=visitor)

    def set_name(self, visitor: str, name: str, topic: str = "", session: Session | None = None) -> dict:
        from clevertree_chat.nick_claims import NickTakenError, claim_nick_for_visitor

        try:
            claim = claim_nick_for_visitor(name, visitor, allow_suffix=True)
        except NickTakenError as exc:
            raise PermissionError("nick_taken") from exc
        filed = str(claim.get("nick") or name)
        self.debate.set_name(visitor, filed, session=session)
        view = self.view(topic, visitor=visitor) if topic else {"name": filed}
        if isinstance(view, dict):
            view["name"] = filed
            view["nick"] = filed
            view["claim"] = {
                "nick": filed,
                "locked": bool(claim.get("locked")),
            }
        return view

    def passkey_options(self, visitor: str) -> dict:
        return {"options": registration_options(visitor), "login": authentication_options()}

    def register_passkey(
        self,
        visitor: str,
        credential_id: str,
        public_key: str,
        email: str | None = None,
    ) -> dict:
        if self.auth is None:
            raise RuntimeError("auth_unavailable")
        if not str(credential_id or "").strip() or not str(public_key or "").strip():
            raise ValueError("credential_id_and_public_key_required")
        self.auth.register_passkey(
            self.debate,
            uuid=visitor,
            credential_id=credential_id,
            public_key=public_key,
            email=email,
        )
        session = self.auth.begin_session(credential_id)
        return {"saved": True, "session": session}
