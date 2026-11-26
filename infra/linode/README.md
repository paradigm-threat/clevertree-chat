# Clevertree chat-host on Linode

Intake / chat-host runs on **Linode pub1** (`pub1.relaygateway.net`, `172.234.148.70`, `us-iad`) as systemd + Caddy.

There is **no LKE kubeconfig**. Rackspace Spot `~/.kube/myproblem-intake.yaml` is abandoned — do not refresh Spot OIDC.

## Deploy

```bash
bash infra/deploy-chat-host.sh
```

Optional env:

| Var | Default |
|-----|---------|
| `CLEVERTREE_CHAT_SSH` | `root@pub1.relaygateway.net` |
| `CLEVERTREE_CHAT_SSH_KEY` | `~/.ssh/id_ed25519_relay_gateway` |
| `CLEVERTREE_CHAT_REMOTE` | `/opt/clevertree-chat` |
| `CLEVERTREE_ASR_DRY_RUN` | `1` when `GROQ_API_KEY` unset |

On-host files: `chat-host.env`, `caddy/Caddyfile.clevertree`, systemd `clevertree-chat.service`.

DNS: Vercel A records for `api.clevertree.chat` and `intake.myproblem.app` → pub1.
