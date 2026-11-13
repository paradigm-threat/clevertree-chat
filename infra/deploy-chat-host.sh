#!/usr/bin/env bash
# Deploy Clevertree Chat host onto myproblem-intake and point Caddy at :8790.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KUBECONFIG="${KUBECONFIG:-$HOME/.kube/myproblem-intake.yaml}"
export KUBECONFIG
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/api" "$STAGE/clevertree_chat/demos" "$STAGE/scripts" "$STAGE/chat" "$STAGE/fronts/snippet/demo-steps" "$STAGE/fixtures/pt-review"
cp "$ROOT/api/demo.py" "$STAGE/api/"
: >"$STAGE/api/__init__.py"
cat >"$STAGE/clevertree_chat/__init__.py" <<'PY'
"""Slim chat-host package surface (Intake deploy)."""
SERVICE_ID = "clevertree-chat-ai"
PY
cp "$ROOT/clevertree_chat/wsutil.py" "$ROOT/clevertree_chat/chat_hub.py" "$ROOT/clevertree_chat/demo_fixtures.py" "$ROOT/clevertree_chat/urls.py" "$ROOT/clevertree_chat/pt_seed.py" "$STAGE/clevertree_chat/"
cp "$ROOT/clevertree_chat/demos/"*.py "$STAGE/clevertree_chat/demos/"
cp "$ROOT/scripts/chat_host.py" "$STAGE/scripts/"
cp "$ROOT/chat/index.html" "$STAGE/chat/"
cp "$ROOT/fronts/snippet/clevertree-board.js" "$ROOT/fronts/snippet/clevertree-board.css" "$ROOT/fronts/snippet/embed.html" "$STAGE/fronts/snippet/"
# Legacy widget kept in repo for reference; demos no longer mount it.
if [[ -f "$ROOT/fronts/snippet/clevertree-chat.js" ]]; then
  cp "$ROOT/fronts/snippet/clevertree-chat.js" "$ROOT/fronts/snippet/clevertree-chat.css" "$STAGE/fronts/snippet/" || true
fi
cp "$ROOT/fronts/snippet/demo-steps/"*.json "$STAGE/fronts/snippet/demo-steps/"
cp "$ROOT/fixtures/pt-review/"*.json "$STAGE/fixtures/pt-review/"
cp "$ROOT/styles.css" "$ROOT/icon-128x128.png" "$ROOT/favicon.ico" "$STAGE/"
tar -C "$STAGE" -czf /tmp/clevertree-chat-host.tgz .

kubectl -n myproblem create configmap clevertree-chat-code \
  --from-file=tree.tar.gz=/tmp/clevertree-chat-host.tgz \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f "$ROOT/infra/k8s/chat-host.yaml"
kubectl apply -f "$ROOT/infra/k8s/chat-caddy-patch.yaml"
kubectl -n myproblem rollout restart deployment/clevertree-chat deployment/intake-caddy
kubectl -n myproblem rollout status deployment/clevertree-chat --timeout=180s
kubectl -n myproblem rollout status deployment/intake-caddy --timeout=180s
echo "Smoke: https://api.clevertree.chat/chat (also https://intake.myproblem.app/chat)"
