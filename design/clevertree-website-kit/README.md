# Clevertree Chat — website kit

Static HTML/CSS/JS, no build step or React. Run `python3 -m http.server 8000` in this directory and open http://localhost:8000. Routes use directory indexes: `/`, `/chat/`, `/extension/`, `/dev/`. `?theme=dark` or `?theme=light` forces appearance; toggles persist the choice locally. The default follows the operating system.

## Design direction
Living Commons: sage paper, forest ink, white IRC and tinted SI, quiet rules, the supplied tree mark. One dominant room visual in the hero. No decorative promotion cards. The room is deliberately empty rather than staging a debate. On mobile, stack IRC above SI and allow SI to be hidden. The extension's browser frame is illustrative; example.org is a neutral context label, not a topic or room selector.

### Type and spacing
- Display: IBM Plex Serif 500, 40–68px page titles, 30–48px section headings; mobile hero brand 38px, headline 32px.
- UI: Source Sans 3 400/600/700, 17px body, 20px lead, 14px room, 12–13px metadata.
- Channel and section labels: IBM Plex Mono 400/500, 12–16px.
- Spacing: 4/8/12/16/24/32/48px; broad sections use 80px desktop and 48px mobile. Outer margins 48px desktop, 16px mobile. Maximum content width 1200px.
- Header: 72px desktop; wrapped navigation on small screens. Buttons 48px (44px mobile), radius 8px; room frame 10px; controls 6px.
- Light and dark tokens in `assets/theme.css` are inherited from the supplied product kit, including the exact requested light roles. No unrelated accent colors. Fonts are requested from Google Fonts; local fallback is used if unavailable. No font binaries are distributed.
- Motion: 220ms theme color transition and 450ms room entrance; reduced-motion preference disables both.

## Headlines
1. **A public room. A clearer conversation.** (recommended)
2. Public debate, organized alongside.
3. One shared room. A record of the conversation.

## Recommended core home copy
**Clevertree Chat — A public room. A clearer conversation.**
A debate board built from an IRC room and an SI panel that organizes public discussion.

**One room. Two panes.** Everyone joins #web. The IRC transcript holds the conversation. Super Intelligence (SI) curates it alongside the room.

**Conversation first.** Join the room. Enter the shared public space. Talk in public. Messages become the record. Read alongside. SI organizes the discussion over time.

**One shell. Other places to talk.** MyProblem.app collections can mount their own room. Paradigm Threat and QuizGate can use the same independent chat backbone.

## Implementation map
`assets/theme.css` — semantic tokens and font stacks. `assets/site.css` — responsive layout and component classes. `assets/site.js` — theme persistence, SI visibility, integration notice. `index.html` — marketing sections. `chat/index.html` — full-page host. `extension/index.html` — extension marketing and unpacked instructions. `dev/index.html` — builder contract. `forest.html` — placeholder destination only.

Room structure: `.room > .room-top + .panes`; `.panes > .irc + .si`; IRC contains `.pane-head`, `.transcript`, `.composer`. Keep public status visible, bind connection state and transcript to real IRC transport, enable composer only when connected, and replace the SI waiting state only with genuine batch results. Bind Investigate to the existing product action. Preserve the same shell in host sites. Do not infer channel identity from paths. Use the supplied product channel mapping instead. Theme and panel toggles work locally; no service calls are made.

Production integration needed: real IRC/SI endpoints, extension build or store URL, canonical Forest manifesto URL/text. No fabricated install download or live messages. The current chat host explicitly indicates that the transport is not configured. Extension instructions require the real extension folder. Replace manifesto placeholder when supplied.

## Exclusions
- Multi-topic boards, topic room selectors, or fake debates.
- Networker toolbar (Gather/Track/Refresh); Options-only and off by default.
- Winner/vote UI, SI-created topic-index entries, partisan SI behavior.
- Page-path tags; ordinary sites show domain context only.
- Stats strips, fake schedules, floating promo badges, neon gradients.

## Mockups
The `mockups/` folder contains browser-rendered screenshots for Home, Chat, and Extension at desktop and mobile sizes in both themes. These are static design previews, not evidence of a live service.
