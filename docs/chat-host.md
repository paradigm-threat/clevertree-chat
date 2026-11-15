# Clevertree Chat host (realtime AI server)

The always-on **realtime AI server** runs on the chat host: lightweight preview/submit, WebSocket fan-out, and an always-on heuristic batch drain. It does **not** boot a GPU.

| | |
|--|--|
| Process | `python3 scripts/chat_host.py` (default `:8790`) |
| UI | `/chat`, `/chat/<topic>`, `/chat/w/<host>[/path]` (website rooms; empty until first comment) |
| HTTP API | `/api/chat` and `/api/debate` (same durable dispatch) |
| WebSocket | `/api/chat/ws?topic=…&visitor=…` |
| Events | `hello`, `post.live`, `batch.notice`, `board.snapshot` |
| SoT | Local comments checkout (`CLEVERTREE_COMMENTS_PATH`) → optional GitHub push |

## Behavior

- Visitor posts through the board composer; IDs from `identify` / `resolve`.
- Submit files a starting slot onto the comments tree immediately.
- Background drain worker runs heuristic SI organization; clients are not the curator.
- No scripted peers (Jordan/Maya). First-use coach is UI-only and skippable.

## Environment

| Var | Role |
|--|--|
| `CLEVERTREE_COMMENTS_PATH` | Comments checkout (created if missing) |
| `CLEVERTREE_AUTH_PATH` | Auth tree (default under `var/clevertree-live/auth`) |
| `CLEVERTREE_GITHUB_TOKEN` + `CLEVERTREE_COMMENTS_SYNC=1` | Pull/push via GitHub API (optional) |
| `CLEVERTREE_USE_SIBLING=1` | Dev: use `../clevertree-chat-comments` |
| `CLEVERTREE_GIT_FALLBACK=1` | Force dulwich when `git` is absent |
| `CLEVERTREE_IRC_ENABLE=1` | Start Ergo IRC bridge (see [irc-backbone.md](irc-backbone.md)) |
| `CLEVERTREE_IRC_*` | Host/port/TLS/nick/prefix for the bridge |

## Public hostnames

| Hostname | Role |
|--|--|
| **https://api.clevertree.chat** | Cleverchat API + live boards + extension |
| `https://intake.myproblem.app` | Shared Intake node; chat paths → `:8790` |

## Deploy

```bash
bash infra/deploy-chat-host.sh
```

Packs the library, seeds light PT fixtures into `var/clevertree-live/comments`, installs `dulwich`, and rolls the Intake deployment.

## Local

```bash
export CLEVERTREE_COMMENTS_PATH=/tmp/clevertree-comments
python3 scripts/seed_live_comments_from_fixtures.py "$CLEVERTREE_COMMENTS_PATH"  # optional PT seed
python3 scripts/chat_host.py 8790
# open http://127.0.0.1:8790/chat/flock-cameras
```
