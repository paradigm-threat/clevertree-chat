#!/bin/sh
# Shutdown after comments queue drain. Default: dry-run echo only.
# With CLEVERTREE_SPOT_WAKE=1 and RACKSPACE_SPOT_TOKEN, attempt real delete.
# A pool left at desired=0 is not the idle state.
set -eu
ORG="${CLEVERTREE_SPOT_ORG:-paradigmthreat}"
REGION="${CLEVERTREE_SPOT_REGION:-us-west-sjc-1}"
NAME="${CLEVERTREE_SPOT_CLOUDSPACE:-clevertree-chat-comments}"
API="${CLEVERTREE_SPOT_API:-https://spot.rackspace.com}"
WAKE="${CLEVERTREE_SPOT_WAKE:-}"
TOKEN="${RACKSPACE_SPOT_TOKEN:-${CLEVERTREE_SPOT_TOKEN:-}}"

echo "deleteSpotNodePool name=${NAME} org=${ORG} region=${REGION}"
echo "deleteCloudspace name=${NAME} org=${ORG} region=${REGION}"

case "$(printf '%s' "$WAKE" | tr 'A-Z' 'a-z')" in
  1|true|yes|on) ;;
  *)
    echo "WAKE_REQUESTED=0"
    echo "API_CALLED=0"
    exit 0
    ;;
esac

echo "WAKE_REQUESTED=1"
if [ -z "$TOKEN" ]; then
  echo "API_CALLED=0"
  echo "# no RACKSPACE_SPOT_TOKEN; dry-run only"
  exit 0
fi

if command -v curl >/dev/null 2>&1; then
  curl -sS -o /tmp/clevertree-spot-del-pool.json -w '' \
    -X DELETE "${API}/v2/organizations/${ORG}/cloudspaces/${NAME}/spotnodepools/${NAME}" \
    -H "Authorization: Bearer ${TOKEN}" || true
  code="$(curl -sS -o /tmp/clevertree-spot-del-cs.json -w '%{http_code}' \
    -X DELETE "${API}/v2/organizations/${ORG}/cloudspaces/${NAME}" \
    -H "Authorization: Bearer ${TOKEN}" || true)"
  echo "API_HTTP=${code:-000}"
  echo "API_CALLED=1"
else
  echo "API_CALLED=0"
  echo "# curl missing; cannot call Spot API"
fi
