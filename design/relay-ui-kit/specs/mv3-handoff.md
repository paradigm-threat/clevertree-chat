# MV3 implementation handoff (proposed)

This describes the integration boundary, not a working extension. Reuse the existing host overlay/collection engine rather than replacing it.

## Architecture
- Side panel: shared RoomShell plus Relay controls. Independent IRC session and draft keyed by collection ID. The host group can change without switching the room.
- Service worker: validate messages, coordinate one gather job per collection, route to the selected tab, persist checkpoints and publish state. Do not rely on in-memory timers surviving suspension.
- Content script/host overlay: page detection, supported group extraction, progress details and stop action. Only the host tab navigates.
- IRC transport: independent public channel session, with reconnect and deduplication. Browser transport may need an existing WebSocket IRC gateway; raw IRC TCP is not generally available to ordinary extension JavaScript.
- Repository integration: AI-generated durable topics, arguments and citations are written by the existing backend; temporary chat stays on the public bus. No posting to topics.

## Proposed message envelope
These are integration contracts, not established backend API names. Adapt to the existing codebase.

```ts
type GatherPhase = 'idle' | 'starting' | 'gathering' | 'complete' | 'partial' | 'interrupted' | 'failed';
interface GatherState {
  collectionId: string;
  jobId: string | null;
  hostTabId: number | null;
  phase: GatherPhase;
  completed: number;
  total: number;
  lastSuccessfulRefreshAt: string | null;
  checkpoint?: string;
  error?: string;
}
interface TabContext {
  tabId: number;
  groupId: string | null;
  groupName: string | null;
  tracked: boolean | null;
  supported: boolean;
}
```

| Event | Direction | Effect |
|---|---|---|
| GATHER_START | panel → worker | Start idempotent job for collection and selected host tab |
| GATHER_STATE | worker → panel | Update persistent Refresh status only |
| GATHER_STOP | overlay → worker | Stop safely and checkpoint; no chat mutation |
| GROUP_CONTEXT | content script → worker → panel | Update Track chip only |
| TRACK_GROUP | panel → worker | Idempotent add to collection and acknowledge |
| ROOM_MESSAGE | IRC transport → room | Append independently from gathering |

## State lifecycle
`idle → starting → gathering → complete/partial/interrupted/failed`. A new start or retry creates or resumes the correct job. Persist job metadata and completed group IDs after each group; reload from storage when the service worker wakes. Guard against stale updates with job IDs and a sequence/revision. Derive freshness from the last full success; retain it on failure. A host-tab close or unsupported page must not silently report a successful gather. Explicit collection switching, if introduced, must not happen merely because the host navigates.

## Production integration requirements
Use the actual MV3 manifest and existing permission model; request minimal host permissions and avoid inline executable code in extension pages. The editable demo separates JS and CSS but is still a browser simulation. Ensure message sender validation, safe rendering of IRC content and source URLs, media consent and permission handling, and public-only destination validation. Never automatically record or post private media. Gather only data authorized by the user's account and the host platform. Respect group privacy and access boundaries; do not expose private group content automatically merely because the IRC room is public.
