# Clevertree Chat host

The guided multi-person debate runs on the **chat host**, not on Vercel marketing.

| | |
|--|--|
| Process | `python3 scripts/chat_host.py` (default `:8790`) |
| UI | `/chat`, `/chat/<topic>` |
| HTTP API | `/api/chat` (`view`, `preview`, `submit`, `drain`, `replay`, plus `identify` / `resolve` for the extension) |
| WebSocket | `/api/chat/ws?topic=…&visitor=…` |
| Events | `hello`, `post.live`, `batch.notice`, `board.snapshot` |

Extension identity:

- `action=identify` — mint or validate a visitor UUID (server-issued).
- `action=resolve` — normalize a tab URL and return `{ topic, guided, visitor, view, … }`. Freeform pages get `u-<sha256…>` topic ids; guided demos keep fixed slugs.

## Public hostnames (same process)

| Hostname | Role |
|--|--|
| **https://api.clevertree.chat** | Cleverchat public API + demos + extension (entire hostname → `:8790`) |
| `https://intake.myproblem.app` | Shared Intake node; chat paths also proxy to `:8790`; tickets stay on `:8787` |

Cleverchat product links and the browser extension use **api.clevertree.chat** only.

## Behavior

- The visitor posts only through the containable composer.
- Peer speakers (Jordan in the guided scripts) are **injected by the server** after a visitor beat drains, then fanned out over WebSocket.
- Activity rows mark `data-mine="true"` for the visitor and a different accent for others.

## Deploy

From this repo (ops still use the shared Intake kubeconfig by default):

```bash
bash infra/deploy-chat-host.sh
```

That script:

1. Packs a slim tree into ConfigMap `clevertree-chat-code`
2. Applies [`infra/k8s/chat-host.yaml`](../infra/k8s/chat-host.yaml) (Python host on `:8790`, hostNetwork)
3. Patches Caddy with dual sites: `api.clevertree.chat` → `:8790`; `intake.myproblem.app` chat paths → `:8790`, tickets → `:8787`

Caddy dual-domain is mirrored in `myproblem-tickets/infra/k8s/intake-caddy.yaml` so ticket rollouts keep both hosts.

Public Cleverchat URLs:

- `https://api.clevertree.chat/chat`
- `https://api.clevertree.chat/chat/thc-legalization`
- `https://api.clevertree.chat/chat/flock-cameras`

Vercel (`clevertree.chat`) keeps marketing and links here. It does not own the demo socket.

## Local

```bash
python3 scripts/chat_host.py 8790
# open http://127.0.0.1:8790/chat/thc-legalization
npx playwright test tests/e2e/chat-websocket.spec.ts
```

Boards are in-memory for this pass (prove UI + WS). Git `comments` branch persistence comes later.
