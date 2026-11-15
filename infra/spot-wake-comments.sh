#!/bin/sh
# Comments batch GPU wake. Default: dry-run echo only (no network).
# Set CLEVERTREE_SPOT_WAKE=1 and RACKSPACE_SPOT_TOKEN to attempt a real create.
# Org paradigmthreat. Region us-west-sjc-1. About $0.15/hr.
# Class gpu.vs2.xlargeplusplus-sjc.
set -eu
ORG="${CLEVERTREE_SPOT_ORG:-paradigmthreat}"
REGION="${CLEVERTREE_SPOT_REGION:-us-west-sjc-1}"
NAME="${CLEVERTREE_SPOT_CLOUDSPACE:-clevertree-chat-comments}"
CLASS="${CLEVERTREE_SPOT_CLASS:-gpu.vs2.xlargeplusplus-sjc}"
API="${CLEVERTREE_SPOT_API:-https://spot.rackspace.com}"
WAKE="${CLEVERTREE_SPOT_WAKE:-}"
TOKEN="${RACKSPACE_SPOT_TOKEN:-${CLEVERTREE_SPOT_TOKEN:-}}"

echo "createCloudspace name=${NAME} org=${ORG} region=${REGION}"
echo "createSpotNodePool name=${NAME} class=${CLASS} region=${REGION} price=\$0.15/hr"

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

# Best-effort Spot HCP-style create. Soft-fail so drain never crashes.
if command -v curl >/dev/null 2>&1; then
  code="$(curl -sS -o /tmp/clevertree-spot-wake.json -w '%{http_code}' \
    -X POST "${API}/v2/organizations/${ORG}/cloudspaces" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${NAME}\",\"region\":\"${REGION}\",\"kubernetesVersion\":\"1.33.0\",\"cni\":\"calico\",\"deploymentType\":\"gen2\"}" \
    || true)"
  echo "API_HTTP=${code:-000}"
  if [ "${code:-000}" = "200" ] || [ "${code:-000}" = "201" ] || [ "${code:-000}" = "409" ]; then
    curl -sS -o /tmp/clevertree-spot-pool.json -w '' \
      -X POST "${API}/v2/organizations/${ORG}/cloudspaces/${NAME}/spotnodepools" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{\"name\":\"${NAME}\",\"serverClass\":\"${CLASS}\",\"desired\":1,\"bidPrice\":\"0.15\"}" \
      || true
    echo "API_CALLED=1"
  else
    echo "API_CALLED=0"
    echo "# spot create soft-fail http ${code:-000}"
  fi
else
  echo "API_CALLED=0"
  echo "# curl missing; cannot call Spot API"
fi
