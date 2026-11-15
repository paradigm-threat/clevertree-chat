# Clevertree Chat — agent / developer brief

**Public brief:** [clevertree.chat/dev](https://clevertree.chat/dev)  
**Repo:** [GitHub](https://github.com/paradigm-threat/clevertree-chat) · [GitLab](https://gitlab.com/clevertree/clevertree-chat) · **Product:** [clevertree.chat](https://clevertree.chat) · **API / demos:** [api.clevertree.chat](https://api.clevertree.chat)

Standing debate, not a reply thread. People post original points; the **batch SI** (Super Intelligence, i.e. AI) files them under **perspectives (keys)**, pairs counters, and writes short positions from posted `rules.md` (or Relay defaults). **SI curates and organizes only** — it does not vote, pick winners, or take sides; humans alone supply preference. Cleverchat is an **independent product** — MyProblem and others may mount it; it does not depend on them.

## One-sentence rule

> **Queue every claim as soon as it appears; permanent filing only after batch accepts — cite the live web; don’t invent standing exceptions.**

Policy detail: [`docs/intake-queue.md`](docs/intake-queue.md).

## Where things live

| Piece | Location |
|---|---|
| Marketing + extension zip | This repo → Vercel → `clevertree.chat` |
| Chat host (Debate board, WS, demos, PT review) | `scripts/chat_host.py` on Intake Spot → `api.clevertree.chat` |
| Debate record (SoT) | [`clevertree-chat-comments`](https://github.com/paradigm-threat/clevertree-chat-comments) / [GitLab](https://gitlab.com/clevertree/clevertree-chat-comments) branch `comments` |
| Intake queue (ephemeral, not git) | PVC `var/clevertree-live/queue/` (policy; cutover pending) |
| Batch rules (defaults) | [`docs/default-rules.md`](docs/default-rules.md), [`clevertree_chat/rules.py`](clevertree_chat/rules.py) |
| Batch decision cases | [`docs/cases/batch-decisions.md`](docs/cases/batch-decisions.md) |
| PT backlog refile | [`scripts/refile_pt_batch.py`](scripts/refile_pt_batch.py) |
| Browser extension | [`fronts/extension/`](fronts/extension/) → [clevertree.chat/extension](https://clevertree.chat/extension) |

Deploy chat host: `bash infra/deploy-chat-host.sh` (kubeconfig `~/.kube/myproblem-intake.yaml`).

IRC backbone: [`docs/irc-backbone.md`](docs/irc-backbone.md) — Ergo TLS bridge (`CLEVERTREE_IRC_ENABLE=1`), `#pt-<topic>` ↔ queue/submit path.

## What works today

- **Realtime AI host** on `api.clevertree.chat`: `/api/chat` (+ `/api/debate` alias) → PVC SoT; WS fan-out; heuristic drain + `batch_hooks` *(live still writes SoT until queue cutover)*
- **IRC bridge**: PRIVMSG ↔ submit; `SI ask` / `!answer` fold into `owner-answers.md` + `rules.md`
- Live boards + PT review rooms; full SoT via PVC + `.clevertree-full-sot`
- Website rooms: `clevertree.chat/w/…` — SoT subpath only on first comment *(will become first batch accept)*
- Fetch (`CLEVERTREE_FETCH=1`), associations, spam-state hooks; Spot wake gated off
- **Mesh**: catalog `clevertree-chat-comments` → iad1; GitLab forge mirror; peers hkg1/ord1 notify OK; `CLEVERTREE_PUBLISH_REMOTES`
- Extension zip at `/extension`; Chrome Web Store listing optional ([`docs/chrome-web-store.md`](docs/chrome-web-store.md))

## Near-future goals (priority)

1. **Queue-before-SoT cutover** — implement [`docs/intake-queue.md`](docs/intake-queue.md) backlog (live enqueue only; batch sole SoT writer).
2. **Chrome Web Store** — human dashboard upload + review.
3. **Spot token mount** — `CLEVERTREE_SPOT_WAKE` only when a comments GPU pass is ready.
4. **History `.relay.yaml` inject** — only if fleet ever needs a full history rewrite for hook compliance (tip already has policy).

## Locked product rules (don’t undo)

- Keys = perspectives / sub-axes. **Page path = topic.** Never mint a key equal to the page slug.
- **Queue** every claim as soon as it appears; **permanent file** only after batch accepts. Agreement does not suppress axes. Non-arguments → `other` when filed.
- Unwritten counters = suggestions only until someone writes them.
- Ask the owner on low confidence; no private standing exceptions.
- **SI curates only** — no votes, no winners, no sides; keep the map fair and organized objectively.
- Rejected intake spam never lands in the comments SoT.

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

*Last updated: 2026-11-15*
