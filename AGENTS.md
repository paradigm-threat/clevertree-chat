# Clevertree Chat — agent / developer brief

**Public brief:** [clevertree.chat/dev](https://clevertree.chat/dev)  
**Repo:** [GitHub](https://github.com/paradigm-threat/clevertree-chat) · [GitLab](https://gitlab.com/clevertree/clevertree-chat) · **Product:** [clevertree.chat](https://clevertree.chat) · **API / demos:** [api.clevertree.chat](https://api.clevertree.chat)

Standing debate, not a reply thread. People post original points; the **batch SI** (Super Intelligence, i.e. AI) files them under **perspectives (keys)**, pairs counters, and writes short positions from posted `rules.md` (or Relay defaults). **SI curates and organizes only** — it does not vote, pick winners, or take sides; humans alone supply preference. Cleverchat is an **independent product** — MyProblem and others may mount it; it does not depend on them.

## One-sentence rule

> **Live path is fast and ephemeral until durable store is wired; batch path owns organization, confidence, and (soon) investigation — cite the live web, don’t invent standing exceptions.**

## Where things live

| Piece | Location |
|---|---|
| Marketing + extension zip | This repo → Vercel → `clevertree.chat` |
| Chat host (Debate board, WS, demos, PT review) | `scripts/chat_host.py` on Intake Spot → `api.clevertree.chat` |
| Debate record (SoT) | [`clevertree-chat-comments`](https://github.com/paradigm-threat/clevertree-chat-comments) branch `comments` |
| Batch rules (defaults) | [`docs/default-rules.md`](docs/default-rules.md), [`clevertree_chat/rules.py`](clevertree_chat/rules.py) |
| Batch decision cases | [`docs/cases/batch-decisions.md`](docs/cases/batch-decisions.md) |
| PT backlog refile | [`scripts/refile_pt_batch.py`](scripts/refile_pt_batch.py) |
| Browser extension | [`fronts/extension/`](fronts/extension/) → [clevertree.chat/extension](https://clevertree.chat/extension) |

Deploy chat host: `bash infra/deploy-chat-host.sh` (kubeconfig `~/.kube/myproblem-intake.yaml`).

IRC backbone: [`docs/irc-backbone.md`](docs/irc-backbone.md) — Ergo TLS bridge (`CLEVERTREE_IRC_ENABLE=1`), `#pt-<topic>` ↔ durable submit.

## What works today

- **Realtime AI host** on `api.clevertree.chat`: durable `/api/chat` (+ `/api/debate` alias) → PVC SoT; WS fan-out; always-on heuristic drain + `batch_hooks`
- **IRC bridge** (when enabled): PRIVMSG ↔ submit; `SI ask` / `!answer` fold into `owner-answers.md` + `rules.md`
- Live boards `/chat`, `/chat/flock-cameras`, `/chat/thc-legalization`, PT review `/chat/5g` / `geoengineering` / `general` (full SoT via PVC + `.clevertree-full-sot`)
- Website rooms without the extension: `clevertree.chat/w/<host>` or `/w/<host>/<path>` (also `api…/chat/w/…`); SoT subpath created only on first comment
- Heuristic batch (file keys, `other`, pairs, positions, questions) + associations / spam-state / optional live fetch (`CLEVERTREE_FETCH=1`)
- Spot GPU wake gated by `CLEVERTREE_SPOT_WAKE` + token (off in prod)
- Mesh persistence: catalog `clevertree-chat-comments` `publish_branch: comments` → iad1; host `CLEVERTREE_PUBLISH_REMOTES`
- Extension → `api.clevertree.chat` only; domain-level page scope; first-use skippable coach; zip at `/extension` (Chrome Web Store listing optional — see [`docs/chrome-web-store.md`](docs/chrome-web-store.md))
- ~5.4k Paradigm Threat posts refiled on the comments branch

## Near-future goals (priority)

1. **Chrome Web Store** — human dashboard upload + review ([`docs/chrome-web-store.md`](docs/chrome-web-store.md)).
2. **GitLab forge mirror** for `clevertree-chat-comments` (catalog currently points at GitHub).
3. **History `.relay.yaml` inject** if iad1 ever re-clones from forge (tip already has policy; seed used bundle).
4. **Broader fetch coverage** — more hosts + anti-bot probes beyond the starter egress sample.
5. **Spot token mount** — turn on `CLEVERTREE_SPOT_WAKE` only when a comments GPU pass is ready.

## Locked product rules (don’t undo)

- Keys = perspectives / sub-axes. **Page path = topic.** Never mint a key equal to the page slug.
- File as soon as a claim appears; agreement does not suppress axes. Non-arguments → `other`.
- Unwritten counters = suggestions only until someone writes them.
- Ask the owner on low confidence; no private standing exceptions.
- **SI curates only** — no votes, no winners, no sides; keep the map fair and organized objectively.

## Tests

```bash
npm run test:unit
npm run test:e2e
npm run test:e2e:a11y   # axe WCAG AA contrast on board (light + dark)
```

PR CI (GitHub Actions + GitLab CI): unit, durable E2E, and ADA contrast gates.

## Related

- Comments SoT: https://github.com/paradigm-threat/clevertree-chat-comments
- MyProblem mount notes: sibling `myproblem` → `docs/clevertree-chat.md`
- Deeper docs: [`README.md`](README.md) · [`docs/chat-host.md`](docs/chat-host.md) · [`docs/infra.md`](docs/infra.md) · [`docs/url-pages-and-associations.md`](docs/url-pages-and-associations.md)

*Last updated: 2026-11-15*
