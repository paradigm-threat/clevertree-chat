# IRC backbone (Ergo ↔ Cleverchat)

Realtime updates flow through **Linode Ergo IRC** (`pub1.relaygateway.net`; `mesh1` / `mesh2` proxy the same network). The Cleverchat host runs a thin bridge that mirrors IRC into the debate board (IRC room + SI panel) and fans events to WebSocket clients. Permanent SoT filing (when enabled) is batch / AI consolidation — channel logs are temporary.

**Verified 2026-11-26:** `flashback-ergo` + `flashback-chat-edge` + irc-agent active on **pub1**; mesh1/mesh2 edge-only (`flashback-irc-proxy@6667` + agent); park `/chat/api/health` OK on Flashback + PT. Spot private-queue intake is gone — public mesh is IRC-only; private queues are premium.

| | |
|--|--|
| Primary | `pub1.relaygateway.net` (TLS `:6697` when exposed; mesh `:6667` proxy) |
| Mirrors | `mesh1.relaygateway.net`, `mesh2.relaygateway.net` — clients auto-failover |
| Bridge nick | `clevertree-si` (`CLEVERTREE_IRC_NICK`) |
| Bot denylist | `CLEVERTREE_IRC_BOT_NICKS` (default includes `clevertree-si`, `clevertree-ai`, …) — never act on these nicks |
| Enable | `CLEVERTREE_IRC_ENABLE=1` |

## Debate board (IRC + SI)

The product surface is a **shared room**: rich IRC history/composer plus a toggleable **SI panel** (batch-curated workspace). Batch SI uses **Groq / Bedrock / peers only** — no GPU batch servers / Spot wake.

One **Clevertree Chat** browser extension works on **all websites**. Default panel = IRC + SI toggle only. **Networker** (Gather / Track / Refresh) is **off by default** and configured only on the extension Options page.

## Channel policy (repo-defined)

See [`fronts/room/channel-policy.json`](../fronts/room/channel-policy.json) and [`context-tags.md`](context-tags.md).

- **Paradigm Threat:** **one** channel `#pt` (`CLEVERTREE_IRC_CONSOLIDATE_PT=1`). Topics via trailing `[[t:N]]` from human `chat/topics.json` (`0` = general).
- **Public web catch-all:** `#web` for every non-product site (extension default). Domain attribution `[[d:example.com]]` — not page path.
- **MyProblem public demo:** `#mp-general`; allowlist also `#ga-savannah-cat-rescue` (`/c/…`). See `channel-policy.json` `myproblem.demo_allowlist`.
- **MyProblem collections:** typically one channel per collection (`CRAFT_CHANNELS`).
- Product sites use a **header corner chat** button (dock or extension side panel) — no in-article scrolled chat.

## Sync rules

- Human `PRIVMSG` → intake (anonymous nick; no chat visitor UUID required for room UX).
- Room/API → `PRIVMSG`; echo skipped for bridge + bot denylist.
- **Outbound soft limit:** `IRC_PRIVMSG_SOFT_MAX = 400` characters (`irc_client.privmsg`). Long `SI batch:` / `SI investigate:` posts keep **full text** in the room log/WS and send a short IRC teaser (“Full steps in the room.”).
- Owner answers: `!answer …` / `si answer:` → `owner-answers.md` / `rules.md`.
- **Ephemeral channel logs:** wire cache may vanish after consolidation into the tip/collection repo.
- Extensions and embeds use **HTTPS/WSS** to chat-edge / api host, not raw IRC TCP from the browser.
- **Shared room UI:** [`fronts/room/`](../fronts/room/) — one component for dock, lobby, and extension side panel.

## Environment

| Var | Default | Role |
|--|--|--|
| `CLEVERTREE_IRC_ENABLE` | off locally | Start bridge |
| `CLEVERTREE_IRC_HOST` | `pub1.relaygateway.net` | Ergo hub |
| `CLEVERTREE_IRC_PORT` | `6697` | TLS port |
| `CLEVERTREE_IRC_TLS` | `1` | Wrap socket |
| `CLEVERTREE_IRC_NICK` | `clevertree-si` | Bridge nick |
| `CLEVERTREE_IRC_PREFIX` | `pt` | Default prefix |
| `CLEVERTREE_IRC_CONSOLIDATE_PT` | `1` | Map all PT topics → `#pt` |
| `CLEVERTREE_IRC_BOT_NICKS` | si/ai/… | Self-ignore denylist |

## Related

- [chat-host.md](chat-host.md) · [context-tags.md](context-tags.md) · [intake-queue.md](intake-queue.md) · PT mesh chat ops in fan-edits `ops/chat/README.md`
