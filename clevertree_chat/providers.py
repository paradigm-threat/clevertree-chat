"""Metered text providers: Groq free tier first, Bedrock on rate-limit failover.

Text SI / curation / gray-zone calls use ``complete_text``. Channel Whisper ASR
stays on Groq only — there is no Bedrock drop-in for transcription here (do not
invent Marketplace Whisper). See MyProblem ``docs/providers-ai.md``.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

log = logging.getLogger("clevertree.providers")

DEFAULT_GROQ_TEXT_MODEL = "openai/gpt-oss-20b"
DEFAULT_BEDROCK_MODEL = "anthropic.claude-3-haiku-20240307-v1:0"
DEFAULT_BEDROCK_REGION = "us-east-1"


class ProviderError(RuntimeError):
    """Provider call failed without a usable completion."""

    def __init__(self, message: str, *, status: int | None = None, provider: str = ""):
        super().__init__(message)
        self.status = status
        self.provider = provider


@dataclass(frozen=True)
class TextCompletion:
    text: str
    provider: str  # groq | bedrock
    model: str
    failover: bool = False


def _truthy(name: str, default: str = "0") -> bool:
    return (os.environ.get(name) or default).strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def failover_enabled() -> bool:
    """CLEVERTREE_PROVIDER_FAILOVER defaults on when unset (prefer Groq→Bedrock)."""
    raw = os.environ.get("CLEVERTREE_PROVIDER_FAILOVER")
    if raw is None or not str(raw).strip():
        return True
    return _truthy("CLEVERTREE_PROVIDER_FAILOVER", "1")


def failover_on_5xx() -> bool:
    return _truthy("CLEVERTREE_BEDROCK_FAILOVER_ON_5XX", "1")


def groq_api_key() -> str:
    return (os.environ.get("GROQ_API_KEY") or "").strip()


def groq_text_model() -> str:
    return (
        os.environ.get("GROQ_TEXT_MODEL")
        or os.environ.get("GROQ_SI_MODEL")
        or DEFAULT_GROQ_TEXT_MODEL
    ).strip()


def bedrock_region() -> str:
    return (
        os.environ.get("CLEVERTREE_BEDROCK_REGION")
        or os.environ.get("AWS_REGION")
        or os.environ.get("AWS_DEFAULT_REGION")
        or DEFAULT_BEDROCK_REGION
    ).strip()


def bedrock_model_id() -> str:
    return (
        os.environ.get("CLEVERTREE_BEDROCK_MODEL_ID")
        or os.environ.get("BEDROCK_MODEL_ID")
        or DEFAULT_BEDROCK_MODEL
    ).strip()


def bedrock_credentials() -> tuple[str, str, str] | None:
    """Return (access_key, secret_key, session_token) or None if incomplete."""
    access = (os.environ.get("AWS_ACCESS_KEY_ID") or "").strip()
    secret = (os.environ.get("AWS_SECRET_ACCESS_KEY") or "").strip()
    token = (os.environ.get("AWS_SESSION_TOKEN") or "").strip()
    if not access or not secret:
        return None
    return access, secret, token


def bedrock_configured() -> bool:
    return bedrock_credentials() is not None


def is_rate_limit_error(status: int | None, body: str = "") -> bool:
    if status == 429:
        return True
    lower = (body or "").lower()
    needles = (
        "rate limit",
        "rate_limit",
        "ratelimit",
        "too many requests",
        "quota",
        "tokens per day",
        "tpm",
        "rpm",
        "over capacity",
    )
    return any(n in lower for n in needles)


def parse_retry_after_s(body: str = "", *, default: float = 15.0) -> float:
    """Best-effort seconds until Groq says we may retry (from JSON error text)."""
    import re

    text = body or ""
    # "Please try again in 2.185714285s"
    m = re.search(r"try again in\s+([0-9]+(?:\.[0-9]+)?)\s*s", text, re.I)
    if m:
        try:
            return max(1.0, float(m.group(1)))
        except ValueError:
            pass
    m = re.search(r"retry[_ -]?after[\"':\s]+([0-9]+(?:\.[0-9]+)?)", text, re.I)
    if m:
        try:
            return max(1.0, float(m.group(1)))
        except ValueError:
            pass
    return max(1.0, float(default))


def should_failover(status: int | None, body: str = "") -> bool:
    if is_rate_limit_error(status, body):
        return True
    if failover_on_5xx() and status is not None and 500 <= status <= 599:
        return True
    return False


def _http_json(
    url: str,
    *,
    method: str = "POST",
    headers: dict[str, str] | None = None,
    body: bytes | None = None,
    timeout: float = 60.0,
) -> tuple[int, dict[str, Any] | str]:
    # Groq’s edge (Cloudflare) returns 403/1010 when User-Agent is omitted (common from VPS).
    hdrs = {"User-Agent": "clevertree-chat/1.0"}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            status = getattr(resp, "status", None) or resp.getcode()
            try:
                return int(status), json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                return int(status), raw
    except urllib.error.HTTPError as exc:
        raw = ""
        try:
            raw = exc.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        try:
            parsed: dict[str, Any] | str = json.loads(raw) if raw else raw
        except json.JSONDecodeError:
            parsed = raw
        return int(exc.code), parsed


def _body_str(payload: dict[str, Any] | str) -> str:
    if isinstance(payload, str):
        return payload
    try:
        return json.dumps(payload)
    except Exception:
        return str(payload)


def complete_groq(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    temperature: float = 0.2,
    max_tokens: int = 1024,
    response_json: bool = False,
) -> TextCompletion:
    api_key = groq_api_key()
    if not api_key:
        raise ProviderError("missing_GROQ_API_KEY", provider="groq")
    use_model = (model or groq_text_model()).strip()
    payload: dict[str, Any] = {
        "model": use_model,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "messages": messages,
    }
    if response_json:
        payload["response_format"] = {"type": "json_object"}
    status, data = _http_json(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        body=json.dumps(payload).encode("utf-8"),
    )
    if status >= 400 or not isinstance(data, dict):
        raise ProviderError(
            f"groq_http_{status}:{_body_str(data)[:300]}",
            status=status,
            provider="groq",
        )
    choices = data.get("choices") or []
    if not choices:
        raise ProviderError("groq_empty_choices", status=status, provider="groq")
    message = choices[0].get("message") or {}
    text = str(message.get("content") or "").strip()
    # gpt-oss class: completion budget can be spent on `reasoning` with empty content.
    if not text:
        text = str(message.get("reasoning") or "").strip()
        if text and len(text) > 1200:
            text = text[:1197] + "…"
    if not text:
        raise ProviderError("groq_empty_content", status=status, provider="groq")
    return TextCompletion(text=text, provider="groq", model=use_model, failover=False)


def _sign_bedrock(
    *,
    method: str,
    host: str,
    path: str,
    region: str,
    body: bytes,
    access_key: str,
    secret_key: str,
    session_token: str,
) -> dict[str, str]:
    """AWS SigV4 headers for bedrock-runtime (stdlib only — no boto3 required)."""
    service = "bedrock"
    now = datetime.now(timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")
    content_type = "application/json"
    payload_hash = hashlib.sha256(body).hexdigest()
    canonical_headers = (
        f"content-type:{content_type}\n"
        f"host:{host}\n"
        f"x-amz-date:{amz_date}\n"
    )
    signed_headers = "content-type;host;x-amz-date"
    if session_token:
        canonical_headers += f"x-amz-security-token:{session_token}\n"
        signed_headers += ";x-amz-security-token"
    canonical_request = "\n".join(
        [
            method,
            path,
            "",
            canonical_headers,
            signed_headers,
            payload_hash,
        ]
    )
    credential_scope = f"{date_stamp}/{region}/{service}/aws4_request"
    string_to_sign = "\n".join(
        [
            "AWS4-HMAC-SHA256",
            amz_date,
            credential_scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ]
    )

    def _hmac(key: bytes, msg: str) -> bytes:
        return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()

    k_date = _hmac(("AWS4" + secret_key).encode("utf-8"), date_stamp)
    k_region = _hmac(k_date, region)
    k_service = _hmac(k_region, service)
    k_signing = _hmac(k_service, "aws4_request")
    signature = hmac.new(k_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
    authorization = (
        f"AWS4-HMAC-SHA256 Credential={access_key}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )
    headers = {
        "Content-Type": content_type,
        "Host": host,
        "X-Amz-Date": amz_date,
        "Authorization": authorization,
    }
    if session_token:
        headers["X-Amz-Security-Token"] = session_token
    return headers


def complete_bedrock(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    temperature: float = 0.2,
    max_tokens: int = 1024,
) -> TextCompletion:
    creds = bedrock_credentials()
    if not creds:
        raise ProviderError("missing_AWS_credentials", provider="bedrock")
    access_key, secret_key, session_token = creds
    region = bedrock_region()
    use_model = (model or bedrock_model_id()).strip()
    system_parts = [m["content"] for m in messages if m.get("role") == "system" and m.get("content")]
    chat_messages = []
    for m in messages:
        role = m.get("role") or "user"
        if role == "system":
            continue
        if role not in {"user", "assistant"}:
            role = "user"
        content = str(m.get("content") or "")
        chat_messages.append({"role": role, "content": [{"text": content}]})
    if not chat_messages:
        raise ProviderError("bedrock_no_messages", provider="bedrock")
    payload: dict[str, Any] = {
        "messages": chat_messages,
        "inferenceConfig": {
            "temperature": temperature,
            "maxTokens": max_tokens,
        },
    }
    if system_parts:
        payload["system"] = [{"text": "\n\n".join(system_parts)}]
    body = json.dumps(payload).encode("utf-8")
    # modelId in path must be URL-encoded (includes :)
    encoded_model = quote(use_model, safe="")
    path = f"/model/{encoded_model}/converse"
    host = f"bedrock-runtime.{region}.amazonaws.com"
    headers = _sign_bedrock(
        method="POST",
        host=host,
        path=path,
        region=region,
        body=body,
        access_key=access_key,
        secret_key=secret_key,
        session_token=session_token,
    )
    status, data = _http_json(
        f"https://{host}{path}",
        headers=headers,
        body=body,
        timeout=90.0,
    )
    if status >= 400 or not isinstance(data, dict):
        raise ProviderError(
            f"bedrock_http_{status}:{_body_str(data)[:300]}",
            status=status,
            provider="bedrock",
        )
    output = data.get("output") or {}
    message = output.get("message") or {}
    parts = message.get("content") or []
    texts = []
    for part in parts:
        if isinstance(part, dict) and part.get("text"):
            texts.append(str(part["text"]))
    text = "\n".join(texts).strip()
    if not text:
        raise ProviderError("bedrock_empty_content", status=status, provider="bedrock")
    return TextCompletion(text=text, provider="bedrock", model=use_model, failover=False)


def complete_text(
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.2,
    max_tokens: int = 1024,
    response_json: bool = False,
    groq_model: str | None = None,
    bedrock_model: str | None = None,
) -> TextCompletion:
    """Prefer Groq; on rate-limit / optional 5xx, fall back to Bedrock when configured.

    If Groq key is absent but Bedrock creds exist, use Bedrock directly.
    If Bedrock failover is needed but creds are missing, log and re-raise Groq error.
    """
    has_groq = bool(groq_api_key())
    has_bedrock = bedrock_configured()

    if not has_groq and not has_bedrock:
        raise ProviderError("no_text_provider_configured")

    if not has_groq and has_bedrock:
        log.info("text_si: no GROQ_API_KEY — using Bedrock directly")
        result = complete_bedrock(
            messages,
            model=bedrock_model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return TextCompletion(
            text=result.text,
            provider=result.provider,
            model=result.model,
            failover=False,
        )

    try:
        return complete_groq(
            messages,
            model=groq_model,
            temperature=temperature,
            max_tokens=max_tokens,
            response_json=response_json,
        )
    except ProviderError as exc:
        body = str(exc)
        if not (failover_enabled() and should_failover(exc.status, body)):
            raise
        if not has_bedrock:
            log.warning(
                "text_si: Groq rate-limit/5xx (%s) but Bedrock creds missing — staying failed",
                exc.status,
            )
            raise
        log.warning(
            "text_si: Groq %s — failing over to Bedrock model=%s",
            exc.status or "error",
            bedrock_model or bedrock_model_id(),
        )
        result = complete_bedrock(
            messages,
            model=bedrock_model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return TextCompletion(
            text=result.text,
            provider=result.provider,
            model=result.model,
            failover=True,
        )


def provider_status() -> dict[str, Any]:
    """Ops snapshot — no secrets."""
    return {
        "groq_key": bool(groq_api_key()),
        "groq_text_model": groq_text_model(),
        "failover_enabled": failover_enabled(),
        "failover_on_5xx": failover_on_5xx(),
        "bedrock_configured": bedrock_configured(),
        "bedrock_region": bedrock_region(),
        "bedrock_model_id": bedrock_model_id(),
        "asr": {
            "provider": "groq_whisper_only",
            "bedrock_failover": False,
            "note": "Whisper ASR has no Bedrock drop-in; use GROQ_API_KEY or CLEVERTREE_ASR_DRY_RUN",
        },
    }
