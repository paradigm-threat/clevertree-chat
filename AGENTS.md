# Clevertree Chat — agent / developer brief

**Public brief:** [clevertree.chat/dev](https://clevertree.chat/dev)  
**Repo:** [GitHub](https://github.com/paradigm-threat/clevertree-chat) · [GitLab](https://gitlab.com/clevertree/clevertree-chat) · **Product:** [clevertree.chat](https://clevertree.chat) · **API / demos:** [api.clevertree.chat](https://api.clevertree.chat)

**Brand spelling:** **Clevertree** — never **CleverTree**. Keep the internal `t` lowercase in copy, titles, docs, and agent text.

**Debate board** = **IRC room** + **SI panel**. People talk in IRC; batch **SI** (Super Intelligence, i.e. AI) curates the SI workspace (topics, findings, keys/counters in comments SoT). **SI curates and organizes only** — it does not vote, pick winners, mint topic-index entries, or take sides. Cleverchat is an **independent product** — MyProblem and others may mount it; it does not depend on them. Batch providers: **Groq / Bedrock / peers only** (no GPU batch servers).

## One-sentence rule

> **Queue every claim as soon as it appears; permanent filing only after batch accepts — cite the live web; don’t invent standing exceptions.**

Policy detail: [`docs/intake-queue.md`](docs/intake-queue.md).  
**Batch phases:** [`docs/batch-phases.md`](docs/batch-phases.md) · Relay SoT [`../../myproblem/docs/batch-phases.md`](../../myproblem/docs/batch-phases.md) — same SI procedure as MyProblem/QuizGate (drain → providers → commit queue → merge); Phase 1 Cursor / Phase 2 CPU + Groq/Bedrock/peers. No Spot GPU SI — [`../../myproblem/docs/providers-ai.md`](../../myproblem/docs/providers-ai.md).

## Where things live

| Piece | Location |
|---|---|
| Marketing + extension zip | This repo → Vercel → `clevertree.chat` |
| Chat host (IRC+SI debate board, WS, demos) | `scripts/chat_host.py` on Linode **pub1** → `api.clevertree.chat` |
| Debate record / SI panel SoT | [`clevertree-chat-comments`](https://github.com/paradigm-threat/clevertree-chat-comments) / [GitLab](https://gitlab.com/clevertree/clevertree-chat-comments) branch `comments` |
| Intake queue (ephemeral, not git) | Host disk `var/clevertree-live/queue/` on Linode pub1 (policy; cutover pending) |
| Batch rules (defaults) | [`docs/default-rules.md`](docs/default-rules.md), [`clevertree_chat/rules.py`](clevertree_chat/rules.py) |
| Batch decision cases | [`docs/cases/batch-decisions.md`](docs/cases/batch-decisions.md) |
| PT backlog refile | [`scripts/refile_pt_batch.py`](scripts/refile_pt_batch.py) |
| Browser extension (IRC+SI; all sites) | [`fronts/extension/`](fronts/extension/) → [clevertree.chat/extension](https://clevertree.chat/extension) — Networker via Options only |
| Shared public IRC room UI | [`fronts/room/`](fronts/room/) — dock / page / sidepanel; SI panel stub; themes; context tags |
| Header chat launcher | [`fronts/room/chat-launcher.js`](fronts/room/chat-launcher.js) — corner button; prefers extension side panel |
| Design kit | [`design/clevertree-chat-kit/`](design/clevertree-chat-kit/) — shared IRC+SI room; theme packs in `tokens/` + [`fronts/room/themes/`](fronts/room/themes/) |

Deploy chat host: `bash infra/deploy-chat-host.sh` (SSH to Linode `pub1.relaygateway.net`; see `infra/linode/`). Rackspace Spot kubeconfig abandoned.

IRC backbone: [`docs/irc-backbone.md`](docs/irc-backbone.md) — Linode Ergo (`pub1`); PT → `#pt`; public catch-all `#web`; craft collections per-collection; context tags [`docs/context-tags.md`](docs/context-tags.md).

## What works today

- **Realtime AI host** on `api.clevertree.chat`: `/api/chat` (+ `/api/debate` alias) → host disk; WS fan-out; heuristic drain + `batch_hooks` *(transitional live SoT writes — Phase 1 end state is enqueue + Cursor drain)*
- **IRC bridge**: PRIVMSG ↔ submit; `SI ask` / `!answer` fold into `owner-answers.md` + `rules.md`; manual `!investigate` → Groq text SI (Free-tier soft budgets; chat reply only)
- **Channel ASR**: `[[mp:media]]` → Whisper turbo on Groq (soft RPM/RPD); video markers ASR speech only (no VL yet)
- **Debate board** = shared IRC room + SI panel (extension / dock); legacy standalone board widget retired
- Fetch (`CLEVERTREE_FETCH=1`), associations, spam-state hooks; Spot wake gated off (`CLEVERTREE_SPOT_WAKE=0`)
- **Mesh**: catalog `clevertree-chat-comments` → iad1; GitLab forge mirror; peers hkg1/ord1 notify OK; `CLEVERTREE_PUBLISH_REMOTES`
- Extension zip at `/extension` (works on any site → `#web` + `[[d:domain]]`); Chrome Web Store listing optional ([`docs/chrome-web-store.md`](docs/chrome-web-store.md))

## Near-future goals (priority)

1. **Queue-before-SoT cutover** — implement [`docs/intake-queue.md`](docs/intake-queue.md) (live enqueue only; Cursor sole SoT writer on shared queue in Phase 1).
2. **Align job schema** with MyProblem/QuizGate shared batch queue ([`docs/batch-phases.md`](docs/batch-phases.md)).
3. **Chrome Web Store** — human dashboard upload + review.
4. **Providers** — Groq/Bedrock/peers for gray-zone spam + curation; keep `CLEVERTREE_SPOT_WAKE=0` (GPU wake abandoned).
5. **History `.relay.yaml` inject** — only if fleet ever needs a full history rewrite for hook compliance (tip already has policy).

## Locked product rules (don’t undo)

- Keys = perspectives / sub-axes for SI panel SoT. Topic **index** entries are human/admin only (`chat/topics.json`; `0` = general). Never auto-mint channels or index rows from page paths.
- **Queue** every claim as soon as it appears; **permanent file** only after batch accepts. Agreement does not suppress axes. Non-arguments → `other` when filed.
- Unwritten counters = suggestions only until someone writes them.
- Ask the owner on low confidence; no private standing exceptions.
- **SI curates only** — no votes, no winners, no sides; keep the map fair and organized objectively.
- Rejected intake spam never lands in the comments SoT.
- Public non-product tabs share `#web` with domain attribution only (no page-path tags).

## Tests

```bash
npm run test:unit
npm run test:e2e
npm run test:e2e:a11y   # axe WCAG AA contrast on board (light + dark)
```

PR CI (GitHub Actions + GitLab CI): unit, durable E2E, and ADA contrast gates.

## Related

- Comments SoT: https://github.com/paradigm-threat/clevertree-chat-comments · https://gitlab.com/clevertree/clevertree-chat-comments
- MyProblem mount notes: sibling `myproblem` → `docs/clevertree-chat.md`
- Deeper docs: [`README.md`](README.md) · [`docs/chat-host.md`](docs/chat-host.md) · [`docs/infra.md`](docs/infra.md) · [`docs/intake-queue.md`](docs/intake-queue.md) · [`docs/url-pages-and-associations.md`](docs/url-pages-and-associations.md)

*Last updated: 2026-11-27*
