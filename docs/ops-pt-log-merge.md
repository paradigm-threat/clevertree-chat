# Ops: merge legacy `#pt-*` logs into `#pt`

Run on **pub1** after shipping topics.json + bridge join of `#pt` / `#web`.

```bash
# From clevertree-chat checkout with topics index:
python3 scripts/consolidate_pt_channels.py \
  --log-dir /opt/relay/chat/logs \
  --topics /path/to/paradigm-threat-files/chat/topics.json \
  --write /tmp/pt-merged.jsonl

# Review unmapped slug report, curate chat/topics.json, re-run if needed.
# Install merged history into #pt log dir; leave #pt-* read-only, then remove when empty.
# Keep #logs-pt.
```

Env: `CLEVERTREE_IRC_CONSOLIDATE_PT=1` (default). Bridge auto-joins `#pt`, `#web`, craft rooms.
