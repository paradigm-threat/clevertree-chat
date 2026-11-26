# Relay · CleverTree Networker (extension)

**Canonical home:** this folder in `clevertree-chat`. MyProblem consumes CleverTree; do not fork a second chat UI under `myproblem/extensions/capture`.

## Load unpacked

1. Chrome → `chrome://extensions` → Developer mode → **Load unpacked**
2. Select `fronts/relay-extension`
3. Open a social group tab → click the Relay icon → side panel

## Architecture

| Piece | Role |
|---|---|
| `../room/clevertree-room.js` | Shared public IRC room (embed / page / sidepanel modes) |
| `sidepanel.html` + `relay-chrome.css` | Always-on **Refresh** only — gather never inside the room |
| `background.js` | Gather job state; host-tab messaging |

Embeddable web chat uses the same room component **without** Refresh.

## Design kits

Prototypes and tokens: `design/relay-ui-kit/`, `design/clevertree-kit/`.
