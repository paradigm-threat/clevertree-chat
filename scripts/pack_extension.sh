#!/usr/bin/env bash
# Pack the Chromium MV3 side panel for download from clevertree.chat.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/fronts/extension"
OUT_DIR="$ROOT/downloads"
ZIP="$OUT_DIR/clevertree-chat-extension.zip"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$OUT_DIR" "$STAGE/clevertree-chat-extension"
# Ship runtime only (no README in the zip root clutter — include INSTALL.txt).
cp "$SRC/manifest.json" "$SRC/background.js" "$SRC/normalize-url.js" \
  "$SRC/sidepanel.html" "$SRC/sidepanel.css" "$SRC/sidepanel.js" \
  "$STAGE/clevertree-chat-extension/"
mkdir -p "$STAGE/clevertree-chat-extension/icons"
cp "$SRC/icons/"*.png "$STAGE/clevertree-chat-extension/icons/"
cat >"$STAGE/clevertree-chat-extension/INSTALL.txt" <<'TXT'
Clevertree Chat — browser extension (Chromium)

1. Unzip this archive.
2. Open chrome://extensions (or edge://extensions).
3. Enable Developer mode.
4. Click “Load unpacked” and select the clevertree-chat-extension folder.
5. Pin Clevertree Chat and open the side panel from the toolbar icon.

The extension talks to https://api.clevertree.chat for visitor IDs, topic IDs, and posts.
More: https://clevertree.chat/extension
TXT

rm -f "$ZIP"
(
  cd "$STAGE"
  zip -qr "$ZIP" clevertree-chat-extension
)
echo "Wrote $ZIP ($(wc -c <"$ZIP") bytes)"
unzip -l "$ZIP" | head -40
