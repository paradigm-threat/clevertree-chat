#!/usr/bin/env bash
# Deploy Clevertree realtime AI host onto Linode pub1 (systemd + Caddy).
#
# Rackspace Spot / kubectl is abandoned. There is no LKE kubeconfig for Intake —
# chat-host runs on the Linode VM fleet (pub1.relaygateway.net).
#
# Env overrides:
#   CLEVERTREE_CHAT_SSH       default root@pub1.relaygateway.net
#   CLEVERTREE_CHAT_SSH_KEY   default ~/.ssh/id_ed25519_relay_gateway
#   CLEVERTREE_CHAT_REMOTE    default /opt/clevertree-chat
#   CLEVERTREE_ASR_DRY_RUN    default 1 when GROQ_API_KEY unset
#   CLEVERTREE_GITHUB_TOKEN   optional; used to bootstrap comments SoT
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${CLEVERTREE_CHAT_SSH:-root@pub1.relaygateway.net}"
SSH_KEY="${CLEVERTREE_CHAT_SSH_KEY:-$HOME/.ssh/id_ed25519_relay_gateway}"
REMOTE_ROOT="${CLEVERTREE_CHAT_REMOTE:-/opt/clevertree-chat}"
SSH=(ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new)
SCP=(scp -o BatchMode=yes -o StrictHostKeyChecking=accept-new)
if [[ -f "$SSH_KEY" ]]; then
  SSH+=(-i "$SSH_KEY")
  SCP+=(-i "$SSH_KEY")
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/api" "$STAGE/clevertree_chat/demos" "$STAGE/scripts" "$STAGE/chat" \
  "$STAGE/fronts/snippet" "$STAGE/fronts/room" "$STAGE/fixtures/pt-review" "$STAGE/infra/linode"
# Do not pack var/clevertree-live — durable SoT lives on the Linode host disk.

cp "$ROOT/clevertree_chat/"*.py "$STAGE/clevertree_chat/"
cp "$ROOT/clevertree_chat/demos/"*.py "$STAGE/clevertree_chat/demos/" 2>/dev/null || true
: >"$STAGE/api/__init__.py"
cp "$ROOT/api/debate.py" "$STAGE/api/" 2>/dev/null || true
cp "$ROOT/api/demo.py" "$STAGE/api/" 2>/dev/null || true

cp "$ROOT/scripts/chat_host.py" "$ROOT/scripts/seed_live_comments_from_fixtures.py" \
  "$ROOT/scripts/bootstrap_comments_checkout.sh" "$STAGE/scripts/"
chmod +x "$STAGE/scripts/bootstrap_comments_checkout.sh"
cp "$ROOT/chat/index.html" "$STAGE/chat/"
cp "$ROOT/fronts/snippet/clevertree-board.js" "$ROOT/fronts/snippet/clevertree-board.css" \
  "$ROOT/fronts/snippet/clevertree-outbox.js" \
  "$ROOT/fronts/snippet/embed.html" "$STAGE/fronts/snippet/"
cp "$ROOT/fronts/room/"*.js "$ROOT/fronts/room/"*.css \
  "$ROOT/fronts/room/embed.html" "$ROOT/fronts/room/channel-policy.json" \
  "$STAGE/fronts/room/" 2>/dev/null || true
mkdir -p "$STAGE/fronts/room/themes"
cp -a "$ROOT/fronts/room/themes/." "$STAGE/fronts/room/themes/" 2>/dev/null || true
mkdir -p "$STAGE/fixtures"
cp "$ROOT/fixtures/pt-topics.json" "$STAGE/fixtures/" 2>/dev/null || true
cp "$ROOT/schemas/chat-topics.v1.json" "$STAGE/" 2>/dev/null || true
cp "$ROOT/fixtures/pt-review/"*.json "$STAGE/fixtures/pt-review/"
cp "$ROOT/styles.css" "$ROOT/icon-128x128.png" "$ROOT/favicon.ico" "$ROOT/requirements.txt" "$STAGE/"
# Historical Spot scripts stay in tree for reference; not used by product.
cp "$ROOT/infra/spot-wake-comments.sh" "$ROOT/infra/spot-decommission-comments.sh" "$STAGE/infra/" 2>/dev/null || true
cp "$ROOT/infra/linode/"* "$STAGE/infra/linode/"

TGZ="/tmp/clevertree-chat-host.tgz"
tar -C "$STAGE" -czf "$TGZ" .

echo "Deploying to Linode ${HOST}:${REMOTE_ROOT} …"
"${SCP[@]}" "$TGZ" "${HOST}:/tmp/clevertree-chat-host.tgz"
"${SCP[@]}" "$ROOT/infra/linode/clevertree-chat.service" \
  "$ROOT/infra/linode/Caddyfile.clevertree" \
  "${HOST}:/tmp/"

# Resolve token for private comments bootstrap (optional).
GH_TOKEN="${CLEVERTREE_GITHUB_TOKEN:-${GITHUB_TOKEN:-${GH_TOKEN:-}}}"
if [[ -z "$GH_TOKEN" ]] && command -v gh >/dev/null 2>&1; then
  GH_TOKEN="$(gh auth token 2>/dev/null || true)"
fi

ASR_DRY="${CLEVERTREE_ASR_DRY_RUN:-}"
if [[ -z "$ASR_DRY" ]]; then
  if [[ -n "${GROQ_API_KEY:-}" ]]; then
    ASR_DRY=0
  else
    ASR_DRY=1
  fi
fi

"${SSH[@]}" "$HOST" bash -s -- "$REMOTE_ROOT" "$ASR_DRY" <<'REMOTE'
set -euo pipefail
REMOTE_ROOT="$1"
ASR_DRY="$2"
mkdir -p "$REMOTE_ROOT/app" "$REMOTE_ROOT/var/clevertree-live/comments" \
  "$REMOTE_ROOT/var/clevertree-live/auth" "$REMOTE_ROOT/caddy" "$REMOTE_ROOT/logs"

# Extract code into app/ (preserve durable var/)
rm -rf "$REMOTE_ROOT/app"
mkdir -p "$REMOTE_ROOT/app"
tar -xzf /tmp/clevertree-chat-host.tgz -C "$REMOTE_ROOT/app"
rm -f /tmp/clevertree-chat-host.tgz

# Python venv + deps (ensure venv package on Debian/Ubuntu)
if ! python3 -c 'import ensurepip' 2>/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq python3-venv python3-pip
fi
if [[ ! -x "$REMOTE_ROOT/venv/bin/python3" ]]; then
  python3 -m venv "$REMOTE_ROOT/venv"
fi
"$REMOTE_ROOT/venv/bin/pip" install --upgrade -q pip
"$REMOTE_ROOT/venv/bin/pip" install -q -r "$REMOTE_ROOT/app/requirements.txt"

# Env file (do not clobber existing secrets)
ENV_FILE="$REMOTE_ROOT/chat-host.env"
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$REMOTE_ROOT/app/infra/linode/chat-host.env.example" "$ENV_FILE"
fi
# Ensure ASR dry-run / channel ASR flags for this cutover
grep -q '^CLEVERTREE_ASR_DRY_RUN=' "$ENV_FILE" \
  && sed -i "s/^CLEVERTREE_ASR_DRY_RUN=.*/CLEVERTREE_ASR_DRY_RUN=${ASR_DRY}/" "$ENV_FILE" \
  || echo "CLEVERTREE_ASR_DRY_RUN=${ASR_DRY}" >>"$ENV_FILE"
grep -q '^CLEVERTREE_CHANNEL_ASR=' "$ENV_FILE" \
  || echo "CLEVERTREE_CHANNEL_ASR=1" >>"$ENV_FILE"
grep -q '^CLEVERTREE_CHANNEL_MEDIA_REVIEW=' "$ENV_FILE" \
  || echo "CLEVERTREE_CHANNEL_MEDIA_REVIEW=1" >>"$ENV_FILE"
grep -q '^BUNNY_STORAGE_ZONE=' "$ENV_FILE" \
  || echo "BUNNY_STORAGE_ZONE=myproblem-stills" >>"$ENV_FILE"
grep -q '^BUNNY_STORAGE_HOST=' "$ENV_FILE" \
  || echo "BUNNY_STORAGE_HOST=storage.bunnycdn.com" >>"$ENV_FILE"
grep -q '^BUNNY_CDN_BASE=' "$ENV_FILE" \
  || echo "BUNNY_CDN_BASE=https://myproblem-stills.b-cdn.net" >>"$ENV_FILE"
grep -q '^CLEVERTREE_LIVE_ROOT=' "$ENV_FILE" \
  || echo "CLEVERTREE_LIVE_ROOT=$REMOTE_ROOT/var/clevertree-live" >>"$ENV_FILE"
grep -q '^CLEVERTREE_COMMENTS_PATH=' "$ENV_FILE" \
  || echo "CLEVERTREE_COMMENTS_PATH=$REMOTE_ROOT/var/clevertree-live/comments" >>"$ENV_FILE"
grep -q '^CLEVERTREE_AUTH_PATH=' "$ENV_FILE" \
  || echo "CLEVERTREE_AUTH_PATH=$REMOTE_ROOT/var/clevertree-live/auth" >>"$ENV_FILE"

# Bootstrap comments SoT when marker missing
COMMENTS="$REMOTE_ROOT/var/clevertree-live/comments"
if [[ ! -f "$COMMENTS/.clevertree-full-sot" ]]; then
  if [[ -n "${CLEVERTREE_GITHUB_TOKEN:-}" ]]; then
    export CLEVERTREE_GITHUB_TOKEN
    bash "$REMOTE_ROOT/app/scripts/bootstrap_comments_checkout.sh" "$COMMENTS" || true
  else
    echo "WARN: no CLEVERTREE_GITHUB_TOKEN — seeding light fixtures for comments SoT"
    "$REMOTE_ROOT/venv/bin/python3" "$REMOTE_ROOT/app/scripts/seed_live_comments_from_fixtures.py" "$COMMENTS" || true
  fi
fi

# systemd unit
install -m 0644 /tmp/clevertree-chat.service /etc/systemd/system/clevertree-chat.service
rm -f /tmp/clevertree-chat.service
systemctl daemon-reload
systemctl enable clevertree-chat.service
systemctl restart clevertree-chat.service

# Caddy site blocks
install -m 0644 /tmp/Caddyfile.clevertree "$REMOTE_ROOT/caddy/Caddyfile.clevertree"
rm -f /tmp/Caddyfile.clevertree
IMPORT_LINE="import ${REMOTE_ROOT}/caddy/Caddyfile.clevertree"
if ! grep -qF "$IMPORT_LINE" /etc/caddy/Caddyfile; then
  printf '\n# Clevertree chat-host (Linode)\n%s\n' "$IMPORT_LINE" >>/etc/caddy/Caddyfile
fi
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy

# Wait for readiness
for i in $(seq 1 30); do
  if curl -sf --max-time 2 "http://127.0.0.1:8790/chat" >/dev/null; then
    echo "chat-host ready on :8790"
    systemctl is-active clevertree-chat.service
    exit 0
  fi
  sleep 2
done
echo "chat-host failed to become ready" >&2
journalctl -u clevertree-chat.service -n 80 --no-pager >&2 || true
exit 1
REMOTE

# Pass token via scp'd fragment (avoid argv exposure), then bootstrap SoT if needed.
if [[ -n "$GH_TOKEN" ]]; then
  umask 077
  TOKEN_FRAG="$(mktemp)"
  printf 'CLEVERTREE_GITHUB_TOKEN=%s\n' "$GH_TOKEN" >"$TOKEN_FRAG"
  "${SCP[@]}" "$TOKEN_FRAG" "${HOST}:/tmp/clevertree-chat-token.env"
  rm -f "$TOKEN_FRAG"
  "${SSH[@]}" "$HOST" bash -s -- "$REMOTE_ROOT" <<'REMOTE_TOKEN'
set -euo pipefail
REMOTE_ROOT="$1"
ENV_FILE="$REMOTE_ROOT/chat-host.env"
FRAG=/tmp/clevertree-chat-token.env
TOKEN_LINE="$(cat "$FRAG")"
rm -f "$FRAG"
grep -q '^CLEVERTREE_GITHUB_TOKEN=' "$ENV_FILE" \
  && sed -i "s|^CLEVERTREE_GITHUB_TOKEN=.*|${TOKEN_LINE}|" "$ENV_FILE" \
  || echo "$TOKEN_LINE" >>"$ENV_FILE"
chmod 600 "$ENV_FILE"
REMOTE_TOKEN
fi

"${SSH[@]}" "$HOST" bash -s -- "$REMOTE_ROOT" <<'REMOTE2'
set -euo pipefail
REMOTE_ROOT="$1"
# shellcheck disable=SC1090
set -a; source "$REMOTE_ROOT/chat-host.env"; set +a
COMMENTS="$REMOTE_ROOT/var/clevertree-live/comments"
if [[ ! -f "$COMMENTS/.clevertree-full-sot" && -n "${CLEVERTREE_GITHUB_TOKEN:-}" ]]; then
  bash "$REMOTE_ROOT/app/scripts/bootstrap_comments_checkout.sh" "$COMMENTS" || true
  systemctl restart clevertree-chat.service
  sleep 3
fi
curl -sf --max-time 5 "http://127.0.0.1:8790/chat" >/dev/null
echo "Local smoke OK: http://127.0.0.1:8790/chat"
REMOTE2

echo "Smoke: https://api.clevertree.chat/chat  (after DNS → pub1)"
echo "Host: $HOST  root: $REMOTE_ROOT  (no Rackspace kubeconfig)"
