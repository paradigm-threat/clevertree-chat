# Intake queue (queue-before-SoT)

**Production default (2026-11-26+):** **public IRC** on Linode **`pub1`** (Ergo + chat-edge + Cleverchat bridge). See [`irc-backbone.md`](irc-backbone.md). The Rackspace Spot **`myproblem-intake`** private PVC queue host is **decommissioned** — do not redeploy Spot for this path. **Private / capability-gated queues are a premium feature**, not the public mesh.

Historical design below (queue-before-SoT) remains useful for premium/private batch SI; it is **not** what public park chat depends on.

Canonical product policy for premium/private filing: **IRC and web comments may be queued; only the batch SI permanently stores accepted posts in the comments SoT.** The live lightweight AI gathers queued bodies and recommended categorization. Spam and inappropriate posts that fail batch intake never enter git.

**Phases:** [`batch-phases.md`](batch-phases.md) · Relay SoT [`../../myproblem/docs/batch-phases.md`](../../myproblem/docs/batch-phases.md). Phase 1 batch agent = **Cursor**; Phase 2 Spot GPU/CPU wake is **retired** with Spot intake.

Related: [`infra.md`](infra.md) · [`chat-host.md`](chat-host.md) · [`irc-backbone.md`](irc-backbone.md) · [`spam.md`](spam.md) · [`AGENTS.md`](../AGENTS.md).

## One-sentence rule

> **Queue every claim as soon as it appears; permanent filing only after batch accepts — cite the live web; don’t invent standing exceptions.**

## Responsibilities

| Path | Role |
|------|------|
| **Live AI** (web `/api/chat`, extension, IRC bridge) | Gatherer: accept body + optional chosen slot, recommend categories, **enqueue**, fan out provisional UI/IRC. Does **not** create comment files or git commits on the comments branch. |
| **Queue** | Ephemeral PVC store **outside** comments git (e.g. `var/clevertree-live/queue/`). Never mesh-published. |
| **Batch deep SI** | Sole writer of `pages/…` on the comments SoT. Reads queue → quality/spam screen → file accepted posts → drop rejects → associations/fetch/spam-court on **filed** content only. |

```mermaid
flowchart LR
  web[Web_board_extension]
  irc[IRC_PRIVMSG]
  live[Live_AI_gatherer]
  queue[PVC_queue_not_git]
  batch[Batch_deep_SI]
  sot[comments_SoT_git]
  web --> live
  irc --> live
  live -->|enqueue_plus_recos| queue
  live -->|WS_provisional| web
  live -->|IRC_pending_mirror| irc
  queue --> batch
  batch -->|accept_file_keys| sot
  batch -->|reject_drop| queue
```

## Queue item sketch

Per-page or global append-only records (JSON/JSONL), not git:

| Field | Meaning |
|-------|---------|
| `id` | Stable UUID for the queued post |
| `page` / `topic` | Debate room |
| `body` | Author text |
| `visitor` | Visitor UUID (IRC: UUID5 from nick) |
| `source` | `web` \| `irc` \| `extension` |
| `recommended` | Live AI suggested key slots |
| `chosen` | Optional author-chosen existing key |
| `enqueued_at` | UTC timestamp |
| `status` | `pending` \| `accepted` \| `rejected` |

### IRC / WS log batches (`kind: irc_log`)

Separate from claim enqueue. Live host rotates ephemeral segments and drops a job beside the queue:

```json
{
  "site": "clevertree",
  "kind": "irc_log",
  "topic": "ga-savannah-cat-rescue",
  "channel": "#ga-savannah-cat-rescue",
  "payload_ref": "intake://irc-logs/ga-savannah-cat-rescue/seg-….jsonl",
  "enqueued_at": "…",
  "rules_ref": "comments:rules.md",
  "status": "pending"
}
```

Batch reads the segment, registers unseen visitors into `users/index.json`, and — when `chat_store` allows — appends minimized lines to `pages/<page>/chat/YYYY-MM-DD.jsonl` (`{"t","u","b"}` with short id `u`). `chat_store: never` skips transcript write; cache/job still consumed. Helpers: `clevertree_chat.irc_log_cache`, `clevertree_chat.chat_transcript`.

### Channel media ASR (`kind: channel_asr`)

MyProblem speak/video posts include `[[mp:media kind=… url=… channel=…]]`. On submit / IRC fanout the host enqueues:

```json
{
  "site": "myproblem",
  "kind": "channel_asr",
  "topic": "mp-general",
  "media_kind": "audio",
  "url": "https://…/chat-public/…",
  "enqueued_at": "…",
  "status": "pending"
}
```

Queue path: `var/clevertree-live/queue/channel_asr/`. Drain (`action=drain_channel_asr` or host tick) downloads the URL, calls Groq Whisper when `GROQ_API_KEY` is set, and posts an SI transcript line into the channel — **no tip mint**. Helpers: `clevertree_chat.channel_media`, `clevertree_chat.channel_asr`.

## Board / IRC UX

- Board merges **SoT sections** with **provisional** queue rows (pending-batch badge).
- After batch **accept**, the post appears as an ordinary filed comment; queue row cleared.
- After batch **reject**, the provisional row disappears; **no** comment body in SoT. Optional local audit log outside git.
- IRC `PRIVMSG` uses the same enqueue path (not a SoT bypass). Mirrored announces may mark posts as pending batch.
- Owner `!answer` / `si answer:` may still fold into `owner-answers.md` / `rules.md` (rules are not comment spam).

## Spam interaction

1. **Pre-SoT (intake):** batch may reject before any comment file exists — preferred path for clear spam/abuse.
2. **Post-SoT (filed):** existing flag → contest (X) → hide → remove (Y) from [`spam.md`](spam.md) still applies to posts already in the tree.

## Non-goals (this policy doc)

- Does not require GPU; heuristic drain may act as the batch processor until provider-backed Phase 2 automation exists — same sole-writer rule.
- Does not put the queue on iad1/GitHub.
- Chrome Web Store / marketing copy stay high-level (“organized by batch SI”).

## Room = queue; Bunny = uncurated inbox (shipped)

| Piece | Role |
|-------|------|
| **Chat room** (IRC / WS / submit) | Live claim queue + conversation. History + markers are what batch drains. |
| **Bunny inbox** | Sole uncurated blob store: speak/video, Networker harvests, SI assessments/media. Path `inbox/{kind}/{source_user}/{object_id}/…`. |
| **Host index** | `var/clevertree-live/inbox-index/{source_user}/{object_id}.json` — status, urls, content_hash. |
| **Claim queue** | `var/clevertree-live/queue/claims/*.json` when `CLEVERTREE_ROOM_QUEUE_ONLY=1` (default **on**). |
| **Git comments SoT** | Curated refs only after batch accepts — never raw AI/Networker bytes. |

Replace is unique per `(source_user, object_id)`; server derives `source_user` (visitor / `nw:` / `si:`). Cross-user paths rejected. APIs: `POST /api/inbox/upload`, `PUT /api/inbox/{object_id}` (chat-host + MyProblem proxy). Markers: `[[mp:media …]]` and `[[mp:inbox id=…]]`.

Helpers: `clevertree_chat.inbox`, `clevertree_chat.claim_queue`, `clevertree_chat.bunny_upload` (inbox default; legacy `chat-public/` when `CLEVERTREE_INBOX_UPLOAD=0`).

## Implementation backlog (ordered)

1. **Queue store** — `var/clevertree-live/queue/` schema + helpers; no git. *(Done: `queue/claims/`, `queue/irc_log/`, `irc-logs/`, `inbox-index/`.)*
2. **Live submit rewrite** — enqueue + provisional view; stop live `commit_changes` for new comments. *(Done behind `CLEVERTREE_ROOM_QUEUE_ONLY`, default on; set `0` to rollback.)*
3. **View merge** — `view` / `board.snapshot` merge SoT + pending queue.
4. **IRC** — [`irc_bridge.py`](../clevertree_chat/irc_bridge.py): PRIVMSG → claim enqueue; pending mirror. *(Ephemeral log + `irc_log` jobs live; align PRIVMSG with claim queue.)*
5. **Batch consume** — drain claims + inbox-index refs first; accept → file/pair/position; reject → drop; then hooks on filed content. *(IRC transcripts: `drain_irc_logs` / `chat_transcript.accept_irc_log_job`.)*
6. **Tests** — submit creates no SoT comment files; accept writes SoT; reject leaves SoT clean; E2E provisional → filed. *(Unit: `tests/test_inbox_claim_queue.py`.)*
7. **Ops / UI** — coach copy “Pending batch review”; purge Bunny per ephemeral-media after curation.

*Status: room-queue + Bunny inbox cutover **on** by default ([`batch-phases.md`](batch-phases.md)). Batch remains sole SoT writer for new claims.*
