#!/usr/bin/env bash
# Build ios/dist/clevertree-ios-handoff.zip with (A) sources (B) docs (C) scripts separated.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IOS="${ROOT}/ios"
DIST="${IOS}/dist"
STAGING="${DIST}/staging"
ZIP="${DIST}/clevertree-ios-handoff.zip"

bash "${IOS}/scripts/sync-room-assets.sh"

rm -rf "$STAGING"
mkdir -p "$STAGING/A-sources" "$STAGING/B-docs" "$STAGING/C-scripts"

# (A) Source tree — package + app (no dist/staging recursion)
rsync -a \
  --exclude 'dist/' \
  --exclude '.build/' \
  --exclude 'DerivedData/' \
  --exclude '*.xcodeproj/' \
  --exclude 'xcuserdata/' \
  --exclude '.DS_Store' \
  "${IOS}/ClevertreeRoom" "${IOS}/ClevertreeApp" \
  "$STAGING/A-sources/"

# Also ship design AppIcon reference for Mac to drop into Assets
if [[ -d "${ROOT}/design/clevertree-chat-kit/platform/ios/AppIcon.appiconset" ]]; then
  mkdir -p "$STAGING/A-sources/design-icons"
  rsync -a \
    "${ROOT}/design/clevertree-chat-kit/platform/ios/AppIcon.appiconset/" \
    "$STAGING/A-sources/design-icons/AppIcon.appiconset/"
fi

# (B) Instructions
cp -a "${IOS}/docs/HANDOFF.md" "$STAGING/B-docs/HANDOFF.md"
cp -a "${IOS}/README.md" "$STAGING/B-docs/README.md"
if [[ -f "${ROOT}/docs/ios-room.md" ]]; then
  cp -a "${ROOT}/docs/ios-room.md" "$STAGING/B-docs/ios-room.md"
fi
if [[ -f "${ROOT}/docs/android-room.md" ]]; then
  cp -a "${ROOT}/docs/android-room.md" "$STAGING/B-docs/android-room-reference.md"
fi

# (C) Scripts
cp -a "${IOS}/scripts/sync-room-assets.sh" "$STAGING/C-scripts/"
cp -a "${IOS}/scripts/package-handoff.sh" "$STAGING/C-scripts/"
cp -a "${IOS}/scripts/refresh-artifacts.md" "$STAGING/C-scripts/" 2>/dev/null || true

cat > "$STAGING/MANIFEST.md" <<'EOF'
# Clevertree iOS handoff package

| Folder | Contents | Refresh alone? |
|---|---|---|
| **A-sources/** | `ClevertreeRoom` SPM + `ClevertreeApp` host | Yes — re-copy from `ios/` |
| **B-docs/** | `HANDOFF.md`, README, `ios-room.md` | Yes — edit docs, re-zip |
| **C-scripts/** | Asset sync + packaging scripts | Yes — edit scripts, re-zip |

Start on a Mac with **B-docs/HANDOFF.md**.

Rebuild this zip from the repo:

```bash
bash ios/scripts/package-handoff.sh
```
EOF

rm -f "$ZIP"
(
  cd "$STAGING"
  zip -r "$ZIP" . -x '*.DS_Store'
)

# Keep staging for local inspection; zip is the deliverable
BYTES="$(wc -c < "$ZIP" | tr -d ' ')"
echo "Wrote $ZIP ($BYTES bytes)"
echo "Staging tree: $STAGING"
