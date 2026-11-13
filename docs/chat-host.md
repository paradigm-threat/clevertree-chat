# Clevertree Chat host (Intake)

The guided multi-person debate runs on the **Intake chat host**, not on Vercel.

| | |
|--|--|
| Process | `python3 scripts/chat_host.py` (default `:8790`) |
| UI | `/chat`, `/chat/<topic>` |
| HTTP API | `/api/chat` (same actions as the old demo API: `view`, `preview`, `submit`, `drain`, `replay`) |
| WebSocket | `/api/chat/ws?topic=…&visitor=…` |
| Events | `hello`, `post.live`, `batch.notice`, `board.snapshot` |

## Behavior

- The visitor posts only through the containable composer.
- Peer speakers (Jordan in the guided scripts) are **injected by the server** after a visitor beat drains, then fanned out over WebSocket.
- Activity rows mark `data-mine="true"` for the visitor and a different accent for others.

## Deploy on `myproblem-intake`

From this repo (uses `KUBECONFIG=~/.kube/myproblem-intake.yaml` by default):

```bash
bash infra/deploy-chat-host.sh
```

That script:

1. Packs a slim tree into ConfigMap `clevertree-chat-code`
2. Applies [`infra/k8s/chat-host.yaml`](../infra/k8s/chat-host.yaml) (Python host on `:8790`, hostNetwork)
3. Patches Caddy so `/chat*`, `/api/chat*`, and snippet assets go to `:8790`; everything else stays on the ticket worker `:8787`

Manifests also live in `myproblem-tickets/infra/k8s/intake-caddy.yaml` so ticket rollouts keep the chat routes.

Public URLs:

- `https://intake.myproblem.app/chat`
- `https://intake.myproblem.app/chat/thc-legalization`
- `https://intake.myproblem.app/chat/flock-cameras`

Vercel (`clevertree.chat`) keeps marketing and links here. It does not own the demo socket.

## Local

```bash
python3 scripts/chat_host.py 8790
# open http://127.0.0.1:8790/chat/thc-legalization
npx playwright test tests/e2e/chat-websocket.spec.ts
```

Boards are in-memory for this pass (prove UI + WS). Git `comments` branch persistence comes later.
