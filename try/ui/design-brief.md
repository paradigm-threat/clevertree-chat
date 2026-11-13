# UI lab — design brief

## Mockup package

Visual proposals (not pixel-locked) live in [`mockups/`](./mockups/):

- [Desktop debate board](./mockups/clevertree-desktop-mockup.png)
- [Mobile debate board](./mockups/clevertree-mobile-mockup.png)
- [Desktop + mobile + focused comparison](./mockups/clevertree-desktop-mobile-comparison.png)
- [Full redesign proposal](./mockups/clevertree-chat-ui-redesign.md)

Repo combined notes: `docs/ui-redesign.md` · proposal copy: `docs/ui-redesign-proposal.md`

## Lab interfaces

| Query | Role |
|-------|------|
| `?ui=board` | **Default** — mockup Debate board (desktop/mobile/focus) |
| `?ui=shelf` | Concept A — Perspective Shelf |
| `?ui=reading` | Concept B — Reading Room |
| `?ui=canvas` | Concept C — Counterpoint Canvas |
| `?ui=hybrid` | Earlier A+B+C experiment |

## Demo mode (built-in)

- **On by default** for first-time visitors (`localStorage clevertree.demoMode`).
- After you **Post**, the UI pauses on **each** update from submit through simulated server replies (live → peer → organizing → board changed).
- Continue / play advances the queue. **UI-only** — the server is not gated.
- **Disable demo mode** from the demo card or About tab → continuous updates, no Continue.
- Live topics (when wired) never use this gate.

## Locked product rules (short)

- Keys = perspectives; flexible multi-links; always show every key chip.
- Primary = ranked topics; recents secondary.
- Composer: body only; optional mic; optional multi-topic tags.
- Abuse: click-to-view; contest; delayed remove if uncontested.

Open: [Board](./?ui=board) · [Shelf](./?ui=shelf) · [Reading](./?ui=reading) · [Canvas](./?ui=canvas)
