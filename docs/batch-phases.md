# Batch phases (Clevertree)

Relay-wide product SoT: [`../../myproblem/docs/batch-phases.md`](../../myproblem/docs/batch-phases.md) — **same SI procedure** as MyProblem and QuizGate (drain → providers → commit queue → merge phase → remotes). Phase 1 Cursor / Phase 2 CPU + API providers only change the runner. AI: [`../../myproblem/docs/providers-ai.md`](../../myproblem/docs/providers-ai.md).

**Tip lens:** a Clevertree tip is a **topic** / forum room on the comments SoT. It may bind to a MyProblem or QuizGate tip UUID (or an external-id translation) without minting another UUID.

**Identity:** visitors are **anonymous by default** (UUID → short id). They may set a **display name** and appear as public as they choose; standing files still avoid raw PII. Auth credentials stay off the comments branch ([`auth.md`](auth.md)).

**Jobs:** enqueue body filing, IRC log batches, spam ascertain, key mint/rename — kinds on the **shared** queue. Playbook: [`../../myproblem/docs/cursor-batch-playbook.md`](../../myproblem/docs/cursor-batch-playbook.md). Every job is a potential tip/room create or update. Shared SI tools (image analysis/generation, transcription, TTS, web search, KB) when rules allow. Bunny when this remote’s upload-source says so.

**IRC logs:** ephemeral host cache → `kind: irc_log` → merge may store minimized `pages/<page>/chat/` transcripts unless `chat_store: never`. See [`irc-backbone.md`](irc-backbone.md) · [`intake-queue.md`](intake-queue.md).
