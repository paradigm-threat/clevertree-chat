# Component map and visual specification

## Layout
Full-height narrow side panel, 360–420px target; adapt to the actual Chrome-managed panel width. One vertical composition, no primary tabs. White header and composer, warm off-white room canvas, evergreen primary action. Use Lato or fallback font, compact avatars and timestamped, left-aligned messages. No purple AI treatment or card grid.

```
Relay / CleverTree             AI  ...
Savannah Cat Rescue
#ga-savannah-cat-rescue  IRC connected
-------------------------------------
Last refreshed 5 days ago     Refresh
6 tracked groups
-------------------------------------
Current tab / group         Track this group
-------------------------------------
          Public room history
             (only main scroll)
-------------------------------------
Optional AI activity (hidden by default)
-------------------------------------
Public channel notice
Sticky Markdown / media composer
```

| Component | Responsibility | Behavior |
|---|---|---|
| RoomShell | Shared CleverChat UI | One room per collection, independent of host navigation |
| RoomHeader | Brand, title, channel and connection | Keep visible; IRC status is independent of gather |
| RefreshControl | Extension-only collection freshness | Always visible; one click starts gather; status changes in place |
| TrackChip | Extension-only active group context | Track this group / Tracked; reflect current host tab |
| MessageHistory | Public IRC log | Flexible height, scroll independently; messages, replies, AI, source covers and media |
| Message | Sender, time, content, reply | AI has plain green label; no private recipient |
| MediaCover | Source, audio, image or video preview | Public posting; open source or playback only when connected |
| AIRail | Filed topics / group AI activity | Fully hidden initially; toggle without changing room; never a subtopic composer |
| Composer | Text, Markdown, media, send | Sticky; public notice always present; draft remains during gather |
| Overflow | Tracked roster, automation, diagnostics | Secondary actions; private AI is disabled coming later |

## Shared vs extension-only
The room header, history, AI rail and composer are shared with the web embed. The host-context, Refresh and Track controls are injected only by Relay. The web embed must not have Refresh. The main channel remains the only posting destination. AI can write durable topics/arguments/citations to the collection repository; topics are not chat destinations.

## States and screen exports
- `relay-stale.png`: baseline untracked group, stale collection, AI hidden.
- `relay-gathering.png`: in progress; same history and composer; current tab changes to a tracked group.
- `relay-tracked.png`: tracked group, stale collection, AI hidden.
- `relay-ai.png`: same room with secondary AI rail expanded.
- `relay-room-states.png` and `relay-secondary-states.png`: annotated paired comparisons.
- `relay-gathering-context.png`: host-page overlay and panel side by side.

## Geometry and behavior
Use an outer flex column at viewport height with min-height: 0 on the history, flex: 1 on the history, flex-shrink: 0 on header and composer. Keep rail bounded (target max 140px; internal scroll if needed) and collapse on demand. Allow wrapping long text and truncation of tab names with full accessible names. At reduced height prioritize the composer and Refresh; collapse the optional rail before taking away room usability. Keep the history scroll anchor when refreshing or changing tab context; only autoscroll new messages when already at the bottom or after sending. Preserve draft, selected attachment and room identity through gathering. Disable duplicate start requests only while a gather is running; do not disable chat or AI.

## Accessibility and media
Use visible focus, accessible names for icon buttons, an aria-live polite region for gather progress and connection changes, aria-expanded on AI toggle, and a textual tracking status. Use text as well as color for all status differences. Prefer 44px interaction targets where space allows; validate compact controls against applicable accessibility requirements. Honor reduced-motion preferences. Enter sends, Shift+Enter inserts a newline; do not submit during IME composition. Preserve public destination notice during media selection and recording. Validate and sanitize Markdown, URLs and uploaded files before production use; no private mode.
