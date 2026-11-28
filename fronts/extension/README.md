# Clevertree Chat — browser extension

MV3 side panel. **Debate board** = shared IRC room + SI panel. Works on **any website**.

## Behavior

- Default channel **`#web`** with trailing domain tag `[[d:example.com]]` (never page path).
- Product hosts (e.g. paradigmthreat.net → `#pt`, myproblem.app → craft channels) via `channel-route.js`.
- **Networker** (Gather / Track / Refresh) is **off by default**. Enable only in **Options**.
- Theme: Options or room toggle; packs in `room/themes/` (system / light / dark).
- **Exclusive surface with host sites:** pages may quiet-`ping` (`clevertree.chat.toggle` + `action: "ping"`) via `externally_connectable`. Ping must **not** open the side panel. When present, hosts (e.g. MyProblem) skip the in-page room WebSocket and show a single Open control that calls `action: "open"`. Fail-open if ping fails. No SharedWorker / SW-owned socket yet — each mounted room still owns its own WS.
- **Full-page room handoff:** `live.html` / `CleverTreeRoom` (non-sidepanel) probes the same ping. When the extension is present, SI fills the page (`data-ext="handoff"`) and an **Open Chat** control stays in the SI rail head (right of tabs). Click opens/focuses the side panel with `channel` (+ optional `title`). Chrome does not reliably signal side-panel close, so the button stays visible.

## Load unpacked (ready to test)

Room UI must live **inside** this folder (`room/`). Chromium blocks `../room` outside the extension root (that caused the blank panel).

```bash
bash scripts/sync_extension_room.sh   # from repo root; also run by pack_extension.sh
```

1. Chrome → `chrome://extensions` → Developer mode → **Load unpacked**
2. Select **`fronts/extension`** (this directory, after sync)
3. If you already had it loaded: **Reload** the extension card
4. Pin Clevertree Chat; open any website → toolbar icon → side panel
5. On PT hosts expect **`#pt`**; elsewhere expect **`#web`** + domain chip
6. **Extension options** for Networker / theme

### Networker gather (Nextdoor)

1. Options → enable **Networker**
2. Open a logged-in Nextdoor **group feed** tab
3. Side panel → **Gather** / **Refresh**
4. If the batch hash differs from the last local hash, a consent dialog asks:
   - Post the inbox link in the public chat (`#ga-savannah-cat-rescue`)
   - Auto upload / post new batches in the future
5. Upload goes to MyProblem Bunny inbox (`/api/social-capture/upload`); optional room post uses `[[mp:inbox …]]`

Zip download (same layout): `downloads/clevertree-chat-extension.zip` / https://clevertree.chat/downloads/clevertree-chat-extension.zip

## Files

| File | Role |
|------|------|
| `manifest.json` | MV3 + side panel + externally_connectable |
| `background.js` | Open panel; `clevertree.chat.toggle` (`ping` / `open` / `close`) |
| `sidepanel.html` / `.js` / `.css` | Mounts shared room |
| `options.html` / `.js` | Networker + theme |
| `room/*` | Synced copy of `fronts/room` (IRC + SI UI) |
