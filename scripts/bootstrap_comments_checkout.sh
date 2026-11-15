#!/usr/bin/env bash
# Clone or update the comments SoT into CLEVERTREE_COMMENTS_PATH.
# Prefer git clone over the GitHub Contents API (thousands of blobs).
set -euo pipefail
DEST="${1:-${CLEVERTREE_COMMENTS_PATH:-}}"
REPO="${CLEVERTREE_COMMENTS_REPO:-paradigm-threat/clevertree-chat-comments}"
BRANCH="${CLEVERTREE_COMMENTS_BRANCH:-comments}"
TOKEN="${CLEVERTREE_GITHUB_TOKEN:-${GITHUB_TOKEN:-}}"

if [[ -z "$DEST" ]]; then
  echo "usage: $0 <comments-path>" >&2
  exit 2
fi
mkdir -p "$DEST"

url="https://github.com/${REPO}.git"
if [[ -n "$TOKEN" ]]; then
  url="https://x-access-token:${TOKEN}@github.com/${REPO}.git"
fi

preserve_try() {
  if [[ -d "$DEST/pages/try" ]]; then
    cp -a "$DEST/pages/try" "$1/try.bak"
  fi
  if [[ -f "$DEST/associations.json" ]]; then
    cp -a "$DEST/associations.json" "$1/associations.json.bak"
  fi
}

restore_try() {
  if [[ -d "$1/try.bak" ]]; then
    mkdir -p "$DEST/pages"
    rm -rf "$DEST/pages/try"
    mv "$1/try.bak" "$DEST/pages/try"
  fi
  if [[ -f "$1/associations.json.bak" ]]; then
    # Keep local associations if present; merge is a later batch concern.
    if [[ ! -f "$DEST/associations.json" ]]; then
      mv "$1/associations.json.bak" "$DEST/associations.json"
    fi
  fi
}

if [[ -d "$DEST/.git" ]]; then
  git -C "$DEST" remote set-url origin "$url" 2>/dev/null || true
  git -C "$DEST" fetch --depth=1 origin "$BRANCH"
  git -C "$DEST" checkout -B "$BRANCH" "FETCH_HEAD"
else
  STAGE="$(mktemp -d)"
  trap 'rm -rf "$STAGE"' EXIT
  preserve_try "$STAGE"
  git clone --depth=1 --branch "$BRANCH" "$url" "$STAGE/repo"
  # Replace DEST contents from clone while restoring local try/ rooms.
  find "$DEST" -mindepth 1 -maxdepth 1 ! -name 'pages' -exec rm -rf {} +
  mkdir -p "$DEST"
  cp -a "$STAGE/repo/." "$DEST/"
  restore_try "$STAGE"
fi

touch "$DEST/.clevertree-full-sot" "$DEST/.clevertree-seeded"
echo "comments SoT ready at $DEST ($(du -sh "$DEST" | awk '{print $1}'))"
