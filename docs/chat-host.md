# Clevertree Chat host (realtime AI server)

The always-on **realtime AI server** runs on the chat host: lightweight preview/submit (gatherer), WebSocket fan-out, and batch drain. It does **not** boot a GPU. Policy: [`intake-queue.md`](intake-queue.md).

| | |
|--|--|
| Process | `python3 scripts/chat_host.py` (default `:8790`) |
| UI | `/chat`, `/chat/<topic>`, `/chat/w/<host>[/path]` (website rooms; empty until first comment / first batch accept) |
| HTTP API | `/api/chat` and `/api/debate` (same dispatch) |
| WebSocket | `/api/chat/ws?topic=…&visitor=…` |
| Events | `hello` (+ `chat_history`), `chat.history`, `post.live` (provisional), `batch.notice`, `board.snapshot`; inbound `chat.send` / `ping` |
| SoT | PVC comments checkout (`CLEVERTREE_COMMENTS_PATH`) — **batch sole writer** after queue cutover |
| Queue | PVC `var/clevertree-live/queue/` (ephemeral; not git; cutover pending) |

## Behavior

- Visitor posts through the board composer; IDs from `identify` / `resolve`.
- **Policy:** submit **enqueues** body + recommended categorization; board shows provisional pending-batch rows. Batch drain alone permanently files into the comments SoT (Phase 1: Cursor — [`batch-phases.md`](batch-phases.md)). *(Transitional: live may still write SoT — debt, not end state; see intake-queue status.)*
- Background drain runs SI organization; clients are not the curator.
- No scripted peers (Jordan/Maya). First-use coach is UI-only and skippable.

## Environment

| Var | Role |
|--|--|
| `CLEVERTREE_COMMENTS_PATH` | Comments checkout (created if missing) |
| `CLEVERTREE_AUTH_PATH` | Auth tree (default under `var/clevertree-live/auth`) |
| `CLEVERTREE_GITHUB_TOKEN` + `CLEVERTREE_COMMENTS_SYNC=1` | Pull/push via GitHub API (optional) |
| `CLEVERTREE_PUBLISH_REMOTES` | Space/comma-separated remotes for post-drain `git push` of `comments` (e.g. `git://iad1.relaygateway.net:9418/clevertree-chat-comments.git`) |
| `CLEVERTREE_FETCH=1` | Fetch suggested-counter URLs during batch hooks |
| `CLEVERTREE_SPOT_WAKE` | **Abandoned** — leave `0`; do not wake Spot GPU for comments SI |
| `CLEVERTREE_SEED_FIXTURES=0` | Skip fixture seed (Intake full SoT) |
| `CLEVERTREE_USE_SIBLING=1` | Dev: use `../clevertree-chat-comments` |
| `CLEVERTREE_GIT_FALLBACK=1` | Force dulwich when `git` is absent |
| `CLEVERTREE_IRC_ENABLE=1` | Start Ergo IRC bridge (see [irc-backbone.md](irc-backbone.md)) |
| `CLEVERTREE_IRC_*` | Host/port/TLS/nick/prefix for the bridge |
| `CLEVERTREE_CHANNEL_ASR` | Default `1` — enqueue ASR jobs from `[[mp:media]]` / Bunny URLs on submit |
| `CLEVERTREE_CHANNEL_MEDIA_REVIEW` | Default `1` — cover images/video until AI clear; WS `media.review` |
| `CLEVERTREE_MEDIA_REVIEW_DRY_RUN` | Stub-clear covers without Groq vision (also implied when ASR dry-run and no `GROQ_API_KEY`) |
| `BUNNY_STORAGE_API_KEY` | Bunny **storage zone password** for `POST /api/chat/media/upload` (never in browser) |
| `BUNNY_STORAGE_ZONE` | Default `myproblem-stills` |
| `BUNNY_STORAGE_HOST` | Default `storage.bunnycdn.com` |
| `BUNNY_CDN_BASE` | Default `https://myproblem-stills.b-cdn.net` |
| `GROQ_API_KEY` | Groq key for Whisper ASR, text SI, **and** vision media review; omit → ASR/review jobs stay pending (or dry-run); paste on pub1 (do not commit) |
| `GROQ_WHISPER_MODEL` | Default `whisper-large-v3-turbo` |
| `GROQ_VISION_MODEL` | Default `qwen/qwen3.8-27b` (current Groq multimodal). Override if your account uses another vision model |
| `GROQ_TEXT_MODEL` / `GROQ_SI_MODEL` | Default `openai/gpt-oss-20b` for text SI / `action=text_complete` / `!investigate` |
| `CLEVERTREE_INVESTIGATE` | Default on — manual `!investigate` text SI (not per-message) |
| `CLEVERTREE_INVESTIGATE_COOLDOWN_S` | Default `600` (per-channel) |
| `CLEVERTREE_INVESTIGATE_DAILY_MAX` | Default `48` org/day soft Free-tier budget |
| `CLEVERTREE_ASR_SOFT_RPD` / `CLEVERTREE_ASR_SOFT_RPM` | Soft Whisper caps ahead of Groq Free (defaults `1500` / `15`) |
| `CLEVERTREE_VISION_SOFT_RPD` / `CLEVERTREE_VISION_SOFT_RPM` | Soft vision caps (defaults `200` / `4`) ahead of qwen ITPM |
| `CLEVERTREE_VISION_COOLDOWN_FLOOR_S` | Min pause after vision 429 (default `20`) |
| `CLEVERTREE_ASR_DRY_RUN=1` | Stub in-channel transcript without calling Groq |
| `CLEVERTREE_PROVIDER_FAILOVER` | Default on — text SI prefers Groq, falls back to Bedrock on 429 / rate-limit (and 5xx when enabled) |
| `CLEVERTREE_BEDROCK_FAILOVER_ON_5XX` | Default `1` — also failover text SI on Groq 5xx |
| `CLEVERTREE_BEDROCK_REGION` / `AWS_REGION` | Bedrock region (default `us-east-1`) |
| `CLEVERTREE_BEDROCK_MODEL_ID` | Default `anthropic.claude-3-haiku-20240307-v1:0` |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN` | Bedrock creds; if missing on Groq rate-limit, log + fail clearly (no invented keys) |

**ASR caveat:** channel Whisper stays on Groq only — there is no Bedrock drop-in for transcription. On Groq 429 or soft RPM/RPD cap, ASR jobs return to `pending`.

**Text SI:** not per-message. Manual `!investigate` / room **Investigate** button → soft quota → Groq→Bedrock (`action=drain_investigate`, `action=quota_status`). Probe: `action=provider_status`, `action=text_complete`. Replies are **chat lines only** (not auto-filed into SoT). Groq HTTP from pub1 must include `User-Agent` (stdlib clients send `clevertree-chat/1.0`) or Cloudflare returns 403/1010. With `openai/gpt-oss-20b`, use generous `max_tokens` so reasoning does not starve `content`.

**IRC PRIVMSG soft max:** 400 characters. Full SI bodies stay in `irc_log_cache` / WS; the bridge sends a short teaser for long `SI batch:` / `SI investigate:` lines. Room UI clamps long replies with **Expand full reply** → fullscreen.

## Public hostnames

| Hostname | Role |
|--|--|
| **https://api.clevertree.chat** | Cleverchat API + live boards + extension |
| `https://intake.myproblem.app` | Shared Intake node; chat paths → `:8790` |

## Deploy (Linode pub1)

```bash
bash infra/deploy-chat-host.sh
# optional: CLEVERTREE_CHAT_SSH=root@pub1.relaygateway.net
#           CLEVERTREE_CHAT_SSH_KEY=~/.ssh/id_ed25519_relay_gateway
```

Packs the library, rsyncs onto Linode **pub1** (`/opt/clevertree-chat`), installs a venv + systemd unit, and reloads Caddy for `api.clevertree.chat` / `intake.myproblem.app` chat paths. Durable SoT lives under `/opt/clevertree-chat/var/clevertree-live/` (host disk — not Rackspace PVC). Channel ASR: set `GROQ_API_KEY` or `CLEVERTREE_ASR_DRY_RUN=1` in `/opt/clevertree-chat/chat-host.env`. Media uploads: set `BUNNY_STORAGE_API_KEY` (zone password for `myproblem-stills`).

### Media upload

- `POST /api/chat/media/upload` — multipart `file` + `channel` (+ optional `kind`); max **50 MiB**.
- Allowlist: images, video, audio, PDF, plain text (magic + sniff). Returns CDN URL + `[[mp:media … review=pending]]` marker.
- Path: `chat-public/<channel>/<sha>.<ext>` on Bunny; room renders from CDN with covers until `media.review` clear (see [channel-moderation.md](channel-moderation.md)).
- Drain: `action=drain_channel_media_review` (also on the host tick).
- Vision: default `qwen/qwen3.8-27b`. Prefers CDN URL over base64 (header peek only); images under 32×32px auto-clear (Groq VL minimum). Soft RPM/RPD + global cooldown after 429; jobs get `not_before` so drains skip them until Groq says retry. Staging-only: `CLEVERTREE_MEDIA_REVIEW_DRY_RUN=1`.
- Host tick spaces drains (ASR ~10s×2, vision ~16s×1, investigate ~14s×1) to stay under Free-tier ITPM/RPM.
- WS `hello.media_reviews` hydrates cover state; `media.review` updates live clients. `action=quota_status` reports investigate / ASR / vision soft budgets.

There is **no LKE kubeconfig** for Intake; Rackspace Spot `~/.kube/myproblem-intake.yaml` is abandoned.

## Local

```bash
export CLEVERTREE_COMMENTS_PATH=/tmp/clevertree-comments
python3 scripts/seed_live_comments_from_fixtures.py "$CLEVERTREE_COMMENTS_PATH"  # optional PT seed
python3 scripts/chat_host.py 8790
# open http://127.0.0.1:8790/chat
```

## Related

- [irc-backbone.md](irc-backbone.md) — home Ergo mesh  
- [external-irc-peers.md](external-irc-peers.md) — planned peer bots on outside networks (MyProblem / Georgia–Israel first)  
- [intake-queue.md](intake-queue.md)
