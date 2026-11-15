#!/usr/bin/env bash
# Live identify → resolve → submit → view smoke against api.clevertree.chat
set -euo pipefail
BASE="${1:-https://api.clevertree.chat}"
IDENT=$(curl -fsS -X POST "$BASE/api/chat" -H 'content-type: application/json' -d '{"action":"identify"}')
V=$(python3 -c "import json,sys; print(json.load(sys.stdin)['visitor'])" <<<"$IDENT")
curl -fsS -X POST "$BASE/api/chat" -H 'content-type: application/json' \
  -d "{\"action\":\"resolve\",\"url\":\"$BASE/chat/flock-cameras\",\"visitor\":\"$V\"}" >/tmp/ct-resolve.json
TOPIC=$(python3 -c "import json; print(json.load(open('/tmp/ct-resolve.json'))['topic'])")
BODY="smoke $(date -u +%Y%m%dT%H%M%SZ)"
curl -fsS -X POST "$BASE/api/chat" -H 'content-type: application/json' \
  -d "{\"action\":\"submit\",\"topic\":\"$TOPIC\",\"visitor\":\"$V\",\"body\":$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$BODY")}" >/tmp/ct-submit.json
sleep 3
curl -fsS -X POST "$BASE/api/chat" -H 'content-type: application/json' \
  -d "{\"action\":\"view\",\"topic\":\"$TOPIC\",\"visitor\":\"$V\"}" >/tmp/ct-view.json
python3 - <<'PY'
import json
v=json.load(open("/tmp/ct-view.json"))
act=v.get("activity") or []
assert v.get("guided") is False
assert act, "expected activity after submit"
print("ok", "topic activity", len(act), "guided", v.get("guided"))
PY
