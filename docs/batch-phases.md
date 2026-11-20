# Batch phases (Clevertree)

Relay-wide product SoT: [`../../myproblem/docs/batch-phases.md`](../../myproblem/docs/batch-phases.md).

**Tip lens:** a Clevertree tip is a **topic** (forum room). It may bind to a MyProblem/QuizGate tip UUID (or external-id translation) without minting a new UUID — one Relay unit doubles as chat room + problem/user.

Clevertree job kinds (IRC logs, enqueue bodies, spam ascertain, key mint) share the **one batch queue** with MyProblem and QuizGate. Phase 1: **Cursor** inventories all topics then drains ([`cursor-batch-playbook.md`](../../myproblem/docs/cursor-batch-playbook.md)). Phase 2: Spot. Bunny when this remote’s upload-source config says so.

**IRC log jobs:** host caches all rooms ephemerally; `kind: irc_log` segments land under `var/clevertree-live/queue/irc_log/`. Accept → `pages/<page>/chat/` minimized transcripts (short ids), gated by `chat_store` in `rules.md` (default `full`). See [`irc-backbone.md`](irc-backbone.md) · [`intake-queue.md`](intake-queue.md).
