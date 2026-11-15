# Clevertree Chat — UI Redesign (combined)

This file merges the product redesign proposal with the debate-visualization library investigation, plus owner decisions locked in planning. It is the brief for the **multi-interface UI lab** under [`/try/ui/`](../try/ui/).

**Mockup package** (canonical visuals): [`try/ui/mockups/`](../try/ui/mockups/)
- Desktop / mobile / comparison PNGs
- [`clevertree-chat-ui-redesign.md`](../try/ui/mockups/clevertree-chat-ui-redesign.md) (also `docs/ui-redesign-proposal.md`)

**Lab:** default **Debate board** matches the mockups (demo-mode pause after each submit→update). Also: Shelf (A), Reading Room (B), Canvas (C), Hybrid.

---

## Product proposition

Clevertree is a standing debate, not a reply thread. A visitor contributes a natural-language point; Clevertree organizes original posts into existing or new **perspectives** (keys), makes counterarguments legible through flexible multi-links, and maintains a readable map for everyone watching. SI (Super Intelligence, i.e. AI) curates in batches according to human-authored rules: it organizes the map fairly and does not vote, take sides, or declare a winner — humans alone supply preference.

**Core promise:** *Many people can speak. Their contributions accumulate into a small number of understandable arguments. Those arguments can challenge one another without becoming a tangled reply thread.*

**Candidate message:** **Speak once. Make a lasting point.**

---

## Owner decisions (requirements)

- A **key** is a perspective, argument, or point of view. A post may belong to multiple keys; always display **all** key chips on that post without collapsing them into a `+N` indicator.
- **Counter-links** between perspectives are flexible and many-to-many. No permanent two-sided binary. Within a perspective, reading order is: the perspective itself, common counterarguments, counters to those counters, and deeper responses as needed.
- The **primary UI is a ranked map of perspectives**, prioritized by activity and content weight. All perspectives and all original points must be accessible through continuous scrolling.
- **Recent activity is secondary**, useful for understanding what just changed but not the primary metaphor.
- Posting is **body-only**. Optional microphone-to-transcription and optional selection of multiple keys; no forced title, stance, or categorization. SI can later revise soft associations.
- Unassigned contributions appear lightly under **Unfiled** on the board and in activity as awaiting organization, then show where they were filed.
- Guided walkthroughs and live topics share the same topic-first hierarchy; demos encourage participation early. Only **demo UI** pauses or queues presentation; the server continues running. Live topics never have a Continue control. Continue is **UI-only** (server is not gated).
- Mobile and desktop need **distinct optimized arrangements** (container-width responsive). Focused counter-links: side-by-side on desktop, stacked on mobile. Panel may grow / expand-to-focus.
- Default admin chrome is compact: human-authored house rules and SI-assisted organization, with contextual item statuses only where relevant. Prefer wording like **Rules set by people · SI-assisted organization** over implying a staffed moderation desk.
- Potentially abusive/spam content is flagged by the SI batch, **hidden behind “Click to view”** (not instant delete), contestable, and eligible for delayed removal when uncontested. Avoid false positives for heated political discussion; bullying / intimidation / targeted harassment is the boundary. Pattern history of uncontested removals may inform later judgment; soft “potential abuse” flags are allowed when uncertain.
- Demo peers are simulated — never present them as real public participants.

---

## Three concepts (+ recommended hybrid)

### A. Perspective Shelf — recommended default

A single ranked, vertically scrollable board of perspective cards. Each card contains its argument, a short summary, counterargument links, responses to counters, and original contributions. Opening a counter-link enters a focused comparison. The activity rail/strip explains recent change without displacing the debate.

**Pros:** understandable at a glance; expandable to all points; works in embeds; maps directly to keys; scales to mobile.  
**Cons:** long debates need density care; updates must not destabilize reading position.

### B. Debate Reading Room

A ranked index of perspectives plus a dedicated editorial reading pane for the selected key. The reading pane covers summary, counters, counters-to-counters, original points, and references to linked keys.

**Pros:** excellent deep reading; keeps long summaries structured.  
**Cons:** less immediate whole-debate visibility; selecting can feel like switching documents.

### C. Counterpoint Canvas

A small spatial graph of perspective clusters, linked through counters. Selecting a cluster opens the underlying content and original contributions.

**Pros:** relationships visible and distinctive.  
**Cons:** higher cognitive load; difficult in narrow embeds; can obstruct full reading of every post.

### Hybrid (product recommendation)

Use **A as the default**, borrow **B’s reading treatment** for an expanded card, and expose a **restrained slice of C** only when a counter-link is focused. No graph as the landing view.

**Lab implements all four** so they can be compared side by side with the same sample board.

---

## Desktop IA (Shelf / Hybrid)

1. **Context header:** topic title, demo/live indicator, rules access, optional expand-to-focus. Label demo peers as simulated.
2. **Primary perspective board (~70%):** ranked perspective cards; all original points in one board scroll; compact Unfiled; no nested card scroll.
3. **Secondary activity rail (~30%):** live / organizing / board updated — not a full chat bubble feed.
4. **Lightweight composer:** body; optional mic; optional multi-key; Post. Subordinate until engaged.
5. **Focused counter-link mode:** this ↔ that; Back restores scroll position.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ CLEVERTREE   Should cities use camera networks?      DEMO   Rules  ⤢ │
├────────────────────────────────────────────────┬────────────────────────┤
│ PERSPECTIVES  · Ranked by prominence           │ RECENT ACTIVITY        │
│ 01 … cards with summary, counters, points      │ ✓ / • / ◌ notices      │
│ Unfiled · N awaiting organization              │                        │
├────────────────────────────────────────────────┴────────────────────────┤
│ ADD YOUR PERSPECTIVE  [body…]  🎙  optional keys                    Post│
└─────────────────────────────────────────────────────────────────────────┘
```

## Mobile IA

1. Header + Demo/Live + Rules.
2. Short invite: explore perspectives, then add your point.
3. One-column ranked cards in the **main page scroll** (no horizontal carousel for the core debate).
4. Light Unfiled; collapsed Recent updates strip/drawer.
5. Thumb-friendly Write a point → body-only composer.
6. Focused counter: stacked + jump; Back to board.

**Responsive rule:** adapt to the panel’s **container width**, not only the device viewport.

---

## Perspective card anatomy

1. Stable identity (one-line title + stable address).
2. Neutral perspective summary (no winner).
3. Common counters (many-to-many links).
4. Responses to counters (progressive disclosure, not nested reply trees).
5. Original posts — fully reachable; one canonical post ID; **every** confirmed key chip.
6. Status where relevant: provisional, unfiled, new placement, flagged, contest open.

No nested scrolling inside cards. No summary-only dead ends.

---

## Composer

- Body + Post only by default.
- Optional mic → same field; edit before submit.
- Optional multi-key soft proposals (provisional until batch).
- Live immediately after submit; SI does not block posting.

---

## Guided demo Continue

Demo pages only. UI queues / explains “what just happened.” Server is **not** waiting. Live topics: no Continue.

Checkpoints (meaningful changes, not every raw event): Explore → Write → My point live → Simulated peer → Organizing → Board changed → free exploration.

---

## Abuse / spam UX

1. Batch evaluates in context; err against false abuse on heated-but-permissible speech.
2. Soft uncertain status allowed with softer consequences.
3. Flagged body → **Click to view** + Contest; do not erase existence.
4. Contest window; uncontested may remove **after delay**.
5. Pattern signals from uncontested removals; constrain retention.
6. `rules.md` defaults; per-repo overrides.

Chrome: compact rules link; inline statuses only on affected items.

---

## What not to show by default

Full chat bubble trees; permanent For/Against columns; unreadable full graphs; raw host/job jargon; SI confidence scores on cards; auto-reorder while reading; winners/truth meters; mandatory title/stance; recents dominating the board; demo peers as real people; coach after every minor event.

---

## Debate visualization libraries — fit summary

Most tools are user-built pro/con trees (Kialo-style) or static/editor graphs. Clevertree’s model (live free posts → SI batch → ranked standing keys + flexible counters + secondary recents) does not match an off-the-shelf primary surface.

| Need | Existing tools | Clevertree |
|------|----------------|------------|
| Ranked scrollable perspective cards | Trees / free graphs | Custom cards (A) |
| Flexible multi-links; focused this↔that | Kialo / DebateGraph / graph libs | Data links + focused view; graph optional only in focus/C |
| Secondary recents | Rare | Custom strip/rail |
| Live + async batch | Absent | Custom event model |
| Containable mobile/desktop | Page-scale platforms | Custom container layouts |
| Unfiled, always-all chips, soft tags | Not a focus | Custom |

**References (inspiration only):** Kialo (counter stacking, multi-links); Reasons.js / Argdown (simple argument structure); React Flow / Cytoscape.js only for optional advanced/focused/export — **not** the landing view.

**Bottom line:** keep a custom ranked-card primary stage; treat pure graph canvases as optional (Concept C / focused slice), not the core.

---

## Host / API (integration reminders)

Prefer richer payloads on existing `/api/chat` + `/api/chat/ws` (`hello`, `post.live`, `batch.notice`, `board.snapshot`) over new event types. Need: stable IDs, provisional vs confirmed keys, simulated-peer attribution, flag/contest fields, effective rules access.

---

## First prototype milestone (lab + later host wiring)

1. Open a populated debate and browse ranked perspectives.
2. Compose one body-only point; immediate publication (mock or live).
3. Simulated peer point in demo.
4. Async organization with all key chips + board-change explanation.
5. Open one counter-link; return without losing scroll/draft.
6. One flagged item with reveal + contest.
7. Container-responsive mobile/desktop; reduced-motion respect.

**North star:** *The board is the product. The composer is the entry point. Activity shows what happened. The guided coach teaches briefly, then gets out of the way.*

---

## Multi-interface lab

| Interface | Path | Role |
|-----------|------|------|
| **Debate board ★** | `/try/ui/?ui=board` | Mockup UI — primary implementation |
| **Shelf** | `/try/ui/?ui=shelf` | Concept A — ranked cards |
| **Reading room** | `/try/ui/?ui=reading` | Concept B — index + editorial pane |
| **Canvas** | `/try/ui/?ui=canvas` | Concept C — spatial counter graph |
| **Hybrid** | `/try/ui/?ui=hybrid` | Earlier A + B expand + C on focus |

### Demo mode (lab / first-time)

- Default **on** for first visit; persist via `localStorage` (`clevertree.demoMode`).
- Pauses after **any** update in the chain from user submit → server replies (mock: live, simulated peer, organizing, board snapshot).
- Continue/play is UI-only; option to **disable demo mode** for continuous updates.
- Live hosted topics must not use Continue gates.

Shared sample board in `try/ui/`. Host wiring comes later.
