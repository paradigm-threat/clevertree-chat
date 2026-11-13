# Clevertree Chat — browser extension

MV3 Chromium side panel. Simplified Debate board matching the web demos.

## What it does

- Opens a **side panel** when you click the toolbar icon.
- Asks **https://api.clevertree.chat** to mint the visitor UUID (`action=identify`) and map the tab URL to a topic id (`action=resolve`). IDs are not generated in the extension.
- Posts and drains go through `/api/chat`; comment ids come from the server. Live updates use `/api/chat/ws`.
- Board stays **empty until you write**.
- Guided demos: **Flock demo** / **THC demo** (or when the tab is already a Cleverchat demo URL) — same Continue / Jordan flow as the web host.

## Load unpacked

1. Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this folder (or unzip the download from https://clevertree.chat/extension)
4. Pin Clevertree Chat; open the side panel from the toolbar icon

## Files

| File | Role |
|------|------|
| `manifest.json` | MV3 + side panel |
| `background.js` | Open panel on action click |
| `sidepanel.html` / `.css` / `.js` | Simplified board UI |
| `normalize-url.js` | Tab URL → debate path |
| `icons/` | Toolbar icons |
