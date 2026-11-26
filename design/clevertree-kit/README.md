# CleverTree Chat — full UI design kit

One collection. One public IRC room. Shared findings, optional AI panel.

## Start here

Open `prototype/index.html` in a browser. No build, dependencies, credentials or network service required. Resize the browser to 360–420px for the embed. For a realistic iframe layout open `examples/host-embed.html`.

- `frames/`: high-fidelity PNG views and overview.
- `prototype/`: self-contained HTML/CSS/JS with local demo states.
- `design-system/`: portable JSON tokens, CSS variables, component and copy specs.
- `handoff/`: product architecture, interaction requirements, state model and QA checklist.
- `examples/`: illustrative iframe and Chrome side-panel wiring.

## Preview states

Append a query string to `prototype/index.html`:

| State | Query |
|---|---|
| Desktop, hidden AI, untracked | `?tracked=0` |
| Desktop, open AI, cleared image, playing audio | `?ai=1&tracked=1&image=cleared&playing=1` |
| Embed, top of conversation | `?surface=embed&tracked=0&scroll=top` |
| Chrome side panel, tracked, playing video | `?surface=side&tracked=1&media=video&playing=1` |
| Public send confirmation | `?surface=embed&tracked=1&confirm=1` |
| Narrow AI overlay | `?surface=embed&tracked=1&ai=1` |
| Empty channel | `?empty=1` |
| Covered image | `?image=covered&scroll=top` |
| Cleared image | `?image=cleared&scroll=top` |

## Scope

This is a design/prototyping kit, not a production chat server or an installable extension. All messages, connection status, findings, media illustration and playback timing are fictional/simulated. Recording, uploads, actual playback, IRC, safety scrubbing, durable Git writes and identity across websites require production integration. Local storage is used for demo tracking and A/V trust when allowed. The prototype confirms every send; recommended production behavior is first ordinary text send and every media/attachment send. The sample does not implement a full Markdown parser, real status transitions or panel animation. No fonts are bundled; Lato and IBM Plex Mono are preferred with system fallbacks.

No Refresh, Gather, Collect or Automate commands appear on any room surface. These belong exclusively to Networker.
