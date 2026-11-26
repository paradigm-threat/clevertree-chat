# Relay UI kit
MyProblem Networker · CleverTree · v1.0

**Simple Max:** the room is the interface. Gather in the host page; chat stays open.

## Start here
Open `prototype/index.html` in Chrome (no server or build needed). The preview controls outside the simulated browser switch between the four designed room states. At narrow viewport widths the host preview is hidden. For direct links append `?state=stale`, `?state=gathering`, `?state=tracked`, or `?state=ai`. The gathering preset is a static mid-gather preview; click Refresh from the stale state to run the timed simulation.

Try typing a draft, pressing Refresh, sending a message during gathering, tracking the current group, and toggling AI. Cancellation lives on the simulated host overlay. The sample room is fictional, with no external requests or real collection actions.

## Contents
- `prototype/index.html` — self-contained interactive reference.
- `prototype/source/` — equivalent HTML, CSS and JavaScript separated for editing.
- `screens/` — seven PNG exports: paired states, four individual 400 px screens, and full browser context.
- `tokens/` — CSS custom properties and JSON equivalents for implementation.
- `assets/` — SVG icon sprite and provisional Relay tree mark (editable vector source).
- `specs/components.md` — layout, component map, interaction contract and responsive rules.
- `specs/copy.md` — states, public notice, empty room and edge-case copy.
- `specs/mv3-handoff.md` — proposed integration architecture and event contracts.
- `specs/qa.md` — manual verification and acceptance criteria.

## Scope and limitations
This is a UI design and frontend demonstration, not a loadable MV3 extension, Figma library, or production implementation. IRC status, roster, AI messages, gather navigation, tracking and persistence are mocked; media playback, real Markdown rendering, recording, uploading and private AI are not implemented. Source files reproduce the existing demonstration, while the specs and token files describe the intended production behavior, including additional states not wired in the demo. Lato is the preferred font, with system fallbacks; no font binaries included. Colors and the provisional tree mark are design proposals, not verified brand assets. All names, messages, sources and group counts are illustrative.
