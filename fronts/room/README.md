# Clevertree public IRC room UI

Shared room chrome for web embed, full page, and Relay side panel.

## Themes (independent of host)

- Storage key: `clevertree.room.theme` (`light` | `dark`; absent = follow `prefers-color-scheme`)
- Applied on `.room` / `.ct-room` via `data-theme` + `color-scheme` — **not** on host `<html>`
- Host sites (e.g. MyProblem) keep their own key (`myproblem.theme`) so site chrome and room chrome can disagree
- Toggle lives in room header (`.top` + `.actions`); MyProblem embed may hide `.top`, so `.actions` remains the reachable control

Sync copies into MyProblem at `public/chat-room/` after room UI changes.
