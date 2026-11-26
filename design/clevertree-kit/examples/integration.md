# Embed and side-panel examples

Open `host-embed.html` locally for an iframe demonstration.

Production iframe (replace the placeholder domain with your deployment):

```html
<iframe title="CleverTree public chat"
  src="https://chat.example.com/room/ga-savannah-cat-rescue?surface=embed"
  style="width:100%;height:700px;border:0"
  allow="microphone; camera"></iframe>
```

Grant microphone/camera permissions only if those features are enabled and the host trusts the exact origin. Configure Content-Security-Policy frame-ancestors and Permissions-Policy at the actual deployment. The production route and domain above are illustrative only.

Chrome extension: use a Manifest V3 side panel with a packaged HTML entry that imports the shared room component. Example manifest fragment (not a complete extension):

```json
{
  "manifest_version": 3,
  "name": "CleverTree Chat",
  "version": "0.1.0",
  "permissions": ["sidePanel"],
  "side_panel": {"default_path": "sidepanel.html"}
}
```

Package the JS/CSS locally for extension CSP compliance; the standalone prototype uses inline JS and is not a drop-in extension build. The side panel passes its collection context into the room component; it must not create another chat bus or expose Networker controls inside the room. Use `../prototype/index.html?surface=side` for a local visual preview.
