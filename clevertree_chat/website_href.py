"""Parse clevertree.chat /w/… paths into a target website URL.

Share links look like:
  /w/example.com
  /w/example.com/article/path
  /w/https://example.com/article
  /w?url=https://example.com/article

Host-only → domain scope (one debate per site). Host + path → path scope.
Nothing is written to the comments SoT until the first human comment.
"""

from __future__ import annotations

from urllib.parse import unquote, urlparse


def href_and_scope_from_w(
    path_remainder: str = "",
    query_url: str = "",
) -> tuple[str, str]:
    """Return (href, page_scope) where page_scope is ``domain`` or ``path``.

    Empty inputs → ("", "").
    """
    raw = (query_url or "").strip()
    if not raw:
        rem = (path_remainder or "").strip().lstrip("/")
        if not rem:
            return "", ""
        raw = unquote(rem)

    lowered = raw.lower()
    if lowered.startswith("http://") or lowered.startswith("https://"):
        href = raw
    else:
        # Bare host or host/path — assume https.
        href = "https://" + raw.lstrip("/")

    try:
        parts = urlparse(href)
    except Exception:
        return "", ""
    host = (parts.hostname or "").lower().removeprefix("www.")
    if not host:
        return "", ""
    scheme = (parts.scheme or "https").lower()
    if scheme not in {"http", "https"}:
        scheme = "https"
    path = parts.path or "/"
    # Rebuild without www and without fragment.
    netloc = host
    if parts.port and not (
        (scheme == "http" and parts.port == 80) or (scheme == "https" and parts.port == 443)
    ):
        netloc = f"{host}:{parts.port}"
    query = f"?{parts.query}" if parts.query else ""
    href = f"{scheme}://{netloc}{path}{query}"

    path_only = path.rstrip("/") or ""
    if not path_only:
        return href if href.endswith("/") else href + "/", "domain"
    return href if path.endswith("/") or query else href, "path"
