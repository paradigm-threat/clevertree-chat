# Acceptance and QA checklist

## Demo walkthrough
1. Open `prototype/index.html` in Chrome. Select stale state. Verify room, Refresh, Track and composer are present.
2. Enter an unsent message. Click Refresh once; host overlay appears and advances through six sample groups.
3. Verify the draft remains. Send a message while gathering; it appears in the room. AI can also be toggled independently.
4. Let the simulation finish; status becomes Up to date. Repeat and use the host overlay Stop control at desktop width.
5. Switch to stale preset, click Track this group; status becomes Tracked. Toggle AI on and off. Confirm composer remains public.
6. Compare at 360, 400 and 420px. The desktop preview can also show the simulated host page. The preset selector is demo chrome, not a proposed Relay feature.

## Production acceptance criteria (not implemented by the demo)
- [ ] Room connection, draft, attachments and scroll anchor survive host navigation and gather progress.
- [ ] One click starts gathering; no primary gather tab or multistep wizard.
- [ ] Progress/freshness/failure/retry are visible without obscuring history or composer.
- [ ] Duplicate starts are prevented; partial progress and last successful refresh are persisted.
- [ ] Service-worker suspension and host-tab closure recover safely.
- [ ] Track/Tracked reflects the actual current group, including errors and unsupported pages.
- [ ] AI rail defaults to hidden; opening it never creates a second chat destination.
- [ ] Public notice remains visible during text, audio and video composition. Private AI is disabled only.
- [ ] Markdown is safely rendered; public media is previewable and posted only as intended.
- [ ] Keyboard, screen reader, reduced-motion, IME, focus, long messages, zoom and contrast are verified.
- [ ] Web embed has no Relay Refresh or host-tab controls.
- [ ] No collection management or diagnostics replaces the room.

## Verification scope
The original reference prototype was tested at 360 and 420px and for simulated send-during-gather, track and AI toggle. This kit packages those screens and original demo. The production criteria above require real integration testing.
