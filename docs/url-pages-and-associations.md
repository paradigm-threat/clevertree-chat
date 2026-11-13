# URL pages and associations

Any public URL can host a Clevertree Chat debate. That does **not** mean every URL stays a forever silo. The live path opens a provisional page from a normalized address; the **batch** decides whether that address is truly unique and links mirrors, twins, and related pages together. Those associations are how Clevertree starts to organize disparate public data on the internet — without scraping a searchable copy of the web.

Related: [`infra.md`](infra.md) · [`person-space.md`](person-space.md) · [`cases/flock-cameras.md`](cases/flock-cameras.md) · MyProblem [`knowledge-base.md`](../../myproblem/docs/knowledge-base.md) · [`topical-repos.md`](../../myproblem/docs/topical-repos.md).

---

## One-sentence rule

> **Normalize the URL, open a debate only when someone writes, then let batch choose a canonical page and aliases — cite the live web; do not store a page corpus.**

---

## Live path (thin)

1. The browser extension or HTML snippet **normalizes** the tab URL ([`fronts/extension/normalize-url.js`](../fronts/extension/normalize-url.js)): public suffix first, `www` dropped, tracking params removed, meaningful query keys such as `id` / `p` / `story` kept, path lowercased with a trailing slash.
2. Loading the page does **not** create a topic. The board stays empty until a person types (existing Clevertree Chat rule).
3. The first human words create the debate under a **provisional page id** derived from that normalized path.
4. Debate files live on the comments SoT (`pages/<page>/…`). Nothing is written back into the host site. `page.json` may pin a **canonical** page id and flag a stale thesis ([`infra.md`](infra.md)).

---

## Batch associates pages

On drain, the same AI batch that files keys also asks: is this URL truly unique?

| Judgment | Action |
|----------|--------|
| Same document / mirror / syndicated copy / AMP / mobile twin | Fold under one **canonical page**; keep **aliases** so old paths still resolve |
| Related but distinct claims or documents | **Link**, do not merge (same spirit as pairing keys without renaming one onto the other) |
| Unsure | Leave provisional; record low confidence; ask a human when a merge would move a large tree |

Associations are a **graph of page ids + aliases**, not a dump of HTML. Cite live URLs; do not store searchable snapshots of pages (MyProblem KB rule).

```
Tab URL
  → normalize
  → first words → provisional page id
  → batch associate
       → canonical page
       → aliases[] for mirrors / old paths
       → optional links to related (non-merged) pages
```

---

## Debate kind: topic vs person

Batch may classify a debate home as:

| Kind | Meaning |
|------|---------|
| **topic** | Public subject, article, or claim (a news URL, a product page, flock cameras) |
| **person** | Public identity hub — handles and username variants across networks |

A person-kind home is that person’s standing debate space. Ownership of its rules is described in [`person-space.md`](person-space.md). Handle clustering across sites is batch work so the system knows it is building a chat for a **public topic** or a **public person**, not inventing a private dossier from tip evidence.

---

## What this is for

- Start debates from **any URL** the extension or snippet can mount.
- Collapse accidental duplicates so the argument graph stays coherent.
- Grow toward organizing public internet structure (pages, mirrors, public identities) the same way topical remotes grow: **mint and merge only when necessary**, aliases for old names, human consult on risky moves ([`topical-repos.md`](../../myproblem/docs/topical-repos.md)).

---

## Explicitly open (do not fake-lock)

| Question | Until decided |
|----------|----------------|
| Per-topic `rules.md` overriding per-page / per-repo rules | Batch still reads **one** rules file at the comments root for that page tree ([`cases/batch-decisions.md`](cases/batch-decisions.md)). No topic-level override yet. |
| Split when a comments repo grows too large | Progressive remotes: mint/split on durable need; aliases; ask when unsure. Mechanism TBD. |

---

## Out of scope here

- Browser extension packaging and UX (next plan)
- Implementing association commits in the batch engine
- Passkey / handle claim for person-space editors ([`person-space.md`](person-space.md))
