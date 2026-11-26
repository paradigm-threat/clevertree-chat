# Components and responsive composition

| Component | Anatomy | States / rules |
|---|---|---|
| Room header | Brand, Public room, collection title, IRC channel, connection, mirror | Connected / reconnecting / offline; mirror current / delayed / unavailable, independent of IRC |
| Track chip | Plus + Track this group; check + Tracked | Pending, tracked, untracked, failure; persist to authenticated roster, not gathering |
| AI trigger | Panel icon + AI findings / Hide AI | Collapsed by default; fully removed when hidden; accessible expanded state |
| Message | Nick, timestamp, avatar/initial, Markdown, media | Normal, AI participant, sending, failure, tombstone; no threaded/subtopic posting |
| Covered still | Opaque cover, reason, metadata, review state | Pending scrub, cleared, blocked, failed; never bypass via network trust |
| Audio/video note | Play/pause, timeline/time, accessible label | Unverified, warning, trusted, playing, paused, failed; no autoplay |
| Composer | Persistent public disclaimer, draft, Markdown, attach, voice, video, Send publicly | Empty, drafting, media staged, public confirmation, sending, failed/offline |
| Findings panel | Topics, arguments, citations, repository state | Read-only; open, closed, loading, empty, mirror stale; no composer |
| Public dialog | Public channel name, consequences, cancel, explicit post | Focus cancel; retain draft on cancel; prevent duplicate submissions |

## Layout

Wide: full viewport room, brand/status header, room header with track and AI controls, scrollable history, anchored composer, optional 320px AI sidebar. History and composer share max 850px reading width. No empty side rail when closed.

At 700px and below: compact headers, wrapped controls, 12–13px side padding, narrow avatar gutter, anchored composer, full-width findings overlay with close action. Underlying room state preserved. The embed is the room, not a miniature dashboard. Side-panel host may display its own separate context header; no Networker controls inside the room.

## Accessibility

Prefer 44px touch targets in production; prototype includes smaller 36–40px controls. Ensure contrast of text and meaningful icons (WCAG 2.2 AA), keyboard access, visible focus, accessible names for icon-only actions, screen-reader announcements for send/connection failures, and non-color status indicators. The findings panel should trap focus on narrow screens or use an appropriate modal pattern; desktop is a nonmodal aside. The prototype is not a certified accessibility audit.
