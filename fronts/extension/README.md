# Clevertree Chat — browser extension

MV3 Chromium side panel. Durable Debate board on `api.clevertree.chat`.

## What it does

- Opens a **side panel** when you click the toolbar icon.
- Asks **https://api.clevertree.chat** to mint the visitor UUID (`action=identify`) and map the **whole site** (domain-level `page_scope`) to a topic (`action=resolve`). IDs are not generated in the extension.
- Posts go through `/api/chat` into the **intake queue** (policy: [`docs/intake-queue.md`](../../docs/intake-queue.md)); batch SI alone permanently files into the comments SoT. Live updates use `/api/chat/ws` (and IRC when the host bridge is on).
- Board stays **empty until you write**; new posts show as provisional until batch accepts.
- Short skippable first-use coach (`clevertree.coachSeen`).
- Toolbar links open live flock / THC boards (not scripted demos).

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
| `sidepanel.html` / `.css` / `.js` | Board UI |
| `normalize-url.js` | Tab URL → debate path (domain collapse in sidepanel) |
| `icons/` | Toolbar icons |

## Tests

```bash
node tests/test_extension_normalize.js
python3 -m unittest tests.test_irc_and_live -v
```
