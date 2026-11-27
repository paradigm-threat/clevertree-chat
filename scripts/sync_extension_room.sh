#!/usr/bin/env bash
# Copy fronts/room into fronts/extension/room so Load unpacked works.
# Chromium only serves files inside the extension root — ../room is blocked.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/fronts/room"
DST="$ROOT/fronts/extension/room"

mkdir -p "$DST/themes"
cp "$SRC/tokens.css" "$SRC/clevertree-room.css" "$SRC/clevertree-room.js" \
  "$SRC/context-tags.js" "$SRC/channel-route.js" "$SRC/chat-launcher.js" \
  "$SRC/clevertree-ces.js" "$SRC/channel-policy.json" \
  "$DST/"
cp -a "$SRC/themes/." "$DST/themes/"
echo "Synced $SRC → $DST"
