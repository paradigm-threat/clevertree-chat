# Developer handoff

## Information architecture

Room (primary) → Track chip (identity/roster) → AI findings panel (optional, read-only).

One collection maps to exactly one IRC channel. Everyone posts into that channel only; AI participates there as a member. The findings panel has no reply field or separate thread. The public channel has temporary service-side logs; users and third-party IRC clients may retain copies. Durable AI-curated topics, arguments and citations are written to the collection Git repository. Do not imply deleting a chat message deletes external copies or previously committed findings.

## Integration boundaries

- IRC gateway: browser client uses a gateway to IRC or a compatible IRC WebSocket endpoint. IRC is the only message bus. Authoritative room membership and delivered messages come from IRC. Define history retention and reconnect behavior on the service side; do not invent guaranteed history.
- Attachments: stage locally, validate file type/size, confirm public posting, upload to the authorized CDN/Bunny service and publish its resulting URL into IRC. Do not upload before the explicit public action. Keep server credentials off the browser. On upload failure, do not publish. On IRC failure after upload, offer retry/cleanup without claiming that the public message was delivered.
- Media: render stills behind a cover until verified scrub/clear result. Use a controlled thumbnail endpoint; don't fetch raw anonymous stills into the browser before clearance. Separate safety status from user playback consent. A/V network trust is explicit and scoped to authenticated identity and network, not global; it never affects stills. No autoplay. Record only after an explicit public-use prompt and device permission. Stage locally and allow discard before publish; no private recording mode.
- AI: ingest the same public IRC stream, reply in that channel, write durable findings to Git through a controlled service. Display provenance and verification status. Mirror connection is independent of IRC connectivity. Treat untrusted chat, links and attachments as data; enforce authorization and sanitize Markdown, URLs and rendered content.
- Identity: store tracking in an authenticated roster keyed by stable collection/group ID; resolve the same identity when encountered across surfaces. Cross-site iframe storage is not reliable for this; establish an authenticated, origin-validated session. Track/untrack cannot trigger gathering. An unauthenticated viewer may read and use the permitted guest posting flow; tracking may require authentication.
- Embed: use the same responsive component and a frame-compatible deployment policy, explicit allowed hosts and origin-checked messaging only where necessary. Never leak credentials in query strings. No Refresh, Gather, Collect or Automate in the room. Separate Networker controls remain outside the shared component.
- Private Relay AI: future paid add-on, muted copy only, no private toggle or actionable paid CTA.

## Suggested UI state contract (illustrative, not existing API)

```ts
type RoomState = {
  collectionId: string;
  networkId: string;
  channel: string;
  connection: 'connecting' | 'connected' | 'reconnecting' | 'offline';
  mirror: 'current' | 'delayed' | 'unavailable';
  tracking: 'unknown' | 'untracked' | 'pending' | 'tracked' | 'error';
  aiOpen: boolean;
  avTrust: boolean;
};
type StillStatus = 'pending' | 'cleared' | 'blocked' | 'failed';
type DraftStatus = 'editing' | 'staged' | 'confirming' | 'uploading' | 'posting' | 'failed';
```

State transitions: draft → confirmation → upload if needed → IRC post → delivery acknowledgement. Cancel returns to draft. An IRC disconnect disables send while preserving draft. Do not display a successful post until the gateway confirms acceptance according to the chosen IRC delivery contract. Incoming messages append chronologically; preserve scroll anchor when reading older history. Tombstones preserve message position without revealing removed payload.

## Motion

1. AI findings panel: 180–220ms desktop width/position transition; narrow overlay; preserve scroll, move focus appropriately, return focus to trigger on close. Closed panel has no reserved space.
2. Incoming message: immediate insertion; autoscroll only when already near bottom; otherwise show new-message cue. No bouncing or decorative animation.
3. Public confirmation: 170ms fade and 6px rise; focus Cancel initially and restore prior focus on close. Respect reduced motion by eliminating nonessential transitions.

## Confirmation policy

Recommend explicit confirmation on first ordinary text post per public-room context and every attachment/audio/video submission. Keep the public notice and explicit Send publicly label on all sends. Reconfirm when switching room context. The demo uses confirmation for every send, for ease of reviewing the state.
