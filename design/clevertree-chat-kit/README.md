# Clevertree Chat — shared room design kit

**One room. Two panes.** IRC is the conversation; SI organizes what emerges. Light is the original Living Commons theme; dark is a matching low-glare forest-neutral theme.

## Open the kit

Open `demo/index.html` in a modern browser. For reliable persistence between Options and the room, run `python3 -m http.server 8000` from this kit directory and open `http://localhost:8000/demo/`. The demo uses local sample data and needs no backend, credentials or external assets.

- Choose System (default), Light or Dark. System follows `prefers-color-scheme` live. The preview toolbar is a design lab, not shipping chrome.
- Choose Chrome side panel, bottom/left/top dock, mobile or lobby, room, SI state and connection state. Try evidence disclosure, source navigation, topic filters, SI visibility, local sending and resize handles.
- Enable Networker in the separate Extension Options page; return and choose Chrome side panel. Networker is off by default.

| Directory | Contents |
|---|---|
| demo/ | Shared room HTML/CSS/JS and Options prototype |
| tokens/ | Semantic packs: `base.css`, `light.css`, `dark.css` (+ `theme.json`, `index.css`) — swappable like IRC client themes |
| icons/brand/ | Editable SVG brand and app marks |
| icons/ui/ | 48 interface SVGs and symbol sprite |
| platform/web/ | Favicon, ICO, PNG, PWA maskable icons, manifest, Apple touch icon |
| platform/extension/ | Light/dark extension PNG sizes and manifest fragment |
| platform/ios/ | Xcode universal default/dark/tinted app icon catalog and legacy PNGs |
| platform/android/ | Density PNGs, adaptive layers, monochrome icon, night colors, Play Store PNG |
| platform/desktop/ | Desktop PNGs, Windows ICO and macOS ICNS |
| source/ | Python token and icon generators |
| docs/ | Design spec, icon integration and contrast report |
| previews/ | Rendered prototype screenshots |

## Scope

This is a design starter kit, not a deployed extension or live IRC/SI service. Sample channels, messages and batch states are illustrative; local send does not contact IRC and Networker controls do not collect data. Real topic metadata must supply canonical links; demo topics are inert labels instead of invented routes. Transport-specific Markdown/media, server validation, mirror and SI integration are implementation work. Chrome side-panel toggling and the example CleverScript contract need engineering verification. Native assets have not been compiled or store-submission-tested. Source Sans 3 / IBM Plex Serif / IBM Plex Mono are preferred, with local fallbacks; no font binaries are bundled. See `docs/contrast.md` for calculated text contrast, not full accessibility certification.
