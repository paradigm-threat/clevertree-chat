# UI copy

## Refresh
| State | Status | Button |
|---|---|---|
| Never refreshed | Not yet refreshed | Refresh |
| Fresh | Up to date | Refresh |
| Stale | Last refreshed 5 days ago | Refresh |
| Starting | Starting gather… | Gathering… |
| Gathering | Gathering… 2/6 groups | Gathering… |
| Complete | Refreshed just now | Refresh |
| Partial | 4 of 6 groups refreshed | Retry |
| Interrupted | Gathering interrupted | Resume |
| Failed | Couldn't refresh | Retry |

Secondary text: `6 tracked groups` / `Working in host tab` / `Refreshed just now · 6 groups`. Show actual completed/total counts; do not treat a partially refreshed collection as fully current. Refresh is always present, including fresh collections. Stale threshold is a product setting, not established by the design; five days is illustrative.

## Track
- Untracked: **Track this group**
- Tracked: **Tracked**
- Success: Group added to this collection.
- Pending: Tracking…
- Error: Couldn't track this group. Try again.
- Unsupported page: Open a community group to track it.
- Unknown tab context: Checking current tab…

## Public channel
**Public channel.** Text, photos, audio & video are public.

Before recording: This recording will be shared with the public room.

Placeholder: Message #ga-savannah-cat-rescue…

Composer hints: Markdown supported · Enter to send

## Empty room
**Start the conversation**

Ask a question, share an update, or help someone in this collection. CleverTree AI is here to help the room.

Everyone in the public channel can participate.

## Connection and AI
IRC connected / Connecting… / IRC disconnected · Reconnecting… / Couldn't connect · Retry

AI activity · Topics filed from this public room · no separate chats

Overflow: Tracked groups · Automate refreshes · Lab / diagnostics · Private AI · Coming later (disabled).

## Gathering overlay (host only)
Gathering collection · 2 of 6 groups
Reading Coastal Georgia Foster Network…
Stop gathering

Completion: Collection refresh complete. Chat stayed open.
Interrupted: Gathering stopped. Room remains connected.
