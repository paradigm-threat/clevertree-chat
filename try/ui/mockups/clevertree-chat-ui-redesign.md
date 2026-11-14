# Clevertree Chat — UI Redesign Proposal v1

**Scope:** Product direction, information architecture, interaction design, guided demo behavior, moderation states, and host integration requirements. **No production code.**

## Visual mockups

These are visual design proposals rather than functional UI or final pixel-perfect specifications.

- [Desktop debate board](clevertree-desktop-mockup.png)
- [Mobile debate board](clevertree-mobile-mockup.png)
- [Desktop and mobile comparison, including focused counter-link view](clevertree-desktop-mobile-comparison.png)

## Product proposition

Clevertree is a standing debate, not a reply thread. A visitor contributes a natural-language point; Clevertree organizes original posts into existing or new **perspectives** (keys), makes counterarguments legible through flexible multi-links, and maintains a readable map for everyone watching. SI (Super Intelligence, i.e. AI) curates in batches according to human-authored rules; it does not declare a winner.

**Core promise:** *Many people can speak. Their contributions accumulate into a small number of understandable arguments. Those arguments can challenge one another without becoming a tangled reply thread.*

**Candidate message:** **Speak once. Make a lasting point.**

## Owner decisions treated as requirements

- A **key** is a perspective, argument, or point of view. A post may belong to multiple keys; always display **all** key chips on that post without collapsing them into a `+N` indicator.
- **Counter-links** between perspectives are flexible and many-to-many. No permanent two-sided binary. Within a perspective, reading order is: the perspective itself, common counterarguments, counters to those counters, and deeper responses as needed.
- The **primary UI is a ranked map of perspectives**, prioritized by activity and content weight. All perspectives and all original points must be accessible through continuous scrolling.
- **Recent activity is secondary**, useful for understanding what just changed but not the primary metaphor.
- Posting is **body-only**. Optional microphone-to-transcription and optional selection of multiple keys; no forced title, stance, or categorization. SI can later revise soft associations.
- Unassigned contributions appear lightly under **Unfiled** on the board and in activity as awaiting organization, then show where they were filed.
- Guided walkthroughs and live topics share the same topic-first hierarchy; demos encourage participation early. Only **demo UI** pauses or queues presentation; the server continues running. Live topics never have a Continue control.
- Mobile and desktop need distinct optimized arrangements. Focused counter-links can use side-by-side comparison on desktop and stacked comparison on mobile.
- Default admin chrome is compact: human-authored house rules and SI-assisted moderation/organization, with contextual item statuses only where relevant.
- Potentially abusive/spam content is flagged by the SI batch, hidden behind an explicit user-controlled reveal, contestable, and eligible for delayed removal when uncontested under default or repository-specific rules. Avoid false positives for heated political discussion; contextual targeted bullying/intimidation/harassment is the boundary. History of uncontested removals can inform subsequent assessment subject to retention and privacy constraints.
- The current demonstrations are guided walkthroughs rather than live public hosted topics. Do not misrepresent injected peers as real participants.

## Three concepts

### A. Perspective Shelf — recommended

A single ranked, vertically scrollable board of perspective cards. Each card contains its argument, a short summary, counterargument links, responses to counters, and original contributions. Opening a counter-link enters a focused comparison. The activity rail/strip explains recent change without displacing the debate.

**Pros:** understandable at a glance; expandable to all points; works in embeds; maps directly to keys; scales to mobile.

**Cons:** long debates need careful density management, and updates must not destabilize reading position.

### B. Debate Reading Room

A ranked index of perspectives plus a dedicated editorial reading pane for the selected key. The reading pane covers summary, counters, counters-to-counters, original points, and references to linked keys.

**Pros:** excellent deep reading; keeps long summaries structured.

**Cons:** less immediate visibility of the whole debate; selecting a perspective can feel like switching documents.

### C. Counterpoint Canvas

A small spatial graph of perspective clusters, linked through counters. Selecting a cluster opens the underlying content and original contributions.

**Pros:** relationships become visible and distinctive.

**Cons:** higher cognitive load, difficult in narrow embeds, and graph navigation can obstruct full reading of every post.

**Decision:** Use **A as the default**, borrow B's reading treatment for an expanded card, and expose a restrained slice of C only when a counter-link is focused. No graph as the landing view.

## Recommended desktop IA

1. **Context header:** topic title, demo/live indicator, rules access, optional expand-to-focus control. Clearly label demo peers as simulated.
2. **Primary perspective board (approximately 70% of available desktop content width):** ranked perspective cards with all original points discoverable in a single board scroll. Compact Unfiled area. No internal nested card scroll.
3. **Secondary activity rail (approximately 30%):** 'Your post is live', 'Another participant added a point', 'Organized into …', and meaningful changes. Do not repeat the entire content as bubbles.
4. **Lightweight composer:** body text; optional mic; optional multi-key associations; Post action. The composer expands on focus but remains visually subordinate until engaged.
5. **Focused counter-link mode:** replace or expand the main reading area with two linked perspective summaries side by side, with each perspective's underlying points and further counter-links accessible. Activity gives up space as needed. A visible Back to debate action restores scroll position.

### Desktop conceptual wireframe

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ CLEVERTREE   Should cities use camera networks?      DEMO   Rules  ⤢ │
├────────────────────────────────────────────────┬────────────────────────┤
│ PERSPECTIVES  · Ranked by prominence           │ RECENT ACTIVITY        │
│                                                │                        │
│ 01 Cameras may improve investigations          │ ✓ Your point is live   │
│    Short perspective summary                   │ ↳ Awaiting organization│
│    Common counters: Privacy · Misuse           │                        │
│    Responses to those counters                 │ • Demo participant     │
│    Original points [all accessible]            │   contributed a point  │
│                                                │                        │
│ 02 Surveillance creates privacy concerns       │ ◌ SI batch is working  │
│    Summary, counter-links, original points     │                        │
│                                                │ ✓ Board updated        │
│ 03 Oversight and retention rules matter        │                        │
│    Summary, counter-links, original points     │                        │
│                                                │                        │
│ Unfiled · 2 awaiting organization              │                        │
├────────────────────────────────────────────────┴────────────────────────┤
│ ADD YOUR PERSPECTIVE  [What would you like to say?                  ]   │
│ 🎙 Optional linked keys                                              Post│
└─────────────────────────────────────────────────────────────────────────┘
```

## Recommended mobile IA

1. Header and full topic title, plus compact Demo/Live and Rules affordance.
2. Short invite: 'Explore perspectives, then add your point.' No mandatory tutorial.
3. One-column ranked perspective cards in the **main page scroll**, with inline summaries, counter-link affordances and every original contribution reachable. No horizontal carousel for the core debate.
4. Light Unfiled area in the board.
5. Collapsed 'Recent updates' strip or drawer, opened on demand; never a chat feed consuming the main screen.
6. Thumb-friendly 'Write a point' affordance that expands to the simple body-only composer. Optional mic and multi-key selection remain subordinate.
7. Focused counter-link mode stacks perspectives top-to-bottom, with an easy switch/jump control and a persistent route back to the board.

### Mobile conceptual wireframe

```text
┌──────────────────────────────────┐
│ 🌱 Clevertree            ⋯       │
│ Should cities use camera        │
│ networks?                       │
│ [Interactive demo] 6 perspectives│
├──────────────────────────────────┤
│ Explore the main perspectives,   │
│ then add your own point.         │
│                                  │
│ PERSPECTIVES        Most prominent│
│ ┌──────────────────────────────┐ │
│ │ 01 Investigative benefits    │ │
│ │ Short summary                │ │
│ │ 18 points · 3 counter-links  │ │
│ │ Counter: Privacy concerns ↗  │ │
│ │ Original points ↓            │ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ 02 Privacy concerns          │ │
│ │ 12 points · 4 counter-links  │ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ 03 Oversight and retention   │ │
│ │ 9 points · 2 counter-links   │ │
│ └──────────────────────────────┘ │
│ Unfiled · 2 awaiting organization│
│ [3 recent updates ▴]            │
├──────────────────────────────────┤
│ Say something about this debate │
│                     [Write point]│
└──────────────────────────────────┘
```

**Responsive rule:** adapt to the panel's **container width**, not just the device viewport. On a narrow desktop embed, behave like the mobile layout. Optional expand-to-focus can offer the more detailed view without making it necessary.

## Perspective card anatomy

1. **Stable perspective identity:** short one-line key/title and a stable topic-specific address.
2. **Perspective summary:** neutrally explain the claim/point of view, without asserting correctness.
3. **Common counters:** links to other keys that directly counter it. Many-to-many relationships; not forced For/Against sides.
4. **Responses to counters:** succinct argument summaries, with progressively deeper links or disclosure when needed rather than visually nested comment threads.
5. **Original posts:** fully reachable; maintain one canonical post identity even if it is displayed in multiple perspective cards. Every post displays every confirmed key chip (no `+N`).
6. **Status, where relevant:** provisional link, waiting to be organized, new placement, flagged, or contest open.

**No nested scrolling inside cards** and no summary-only dead ends. The board should permit complete traversal of every contribution. Prominence ranking should be understandable at a high level, but exact scoring need not be displayed on each card.

## Focused counter-link view

- Opening a counter-link transitions from the ranked board to a focused **this ↔ that** comparison.
- Desktop: two perspective reading areas side by side; mobile: stacked reading with anchors/jump affordances.
- Each side shows its own core point, strongest original contributions, common counters and links to further perspectives.
- Labels identify perspectives A and B or their names; **never imply a universal binary For/Against or designate a winner**.
- Preserve board scroll position, route and composer draft when entering and exiting.

## Composer behavior

- Start with a simple multiline body field and Post button. No title, no side selection, no mandatory key association.
- Microphone, where device support exists, transcribes into the same body field. Require permission and allow edit before submitting.
- As the person types, the host may suggest an existing perspective; a suggestion is **not a filing decision**.
- Optional multiple key selections are soft proposals, not a binding taxonomy assignment. Show them as provisional until batch confirmation; explain if a later batch revises/removes them.
- After posting, display the contribution immediately from the live path and permit another point without waiting on SI.

## View and event-state model

| Host signal / UI state | Main board | Activity and feedback |
|---|---|---|
| Loading initial `view` | Skeleton cards; no fake contributions | 'Loading debate' |
| Live empty | Truly empty board + invitation | No invented feed |
| `hello` | No content rearrangement | Quiet connected indicator |
| Typing / `preview` | Stable board | Optional suggested existing key |
| HTTP `submit` pending | No assumed filing | 'Posting…', explicit failure and retry |
| `post.live` mine | Show new post, provisional keys or Unfiled | 'Your point is live' |
| `post.live` others | Show where known, otherwise Unfiled | Compact new-activity indicator |
| `drain` or async batch pending | Board stays interactive | 'Organizing in background' |
| `batch.notice` | Do not infer structure before snapshot | SI process / organization notice |
| `board.snapshot` | Reconcile keys, links, summaries, confirmed associations | Highlight actual changed regions |
| WebSocket disconnect | Keep last board, avoid false freshness | 'Reconnecting; updates may be delayed' |
| Flag status provided | Hide affected body in all representations | 'Potential issue · Click to view · Contest' |

**Critical invariants:**

- A post can be published before being organized. SI does not block posting.
- Keep suggested and confirmed key associations visually distinguishable.
- Every confirmed key association appears as a visible chip on the post, even when multi-key.
- Preserve reading stability. Prefer a 'Board updated · View changes' affordance rather than automatically jumping cards around as prominence changes.
- Treat `board.snapshot` as authoritative; activity events are not themselves a complete replacement for board structure.
- Respect stable post/key IDs and reconcile in place so focus, scroll and draft content survive refreshes.

## Guided demo: pause + explain the change

**Invariant:** Continue/pause is a UI-only presentation mechanism **on demo pages**. The host continues to drain jobs, inject simulated peers, send WebSocket events and refresh snapshots. Live topics present events normally, never with guided Continue gates.

| Checkpoint | Trigger / source | Coach target and message | Continue behavior |
|---|---|---|---|
| 1. Explore | Initial view/snapshot | Board: 'These are the main perspectives already being made.' | Moves attention to composer |
| 2. Write | Composer interaction | Composer: 'Add your own point; no title or side needed.' | Actual submit is performed by visitor |
| 3. My point | `submit`, then `post.live` confirmation | New post: 'Your point is live, even before organization.' | Advance to next meaningful queued update |
| 4. Another voice | Server drains visitor beat; injected peer `post.live` | Peer point: 'A simulated participant added another perspective.' | Reveal next checkpoint |
| 5. Organizing | `batch.notice` | Activity/status: 'Clevertree is grouping points into perspectives.' | Advance when structural result available |
| 6. Board changed | `board.snapshot` with actual differences | Updated card/link: 'Your point now appears in these perspectives; here's what changed.' | Finish walkthrough; free exploration |

### Guiding principles

- Keep the guided flow short and participatory; do not force a long autoplay theater before the first contribution.
- Use a small floating coach note anchored near the affected region, with restrained highlight, clear Continue, Skip walkthrough, and Catch up now actions.
- No heavy dark scrim, no page-disabling spotlight, no excessive celebratory animation.
- Respect reduced-motion preference; smooth movement is optional, not required.
- Group events by **meaningful visitor-visible changes** rather than one click per raw event; coalesce redundant snapshots.
- A separate **current authoritative board** continues updating behind a **guided presentation snapshot**. Never imply the host is waiting, and never replay stale organization as the current state.
- If the visitor skips or catches up, immediately reconcile to the newest authoritative snapshot.
- Events can arrive out of narrative order. Use correlation to the visitor beat / batch and actual diffs, not assumptions about fixed sequence.
- The coach can anchor to the composer, my post, peer point, activity notice, an updated key, or an updated link; if an anchor has scrolled away, show a safe in-panel jump without stealing focus.

## Abuse, spam and human-authored house rules

**Suggested compact chrome:** **Rules set by people · SI-assisted organization**. Avoid promising a continuously staffed 'Human moderated' desk if there is none.

### Default item lifecycle

1. Batch evaluation takes full discussion context into account. Distinguish ideology, disagreement and intense language from targeted harassment, threats, bullying and intimidation. Err against labeling heated but permissible content abusive.
2. Assign a contextual potential-abuse/spam status only when justified; allow a soft uncertain status with proportionately softer consequences.
3. For content actually flagged, conceal the body behind a neutral **Click to view** surface. Do not erase the existence of the post. Offer **Contest flag** and a short contextual explanation.
4. Maintain a configurable contest window. Uncontested flagged items may be removed **after a delay**. Contested items require a defined re-evaluation/escalation rule rather than a public deletion vote.
5. Pattern signals can incorporate prior **uncontested** removals, but a flag alone is not proof; constrain retention of behavioral metadata and avoid retaining full body text without need.
6. `rules.md` defaults apply unless a repository provides valid overrides. Preserve human governance and ownership/verification requirements for 'person spaces'.

**Important implementation limit:** if classification only occurs in a later batch, the post may be displayed before any flag arrives. The UI can hide immediately when a flag status is received, but cannot promise pre-display screening without a separate pre-display check. This is a host/system capability question, not a visual-design solution.

Moderation statuses remain inline and contextual. Do not show a global moderation bureaucracy feed or a public delete-vote count.

## What not to show by default

- Full-screen chat bubbles or a Discord/Reddit-like threaded reply tree.
- Permanent For/Against columns or enforced binary pairings.
- An unreadable full graph of all linked perspectives.
- Raw HTTP/WebSocket, drain/job terminology or backend mechanics.
- SI confidence numbers on each argument card.
- Reordering, auto-scrolling and continuous animation while someone is reading.
- A winner, truth meter, leaderboard or SI verdict.
- Full moderation audit histories for ordinary posts.
- Mandatory title, stance, subject taxonomy or key selection at posting time.
- A recents feed expanded so much that the arguments lose prominence.
- Simulated demo peers presented as real public participants.
- A coach note after every minor event.

## Host / API data requirements

| UI requirement | Host capability / data needed |
|---|---|
| Trustworthy 'what changed' narration | Stable post/key/link IDs and board snapshot versions or reliable before/after diff |
| Always show every key chip | All key associations on each post, with provisional/confirmed distinction |
| Multi-key display without duplicating speech | One canonical post ID with references across keys |
| Clear soft-association revisions | Placement additions/removals and, ideally, concise explanatory reason |
| Honest guided demo | Explicit simulated-peer attribution and correlation to visitor beat |
| Moderation UX | Flag category, severity/uncertainty, visibility, contest deadline and disposition |
| Contest interaction | API route to create contest and observe state |
| Stable address / durability | Persisted key, post and relationship IDs; planned comments-branch storage |
| Admin rules | Accessible effective rules plus source/version and verified-ownership boundaries |

Existing HTTP `/api/chat` actions (`view`, `preview`, `submit`, `drain`, `replay`) and WebSocket `/api/chat/ws?topic=…&visitor=…` events (`hello`, `post.live`, `batch.notice`, `board.snapshot`) provide the core integration architecture. Prefer richer payloads and authoritative state over adding unnecessary event types. Demo board memory and planned git comments-branch persistence must not be presented as the same durability guarantee.

## First prototype milestone

Build one coherent walkthrough through these outcomes, in both desktop and mobile UI:

1. Open a populated debate and browse ranked perspectives.
2. Compose one body-only point; observe immediate publication.
3. Receive an explicitly simulated peer point during the demo.
4. Observe asynchronous batch organization, with all confirmed key chips on each post and a clear board change explanation.
5. Open one counter-link and compare perspectives; return without losing scroll or draft.
6. Show one flagged-item state with reveal and contest affordances.
7. Confirm readability, keyboard interaction, reduced-motion usability and container-responsive behavior.

**Design north star:** **The board is the product. The composer is the entry point. Activity shows what happened. The guided coach teaches briefly, then gets out of the way.**
