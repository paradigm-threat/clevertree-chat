# Channel moderation (public IRC rooms)

Rules live in the **repo** (collection / tip `rules.md` or subrules), not hardcoded in the client.

## Classes

| Class | Behavior |
|---|---|
| Soft / honest mistake | Warning (counted); escalate after N per rules |
| Forbidden (abuse, scam, burn, …) | Remove or tombstone log line; AI/admin |
| Bannable (optional section; default: clear abuse) | Ergo **IP ban** on the socket — no second ban DB |

## Media

- Images: cover until scrub/clear.
- Audio/video: playable; optional “trust this network”; stills still cover-first.
- Anonymous channel disclaimer required near compose.

## AI

Channel AI (`clevertree-ai`) listens on the room, may call Groq/Bedrock, updates tip repo, optional IRC reply. **Never** acts on denylisted bot nicks (`CLEVERTREE_IRC_BOT_NICKS`).

## Ergo + WebSocket

Bans use Ergo’s built-in mechanism. Chat-edge must enforce the same peer IP bans for WS clients.
