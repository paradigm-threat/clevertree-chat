# IRC backbone (Ergo ↔ Cleverchat)

Realtime updates flow through **Linode Ergo IRC** (`pub1.relaygateway.net`; `mesh1` / `mesh2` proxy the same network). The Cleverchat host runs a thin bridge that mirrors IRC into the public board path and fans events to WebSocket clients. Permanent SoT filing (when enabled) is batch / AI consolidation — channel logs are temporary.

**Verified 2026-11-26:** `flashback-ergo` + `flashback-chat-edge` + irc-agent active on **pub1**; mesh1/mesh2 edge-only (`flashback-irc-proxy@6667` + agent); park `/chat/api/health` OK on Flashback + PT. Spot private-queue intake is gone — public mesh is IRC-only; private queues are premium.

| | |
|--|--|
| Primary | `pub1.relaygateway.net` (TLS `:6697` when exposed; mesh `:6667` proxy) |
| Mirrors | `mesh1.relaygateway.net`, `mesh2.relaygateway.net` — clients auto-failover |
| Bridge nick | `clevertree-si` (`CLEVERTREE_IRC_NICK`) |
| Bot denylist | `CLEVERTREE_IRC_BOT_NICKS` (default includes `clevertree-si`, `clevertree-ai`, …) — never act on these nicks |
| Enable | `CLEVERTREE_IRC_ENABLE=1` |

## Channel policy (repo-defined)

See [`fronts/room/channel-policy.json`](../fronts/room/channel-policy.json) and [`context-tags.md`](context-tags.md).

- **Paradigm Threat (default):** **one** channel `#pt` for the whole repo (`CLEVERTREE_IRC_CONSOLIDATE_PT=1`). Former `#pt-<topic>` rooms consolidate here; page identity uses `[[t:topic]]` tags in the message body.
- **MyProblem public demo:** homepage always embeds a room — default `#mp-general`; allowlist also `#ga-savannah-cat-rescue` (routes `/c/mp-general`, `/c/ga-savannah-cat-rescue`; unknown → general). See `channel-policy.json` `myproblem.demo_allowlist`.
- **MyProblem collections:** typically one channel per collection (e.g. `#ga-savannah-cat-rescue`), listed in collection JSON / `CRAFT_CHANNELS`.
- Every repo has a **default/general** channel for untagged traffic and direct connects.

## Sync rules

- Human `PRIVMSG` → intake (anonymous nick; no chat visitor UUID required for room UX).
- Board/API → `PRIVMSG`; echo skipped for bridge + bot denylist.
- **Outbound soft limit:** `IRC_PRIVMSG_SOFT_MAX = 400` characters (`irc_client.privmsg`). Long `SI batch:` / `SI investigate:` posts keep **full text** in the room log/WS and send a short IRC teaser (“Full steps in the room.”).
- Owner answers: `!answer …` / `si answer:` → `owner-answers.md` / `rules.md`.
- **Ephemeral channel logs:** wire cache may vanish after consolidation into the tip/collection repo.
- Extensions and embeds use **HTTPS/WSS** to chat-edge / api host, not raw IRC TCP from the browser.
- **Shared room UI:** [`fronts/room/`](../fronts/room/) — Relay extension wraps it with Refresh only ([`fronts/relay-extension/`](../fronts/relay-extension/)).

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
