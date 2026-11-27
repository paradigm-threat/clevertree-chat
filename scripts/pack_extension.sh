#!/usr/bin/env bash
# Pack the Chromium MV3 side panel for download from clevertree.chat.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/fronts/extension"
OUT_DIR="$ROOT/downloads"
ZIP="$OUT_DIR/clevertree-chat-extension.zip"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# Keep Load unpacked + zip in sync (room must live under extension root).
bash "$ROOT/scripts/sync_extension_room.sh"

mkdir -p "$OUT_DIR" "$STAGE/clevertree-chat-extension/icons"
cp "$SRC/manifest.json" "$SRC/background.js" \
  "$SRC/sidepanel.html" "$SRC/sidepanel.css" "$SRC/sidepanel.js" \
  "$SRC/options.html" "$SRC/options.js" "$SRC/inject-id.js" \
  "$STAGE/clevertree-chat-extension/"
if [[ -f "$SRC/normalize-url.js" ]]; then
  cp "$SRC/normalize-url.js" "$STAGE/clevertree-chat-extension/"
fi
cp "$SRC/icons/"*.png "$STAGE/clevertree-chat-extension/icons/"
# Prefer design-kit light toolbar icons when present
KIT_ICONS="$ROOT/design/clevertree-chat-kit/platform/extension/icons/light"
if [[ -d "$KIT_ICONS" ]]; then
  for sz in 16 32 48 128; do
    if [[ -f "$KIT_ICONS/icon-${sz}.png" ]]; then
      cp "$KIT_ICONS/icon-${sz}.png" "$STAGE/clevertree-chat-extension/icons/icon${sz}.png"
    fi
  done
fi
cp -a "$SRC/room" "$STAGE/clevertree-chat-extension/"

cat >"$STAGE/clevertree-chat-extension/INSTALL.txt" <<'TXT'
Clevertree Chat — browser extension (Chromium)

1. Unzip this archive.
2. Open chrome://extensions (or edge://extensions).
3. Enable Developer mode.
4. Click “Load unpacked” and select the clevertree-chat-extension folder.
5. Pin Clevertree Chat and open the side panel from the toolbar icon.

Works on any website (shared #web IRC room). Product sites map to their channel.
Networker tools: extension Options (off by default).
API: https://api.clevertree.chat
More: https://clevertree.chat/extension
TXT

rm -f "$ZIP"
(
  cd "$STAGE"
  zip -qr "$ZIP" clevertree-chat-extension
)
echo "Wrote $ZIP ($(wc -c <"$ZIP") bytes)"
unzip -l "$ZIP" | head -50
