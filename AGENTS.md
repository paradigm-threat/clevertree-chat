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

## What works today

- **Realtime AI host** on `api.clevertree.chat`: durable `/api/chat` (+ `/api/debate` alias) → comments checkout; WS fan-out; always-on heuristic drain
- Live boards `/chat`, `/chat/flock-cameras`, `/chat/thc-legalization`, PT review `/chat/5g` / `geoengineering` / `general` (seeded or full SoT via `CLEVERTREE_COMMENTS_PATH`)
- Heuristic batch (file keys, `other`, pairs, positions, questions) — no GPU yet
- Extension → `api.clevertree.chat` only; first-use skippable coach on the web board
- ~5.4k Paradigm Threat posts refiled on the comments branch

## Near-future goals (priority)

1. **Full SoT mount on Intake** — point host at the full comments checkout (not fixture seed only); GitHub sync when desired.
2. **Real batch SI pass** — wake Spot GPU when needed; run a true curator once end-to-end (file + summarize + ask humans on low confidence).
3. **Internet investigations** — batch cites and fetches live counters (today: URL recorded, **page not fetched**). Prove egress from Intake/Spot vs Vercel.
4. **Anti-bot / anti-spam access** — measure what blocks plain HTTP, headless browsers, and APIs before wiring fetch into the curator. No fetch path exists yet.
5. **Human loop** — low-confidence → `questions.md` already; deliver asks (IRC or equivalent) and fold answers into `rules.md` / KB.
6. **Spam court + URL associations** — hide/contest clocks; batch canonicalization of mirror pages (architecture locked, not built).

## Locked product rules (don’t undo)

- Keys = perspectives / sub-axes. **Page path = topic.** Never mint a key equal to the page slug.
- File as soon as a claim appears; agreement does not suppress axes. Non-arguments → `other`.
- Unwritten counters = suggestions only until someone writes them.
- Ask the owner on low confidence; no private standing exceptions.
- **SI curates only** — no votes, no winners, no sides; keep the map fair and organized objectively.

## Tests

```bash
python3 -m unittest discover -s tests -v
```

## Related

- Comments SoT: https://github.com/paradigm-threat/clevertree-chat-comments
- MyProblem mount notes: sibling `myproblem` → `docs/clevertree-chat.md`
- Deeper docs: [`README.md`](README.md) · [`docs/chat-host.md`](docs/chat-host.md) · [`docs/infra.md`](docs/infra.md) · [`docs/url-pages-and-associations.md`](docs/url-pages-and-associations.md)

*Last updated: 2026-11-15*
