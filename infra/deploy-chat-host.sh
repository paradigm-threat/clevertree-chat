#!/usr/bin/env bash
# Deploy Clevertree realtime AI host onto myproblem-intake (durable comments).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KUBECONFIG="${KUBECONFIG:-$HOME/.kube/myproblem-intake.yaml}"
export KUBECONFIG
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/api" "$STAGE/clevertree_chat/demos" "$STAGE/scripts" "$STAGE/chat" \
  "$STAGE/fronts/snippet" "$STAGE/fixtures/pt-review" "$STAGE/infra"
# Do not pack var/clevertree-live — Intake mounts a PVC there for durable SoT.

# Full library surface for DebateService + dulwich git fallback
cp "$ROOT/clevertree_chat/"*.py "$STAGE/clevertree_chat/"
cp "$ROOT/clevertree_chat/demos/"*.py "$STAGE/clevertree_chat/demos/" 2>/dev/null || true
: >"$STAGE/api/__init__.py"
cp "$ROOT/api/debate.py" "$STAGE/api/" 2>/dev/null || true
# Keep api/demo.py only for legacy local scripts; host no longer imports it.
cp "$ROOT/api/demo.py" "$STAGE/api/" 2>/dev/null || true

cp "$ROOT/scripts/chat_host.py" "$ROOT/scripts/seed_live_comments_from_fixtures.py" \
  "$ROOT/scripts/bootstrap_comments_checkout.sh" "$STAGE/scripts/"
chmod +x "$STAGE/scripts/bootstrap_comments_checkout.sh"
cp "$ROOT/chat/index.html" "$STAGE/chat/"
cp "$ROOT/fronts/snippet/clevertree-board.js" "$ROOT/fronts/snippet/clevertree-board.css" \
  "$ROOT/fronts/snippet/clevertree-outbox.js" \
  "$ROOT/fronts/snippet/embed.html" "$STAGE/fronts/snippet/"
cp "$ROOT/fixtures/pt-review/"*.json "$STAGE/fixtures/pt-review/"
cp "$ROOT/styles.css" "$ROOT/icon-128x128.png" "$ROOT/favicon.ico" "$ROOT/requirements.txt" "$STAGE/"
# Gauge wake/decommission scripts (default dry-run; CLEVERTREE_SPOT_WAKE gates API)
cp "$ROOT/infra/spot-wake-comments.sh" "$ROOT/infra/spot-decommission-comments.sh" "$STAGE/infra/"
chmod +x "$STAGE/infra/spot-wake-comments.sh" "$STAGE/infra/spot-decommission-comments.sh"

# Comments tree is created/seeded at container start (ConfigMap size limit).
tar -C "$STAGE" -czf /tmp/clevertree-chat-host.tgz .

kubectl -n myproblem create configmap clevertree-chat-code \
  --from-file=tree.tar.gz=/tmp/clevertree-chat-host.tgz \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f "$ROOT/infra/k8s/chat-host.yaml"
kubectl apply -f "$ROOT/infra/k8s/chat-caddy-patch.yaml"
kubectl -n myproblem rollout restart deployment/clevertree-chat deployment/intake-caddy
kubectl -n myproblem rollout status deployment/clevertree-chat --timeout=180s
kubectl -n myproblem rollout status deployment/intake-caddy --timeout=180s
echo "Smoke: https://api.clevertree.chat/chat"
