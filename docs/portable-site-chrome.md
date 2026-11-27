# Portable site chrome + chat SoT

## Chat UI (one version)

Canonical: [`fronts/room/`](../fronts/room/)

- `CleverTreeRoom.mount` / `ClevertreeChatLauncher`
- Thin CEs: `clevertree-ces.js` → `<clevertree-room>`, `<clevertree-chat-dock>`
- Extension copies via `scripts/sync_extension_room.sh` (not a fork)

Load from `https://clevertree.chat/fronts/room/…`.

## Bottom overlay (one version)

Canonical: [`fronts/site-chrome/`](../fronts/site-chrome/)

- `<pt-bottom-overlay>` — Top → Chat → AI → Play → Settings
- Events: `pt-overlay:top|chat|ai|play|pause|stop|seek|settings|…`
- Hosts wire TTS / Site AI / chat; overlay is UI only

## PT wiring

- One IRC channel `#pt`; topics from `chat/topics.json` → trailing `[[t:N]]`
- Never page-path tags
- Chat entry = overlay Chat button (header Chat removed)
- `/chat` = placeholder
