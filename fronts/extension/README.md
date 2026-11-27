# Clevertree Chat — browser extension

MV3 side panel. **Debate board** = shared IRC room + SI panel. Works on **any website**.

## Behavior

- Default channel **`#web`** with trailing domain tag `[[d:example.com]]` (never page path).
- Product hosts (e.g. paradigmthreat.net → `#pt`, myproblem.app → craft channels) via `channel-route.js`.
- **Networker** (Gather / Track / Refresh) is **off by default**. Enable only in **Options**.
- Theme: Options or room toggle; packs in `room/themes/` (system / light / dark).

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

Zip download (same layout): `downloads/clevertree-chat-extension.zip` / https://clevertree.chat/downloads/clevertree-chat-extension.zip

## Files

| File | Role |
|------|------|
| `manifest.json` | MV3 + side panel + externally_connectable |
| `background.js` | Open panel; `clevertree.chat.toggle` handshake |
| `sidepanel.html` / `.js` / `.css` | Mounts shared room |
| `options.html` / `.js` | Networker + theme |
| `room/*` | Synced copy of `fronts/room` (IRC + SI UI) |
