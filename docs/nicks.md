# Display nicks (IRC-style)

Clevertree Chat uses a **display nick** on posts (not a per-user Ergo NICK). Visitor UUID stays in `localStorage` (`clevertree.visitor`); the nick is `clevertree.nick`.

## Guest forest nicks

If someone sends without a real name (empty / `anon` / `you`), the room **mints** a forest/nature guest nick on that first send only — e.g. `Fern7k` — from [`fronts/room/guest-nicks.js`](../fronts/room/guest-nicks.js), fills the composer name field, soft-claims it on the host (`action=name`, unlocked), then continues the public post confirm.

- Same device keeps the nick in localStorage.
- Another browser: type the same unlocked nick to keep posting under it (host claim rules).
- **Lock with passphrase** / passkey (Identity menu) when they want the nick reserved.

No mint on cold load — only when about to post.

## Future: durable identity if IRC is rebuilt

Today the IRC network (Ergo on pub1) may be wiped and rebuilt; soft claims live on host disk and visitors re-register by posting again. Longer term we want a **passworded contributor identity** (and historic contribution map) that survives a full IRC rebuild — separate from guest minting. Out of scope until that store exists; do not invent standing exceptions in the meantime.
