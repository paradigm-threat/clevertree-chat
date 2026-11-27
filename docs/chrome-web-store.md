# Chrome Web Store listing

Unpacked zip download already ships from [clevertree.chat/extension](https://clevertree.chat/extension). Store listing is optional distribution; the product works via Load unpacked or the zip.

## Preconditions

1. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) account ($5 one-time).
2. Packaged zip from this repo: `bash scripts/pack_extension.sh` → `downloads/clevertree-chat-extension.zip`.
3. 128×128 icon (already in `fronts/extension/icons/icon128.png`).
4. At least one 1280×800 or 640×400 screenshot of the side panel on a real site.

## Listing copy (draft)

| Field | Text |
|-------|------|
| **Name** | Clevertree Chat |
| **Summary** | Public IRC debate board on any website — shared #web room, SI panel for curation. |
| **Description** | Opens a side panel Clevertree Chat room for the site you are on. Non-product sites join the shared #web IRC channel with domain attribution (never page path). Product sites (e.g. Paradigm Threat) use their repo channel. The SI panel shows batch-curated workspace output (Groq/Bedrock). Networker tools stay in Options, off by default. |
| **Category** | Social / Productivity |
| **Language** | English |

## Permissions justification

| Permission | Why |
|------------|-----|
| `sidePanel` | Host the IRC + SI debate board beside the page |
| `storage` | Networker flag + theme preference |
| `tabs` | Read the active tab URL for channel routing / domain tag |
| Host `https://api.clevertree.chat/*` | WebSocket + API |

## Upload steps

1. Dashboard → **New item** → upload `clevertree-chat-extension.zip`.
2. Fill store listing (copy above) + screenshots + icon.
3. Privacy: single purpose (public IRC debate board); no remote code; data sent only to `api.clevertree.chat`.
4. Submit for review. Expect 1–7 days for a first listing.
5. After approval, update [extension/index.html](../extension/index.html) to link the Store URL.

## Confidence

High for side-panel MV3 listing if copy matches the IRC+#web behavior. Do not claim per-domain private debates or always-on Networker.
