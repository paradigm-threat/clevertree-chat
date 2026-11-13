"""Normalize a page URL into the sites-repo path. Phase 1 fixture, no network."""

from __future__ import annotations

import re
from urllib.parse import parse_qsl, urlencode, urlsplit

_SUFFIXES = tuple(
    sorted(
        (
            "co.uk",
            "org.uk",
            "ac.uk",
            "gov.uk",
            "ltd.uk",
            "com.au",
            "net.au",
            "org.au",
            "co.nz",
            "com.br",
            "com",
            "net",
            "org",
            "edu",
            "gov",
            "io",
            "app",
            "chat",
            "dev",
            "uk",
        ),
        key=len,
        reverse=True,
    )
)

_EXACT_DROP = frozenset(
    {
        "fbclid",
        "gclid",
        "gclsrc",
        "dclid",
        "msclkid",
        "mc_cid",
        "mc_eid",
        "igshid",
        "yclid",
        "twclid",
        "ttclid",
        "srsltid",
        "gad_source",
        "gad_campaignid",
        "mkt_tok",
        "_ga",
        "_gl",
        "ref",
        "ref_src",
        "wickedid",
        "fb_action_ids",
        "fb_action_types",
        "fb_source",
        "vero_id",
        "oly_anon_id",
        "oly_enc_id",
        "_hsenc",
        "_hsmi",
        "hsctatracking",
    }
)


def public_suffix(host: str) -> str:
    for suffix in _SUFFIXES:
        if host == suffix or host.endswith("." + suffix):
            return suffix
    labels = host.split(".")
    return labels[-1] if labels else host


def is_tracking(key: str) -> bool:
    lowered = key.lower()
    if lowered.startswith("utm_") or lowered.startswith("utm"):
        return True
    if lowered.startswith("hsa_") or lowered.startswith("mc_"):
        return True
    return lowered in _EXACT_DROP


def normalize_url(url: str) -> str:
    """Public-suffix folder, one trailing slash, campaign tags dropped.

    `id`, `p`, and `story` stay. Two ids are two debates. The fragment is dropped.
    """
    parts = urlsplit(url.strip())
    host = (parts.hostname or "").lower().rstrip(".")
    if host.startswith("www."):
        host = host[4:]
    suffix = public_suffix(host)
    port = parts.port
    scheme = (parts.scheme or "https").lower()
    default_port = (scheme == "http" and port == 80) or (scheme == "https" and port == 443)
    host_label = host if port is None or default_port else f"{host}:{port}"
    path = parts.path or "/"
    path = re.sub(r"/+", "/", path).lower()
    if not path.startswith("/"):
        path = "/" + path
    if not path.endswith("/"):
        path += "/"
    kept = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True) if not is_tracking(key)]
    kept.sort()
    query = urlencode(kept)
    base = f"{suffix}/{host_label}{path}"
    if query:
        return f"{base}?{query}"
    return base
