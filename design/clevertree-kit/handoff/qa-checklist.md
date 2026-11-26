# Acceptance checklist

Use this checklist for production implementation; not all items are implemented by the demo.

- [ ] Test 360, 390, 400, 420, 768, 1024 and 1440px; no horizontal overflow, clipped composer or unreachable controls.
- [ ] Initial view is the public channel with visible composer, public disclosure and collapsed AI. Newcomers recognize these within five seconds in a usability test.
- [ ] Track/untrack works across web, embed and side panel after identity resolution; no gathering is initiated.
- [ ] AI panel is read-only and optional; closing it recovers all chat width and keeps scroll and draft.
- [ ] All ordinary messages and AI replies use one IRC room; no topic-level composer or private chat.
- [ ] Markdown is sanitized; URL rendering blocks unsafe schemes; attachments are staged and uploaded only after explicit public send.
- [ ] First text send and each media send confirm public posting; cancellation preserves draft; failed upload/post does not report success.
- [ ] Audio/video prompts appear until network trust is set; trust does not apply to still images; autoplay is off.
- [ ] Stills remain opaque until safety service clears them; blocked or failed images remain covered.
- [ ] Tombstones hide original text/media and preserve order; retention and moderation limitations are accurate.
- [ ] Disconnected state preserves draft and disables sending; mirror delay does not falsely imply IRC disconnect.
- [ ] Test keyboard navigation, screen reader labels/status updates, focus trap/return, reduced motion, zoom and contrast.
- [ ] Verify no Refresh, Gather, Collect, Automate, private recording mode or functional paid Relay AI toggle in room UI.
- [ ] Verify iframe origin/session security, CDN access control, IRC gateway authentication and Git write authorization.
