# Channel moderation (public IRC rooms)

Rules live in the **repo** (collection / tip `rules.md` or subrules), not hardcoded in the client.

## Classes

| Class | Behavior |
|---|---|
| Soft / honest mistake | Warning (counted); escalate after N per rules |
| Forbidden (abuse, scam, burn, …) | Remove or tombstone log line; AI/admin |
| Bannable (optional section; default: clear abuse) | Ergo **IP ban** on the socket — no second ban DB |

## Media

Uploads go through `POST /api/chat/media/upload` → Bunny (`chat-public/…`) → room markers `[[mp:media … review=…]]`.

| Kind | Until AI `review=clear` | After clear |
|---|---|---|
| Image / GIF | Covered (`.shield`); click to peek | Shown uncovered |
| Video | Covered; click peeks muted | **Muted autoplay**; click for sound |
| Audio | Manual play only (`preload=none`) | Same — never autoplay |
| PDF / text | Download / open link | Same |

- Rejected review stays covered (no peek).
- Host map `var/clevertree-live/media-review/<sha>.json` + WS `media.review` lift covers without editing IRC history.
- Anonymous channel disclaimer required near compose.
- Allowlist only (images, video, audio, PDF, plain text); max **50 MiB**.

## AI

Channel AI (`clevertree-ai`) listens on the room, may call Groq/Bedrock, updates tip repo, optional IRC reply. **Never** acts on denylisted bot nicks (`CLEVERTREE_IRC_BOT_NICKS`).

## Ergo + WebSocket

Bans use Ergo’s built-in mechanism. Chat-edge must enforce the same peer IP bans for WS clients.
