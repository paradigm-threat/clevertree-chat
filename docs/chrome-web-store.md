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
| **Summary** | Debate the site you’re on. One room per domain. Empty until you write. |
| **Description** | Opens a side panel Debate board for the active tab’s whole site. Visitor and topic IDs come from api.clevertree.chat; posts are queued for batch SI, which alone permanently files accepted comments. No private standing exceptions. Prefer clevertree.chat/w/… if you do not want an extension. |
| **Category** | Social / Productivity |
| **Language** | English |

## Permissions justification

| Permission | Why |
|------------|-----|
| `sidePanel` | Host the Debate board beside the page |
| `storage` | Remember coach-seen + visitor UUID |
| `tabs` / `activeTab` | Read the active tab URL to resolve the debate room |
| Host `https://api.clevertree.chat/*` | Identify, resolve, submit, WebSocket |

## Upload steps

1. Dashboard → **New item** → upload `clevertree-chat-extension.zip`.
2. Fill store listing (copy above) + screenshots + icon.
3. Privacy: single purpose (debate board); no remote code; data sent only to `api.clevertree.chat` for identify/resolve/submit.
4. Submit for review. Expect 1–7 days for a first listing.
5. After approval, update [extension/index.html](../extension/index.html) to link the Store URL and bump the “not on the Chrome Web Store yet” hint.

## Confidence

| Step | Confidence |
|------|------------|
| Zip pack + Load unpacked | High (automated) |
| Dashboard upload + review pass | Medium (human + Google review) |
| Auto-update via Store | High once listed |

You cannot finish Store publication from CI alone — the developer account and review are human gates.
