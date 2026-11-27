# Site chrome (portable)

`<pt-bottom-overlay>` — isolated bottom bar for Paradigm Threat (and any host that wants the same chrome).

**Order:** Return to top → Chat → AI → Play → Settings.

UI only. Hosts listen for `pt-overlay:*` events and wire TTS / Site AI / Clevertree chat.

```html
<link rel="stylesheet" href="https://clevertree.chat/fronts/site-chrome/pt-bottom-overlay.css" />
<script src="https://clevertree.chat/fronts/site-chrome/pt-bottom-overlay.js"></script>
<pt-bottom-overlay scrolled show-ai session seek-max="10" seek-value="0"></pt-bottom-overlay>
```

Chat room SoT remains [`../room/`](../room/) (`CleverTreeRoom` + launcher + thin CEs in `clevertree-ces.js`).
