"""Page association graph (canonical + aliases). Architecture locked; batch fills later.

See docs/url-pages-and-associations.md. Live path opens provisional page ids;
batch decides merges/links without storing a web corpus.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ASSOCIATIONS_FILE = "associations.json"


def empty_graph() -> dict[str, Any]:
    return {"schema": "clevertree.associations.v1", "pages": {}}


def load_graph(repo_path: Path) -> dict[str, Any]:
    path = Path(repo_path) / ASSOCIATIONS_FILE
    if not path.is_file():
        return empty_graph()
    try:
        data = json.loads(path.read_text())
    except Exception:
        return empty_graph()
    if not isinstance(data, dict):
        return empty_graph()
    data.setdefault("schema", "clevertree.associations.v1")
    data.setdefault("pages", {})
    return data


def dump_graph(graph: dict[str, Any]) -> str:
    return json.dumps(graph, indent=2, sort_keys=True) + "\n"


def ensure_page(graph: dict[str, Any], page_id: str, *, kind: str = "topic") -> dict[str, Any]:
    pages = graph.setdefault("pages", {})
    row = pages.get(page_id) or {
        "canonical": page_id,
        "aliases": [],
        "links": [],
        "kind": kind,
    }
    row["canonical"] = row.get("canonical") or page_id
    row.setdefault("aliases", [])
    row.setdefault("links", [])
    row["kind"] = row.get("kind") or kind
    pages[page_id] = row
    return row


def add_alias(graph: dict[str, Any], canonical: str, alias: str) -> dict[str, Any]:
    """Fold alias under canonical (mirrors / AMP / mobile twins)."""
    if not canonical or not alias or canonical == alias:
        return ensure_page(graph, canonical or alias)
    row = ensure_page(graph, canonical)
    aliases = list(row.get("aliases") or [])
    if alias not in aliases and alias != canonical:
        aliases.append(alias)
    row["aliases"] = sorted(set(aliases))
    # Point alias record at canonical
    alias_row = ensure_page(graph, alias, kind=str(row.get("kind") or "topic"))
    alias_row["canonical"] = canonical
    return row


def link_related(graph: dict[str, Any], left: str, right: str) -> None:
    """Related but distinct — link, do not merge."""
    if not left or not right or left == right:
        return
    for a, b in ((left, right), (right, left)):
        row = ensure_page(graph, a)
        links = list(row.get("links") or [])
        if b not in links:
            links.append(b)
        row["links"] = sorted(set(links))


def resolve_canonical(graph: dict[str, Any], page_id: str) -> str:
    row = (graph.get("pages") or {}).get(page_id) or {}
    return str(row.get("canonical") or page_id)
