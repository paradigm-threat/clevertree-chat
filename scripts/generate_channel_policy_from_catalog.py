#!/usr/bin/env python3
"""Generate fronts/room/channel-policy.json product_hosts + website_default_channels
from relay-master catalog (irc-channels.json + repos/*/chat).

Does not delete hand-authored repo extras (myproblem channel map, starters).
Merges catalog defaults into an existing policy file.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = Path("/home/ari/dev/relay/relay-master")
POLICY = ROOT / "fronts" / "room" / "channel-policy.json"


def main() -> int:
    catalog_root = Path(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CATALOG)
    irc_path = catalog_root / "catalog" / "irc-channels.json"
    repos_dir = catalog_root / "catalog" / "repos"
    if not irc_path.is_file():
        print(f"missing {irc_path}", file=sys.stderr)
        return 1

    irc = json.loads(irc_path.read_text(encoding="utf-8"))
    channels = irc.get("channels") or {}

    policy = json.loads(POLICY.read_text(encoding="utf-8")) if POLICY.is_file() else {
        "schema": "clevertree.channel-policy.v1",
        "repos": {},
        "product_hosts": {},
    }

    website_defaults: list[str] = []
    product_hosts = dict(policy.get("product_hosts") or {})

    for repo_file in sorted(repos_dir.glob("*.json")):
        rec = json.loads(repo_file.read_text(encoding="utf-8"))
        chat = rec.get("chat") or {}
        default = chat.get("default_channel")
        if not default:
            continue
        if not str(default).startswith("#"):
            default = "#" + default
        website_defaults.append(default)
        for host in rec.get("domains") or []:
            product_hosts[host.lower()] = {
                "repo": rec.get("repo"),
                "channel": default,
            }

    # Ensure product channels from irc inventory that map to repos
    for name, meta in channels.items():
        if (meta or {}).get("kind") != "product":
            continue
        if name not in website_defaults and (meta or {}).get("repo"):
            website_defaults.append(name)

    # Stable unique order
    seen = set()
    ordered = []
    for ch in website_defaults:
        if ch not in seen:
            seen.add(ch)
            ordered.append(ch)

    policy["product_hosts"] = product_hosts
    policy["website_default_channels"] = ordered
    policy["notes"] = (
        (policy.get("notes") or "")
        + " | product_hosts/website_default_channels refreshed from relay-master catalog."
    ).strip(" |")
    policy["catalog_source"] = str(irc_path)

    POLICY.write_text(json.dumps(policy, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {POLICY} ({len(ordered)} website defaults, {len(product_hosts)} hosts)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
