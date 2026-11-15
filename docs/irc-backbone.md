# IRC backbone (Ergo ↔ Cleverchat)

Realtime updates flow through **Flashback Ergo IRC**. The Cleverchat host runs a thin bridge that mirrors IRC into the durable comments SoT and fans the same events to WebSocket clients.

| | |
|--|--|
| Server | `flashbackrepository.org:6697` (TLS) |
| Prefix | `pt` — lobby `#pt`, topics `#pt-<topic>`, ops `#logs-pt` |
| Bridge nick | `clevertree-si` (override with `CLEVERTREE_IRC_NICK`) |
| Enable | `CLEVERTREE_IRC_ENABLE=1` on the chat host |

## Sync rules

- One IRC channel per debate page/topic: `#pt-general` ↔ topic `general`.
- Human `PRIVMSG` → durable `submit` (visitor UUID5 from nick).
- Board/API `submit` → `PRIVMSG` (echo skipped when the bridge originated the post).
- WebSocket `post.live` / `batch.notice` still come from the host hub after submit/drain — same events, not a second bus.

## Environment

| Var | Default | Role |
|--|--|--|
| `CLEVERTREE_IRC_ENABLE` | off locally / on in Intake yaml | Start bridge |
| `CLEVERTREE_IRC_HOST` | `flashbackrepository.org` | Ergo |
| `CLEVERTREE_IRC_PORT` | `6697` | TLS port |
| `CLEVERTREE_IRC_TLS` | `1` | Wrap socket |
| `CLEVERTREE_IRC_NICK` | `clevertree-si` | Bridge nick |
| `CLEVERTREE_IRC_PREFIX` | `pt` | Channel prefix |

## Auto channel create

On first submit for a topic (or IRC message in that channel), the bridge `JOIN`s `#<prefix>-<topic>`. Ergo creates the channel when the first client joins.

## Related

- [chat-host.md](chat-host.md) · [infra.md](infra.md) · PT `docs/CHAT_REQUEST_RESPONSE.md`
