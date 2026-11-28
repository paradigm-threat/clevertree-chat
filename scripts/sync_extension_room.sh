#!/usr/bin/env bash
# Copy fronts/room into fronts/extension/room so Load unpacked works.
# Chromium only serves files inside the extension root — ../room is blocked.
# Also refreshes Networker Nextdoor gather engine from myproblem/extensions/capture when present.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/fronts/room"
DST="$ROOT/fronts/extension/room"

mkdir -p "$DST/themes"
cp "$SRC/tokens.css" "$SRC/clevertree-room.css" "$SRC/clevertree-room.js" \
  "$SRC/context-tags.js" "$SRC/channel-route.js" "$SRC/chat-launcher.js" \
  "$SRC/clevertree-ces.js" "$SRC/channel-policy.json" \
  "$SRC/media-controller.js" "$SRC/ct-builtins.js" \
  "$SRC/tracked-problems.demo.json" "$SRC/stream-playback.js" \
  "$DST/"
cp -a "$SRC/themes/." "$DST/themes/"
echo "Synced $SRC → $DST"

CAPTURE="${ROOT}/../myproblem/extensions/capture"
EXT="$ROOT/fronts/extension"
if [[ -d "$CAPTURE" ]]; then
  mkdir -p "$EXT/lib" "$EXT/data"
  cp "$CAPTURE/lib/scrub.js" "$CAPTURE/lib/topics.js" \
    "$CAPTURE/lib/external-id.js" "$CAPTURE/lib/media-idb.js" \
    "$CAPTURE/lib/social-hosts.js" \
    "$EXT/lib/"
  cp "$CAPTURE/data/"*.json "$EXT/data/"
  cp "$CAPTURE/content.js" "$EXT/content-nextdoor.js"
  echo "Synced Networker gather engine from $CAPTURE"
fi
