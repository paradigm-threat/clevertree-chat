#!/usr/bin/env bash
# Live identify → resolve → submit → drain → view (+ domain scope) against host.
set -euo pipefail
BASE="${1:-https://api.clevertree.chat}"
IDENT=$(curl -fsS -X POST "$BASE/api/chat" -H 'content-type: application/json' -d '{"action":"identify"}')
V=$(python3 -c "import json,sys; print(json.load(sys.stdin)['visitor'])" <<<"$IDENT")
curl -fsS -X POST "$BASE/api/chat" -H 'content-type: application/json' \
  -d "{\"action\":\"resolve\",\"url\":\"$BASE/chat/flock-cameras\",\"visitor\":\"$V\"}" >/tmp/ct-resolve.json
TOPIC=$(python3 -c "import json; print(json.load(open('/tmp/ct-resolve.json'))['topic'])")
GUIDED=$(python3 -c "import json; print(json.load(open('/tmp/ct-resolve.json')).get('guided'))")
test "$GUIDED" = "False" || test "$GUIDED" = "false"

# Domain scope: two paths → one topic
curl -fsS -X POST "$BASE/api/chat" -H 'content-type: application/json' \
  -d "{\"action\":\"resolve\",\"url\":\"https://www.Example.com/a\",\"page_scope\":\"domain\",\"visitor\":\"$V\"}" >/tmp/ct-dom-a.json
curl -fsS -X POST "$BASE/api/chat" -H 'content-type: application/json' \
  -d "{\"action\":\"resolve\",\"url\":\"https://example.com/b\",\"page_scope\":\"domain\",\"visitor\":\"$V\"}" >/tmp/ct-dom-b.json
python3 - <<'PY'
import json
a=json.load(open("/tmp/ct-dom-a.json"))
b=json.load(open("/tmp/ct-dom-b.json"))
assert a["topic"]==b["topic"], (a["topic"], b["topic"])
assert a["normalized"].endswith("example.com/"), a["normalized"]
print("ok domain scope", a["topic"])
PY

BODY="smoke $(date -u +%Y%m%dT%H%M%SZ) privacy cameras"
curl -fsS -X POST "$BASE/api/chat" -H 'content-type: application/json' \
  -d "{\"action\":\"submit\",\"topic\":\"$TOPIC\",\"visitor\":\"$V\",\"body\":$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$BODY")}" >/tmp/ct-submit.json
# drain must not 500
curl -fsS -X POST "$BASE/api/chat" -H 'content-type: application/json' \
  -d "{\"action\":\"drain\",\"topic\":\"$TOPIC\",\"visitor\":\"$V\"}" >/tmp/ct-drain.json
python3 -c "import json; d=json.load(open('/tmp/ct-drain.json')); assert 'error' not in d, d"
sleep 2
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
# scripted actions rejected
for action in replay advance play; do
  code=$(curl -sS -o /tmp/ct-bad.json -w "%{http_code}" -X POST "$BASE/api/chat" \
    -H 'content-type: application/json' -d "{\"action\":\"$action\"}")
  test "$code" = "400"
done
echo "ok scripted rejected"
