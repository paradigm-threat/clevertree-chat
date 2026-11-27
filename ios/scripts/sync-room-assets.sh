#!/usr/bin/env bash
# Sync fronts/room → ClevertreeRoom SPM resources (mirrors Android syncRoomAssets).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="${ROOT}/fronts/room"
DEST="${ROOT}/ios/ClevertreeRoom/Sources/ClevertreeRoom/Resources/clevertree-room"

if [[ ! -d "$SRC" ]]; then
  echo "error: missing room fronts at $SRC" >&2
  exit 1
fi

rm -rf "$DEST"
mkdir -p "$DEST/themes"

FILES=(
  live.html
  embed.html
  tokens.css
  clevertree-room.css
  clevertree-room.js
  context-tags.js
  channel-route.js
  channel-policy.json
  chat-launcher.js
  clevertree-ces.js
  media-controller.js
  ct-builtins.js
)

for f in "${FILES[@]}"; do
  if [[ -f "$SRC/$f" ]]; then
    cp -a "$SRC/$f" "$DEST/$f"
  else
    echo "warn: missing $SRC/$f" >&2
  fi
done

if [[ -d "$SRC/themes" ]]; then
  cp -a "$SRC/themes/." "$DEST/themes/"
fi

COUNT="$(find "$DEST" -type f | wc -l | tr -d ' ')"
echo "Synced fronts/room → $DEST ($COUNT files)"
find "$DEST" -type f | sort | sed 's|^|  |'
