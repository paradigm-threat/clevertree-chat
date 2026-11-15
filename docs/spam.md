# Spam policy (Relay default)

Spam is ascertained by the **batch SI**, not by a public vote that auto-deletes. Once a post is flagged, there is a fixed window to contest it, then a hide-from-view step, then a later hard removal. Anyone who can see the flag may support or protest — not only the author. Repos may tighten the definition and the clocks in `rules.md`. Softening or rewriting what counts as spam still goes through the normal rules process (admin / community agreement / person-space house rules). A pile of protests does **not** rewrite the SI’s standing rules by itself; the batch may still **weigh** those posts when it decides this case and later ones.

Related: [`default-rules.md`](default-rules.md) · [`policy.md`](policy.md) · [`cases/batch-decisions.md`](cases/batch-decisions.md) · [`person-space.md`](person-space.md).

**Library:** clock helpers live in [`clevertree_chat/spam_court.py`](../clevertree_chat/spam_court.py) (`lifecycle_state`, `SpamClocks`). Batch drain does not yet write flags automatically — GPU SI / human loop applies them.

---

## One-sentence rule

> **Batch flags spam; anyone may contest within X; unanswered flags hide from view after X; after a further Y the post is removed; repos may tighten; only a rules change changes standing policy.**

---

## Default clocks

| Symbol | Default | Meaning |
|--------|---------|---------|
| **X** | **48 hours** after the flag is posted | Contest window while the post is still visible (flagged) |
| **Y** | **7 days** after hide-from-view | Extra window to protest while hidden; then hard removal |

A posted `rules.md` may shorten X or Y, or define spam more stringently. It must not invent a third unsigned policy outside `rules.md` / `policy.md`.

---

## Lifecycle

```
Batch ascertains spam → flag (visible)
        │
        ├─ within X: author or anyone may reply
        │     support (“keep / not spam”) or protest / explain
        │     batch weighs replies; may clear the flag or keep it
        │
        ▼ if still flagged when X ends
Hide from view (not in ordinary board / activity)
        │
        ├─ during Y: further protest still allowed
        │     batch may restore or keep hidden
        │
        ▼ if still flagged when Y ends
Remove entirely (gone from the comments tree / tombstone per engine)
```

**Final call** on clear / hide / remove is always the **batch SI**, reading posted rules (or Relay defaults) plus the contest thread and everything else it already considers.

---

## Who may speak on a flag

- The **author** may explain why the post is not spam.
- **Anyone else** who sees the flag may support keeping it (“this belongs here”) or protest the flag / the post.
- Support and protest are ordinary inputs to that decision. They do **not** bind future batch behavior as a new standing rule.

---

## Rules vs case-by-case

| Path | Effect |
|------|--------|
| Contest replies on a flag | Inform this flag’s outcome; batch may also remember them as evidence later |
| Mass-flagging or mass-protesting alone | Does **not** change what the SI treats as spam going forward |
| Change standing spam definition or clocks | Post / edit `rules.md` through the repo’s usual authority (admin, community agreement, or person-space owner when claim exists) |

The SI **may consider** prior contest threads and outcomes when making new spam decisions. It must not treat them as an automatic rewrite of `rules.md`.

---

## Repo overrides

Examples a repo may post:

- Shorter X or Y (more stringent)
- Broader spam criteria (promo links, repeated paste, off-topic flood, …)
- “Spam never opens a new key” or similar filing constraints

Defaults above apply when `rules.md` is silent.

---

## Implementation note

Phase 1 docs lock the behavior. Engine flags, hide-from-view, and hard delete are batch concerns on the comments branch; the live path does not invent a parallel spam court. Exact file shapes (`spam-flags.json`, tombstones) ship with the engine work that implements this policy.
