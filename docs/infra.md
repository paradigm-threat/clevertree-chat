# Infrastructure

The front of the product is the **live gatherer**. While someone writes, it may show a suggested existing category. Submit **enqueues** the body (plus recommendations) on an ephemeral PVC queue — it does not permanently file into the comments SoT. The author does not wait on the batch, and the live path does not boot heavy AI. Policy: [`intake-queue.md`](intake-queue.md) · phases: [`batch-phases.md`](batch-phases.md). Phase 1: **Cursor** drains the shared queue and is the SoT writer; Phase 2: **CPU + API providers** (Groq / Bedrock / peers).

**Chat host (realtime AI server):** containable UI, `/api/chat`, WebSocket fan-out, and batch drain on Linode **pub1** (`scripts/chat_host.py`, see [`chat-host.md`](chat-host.md)). Deploy: `bash infra/deploy-chat-host.sh` (systemd + Caddy; see [`infra/linode/`](../infra/linode/)). Optional **IRC bridge** — [`irc-backbone.md`](irc-backbone.md). Public hostname **`https://api.clevertree.chat`** (DNS A → pub1). Rackspace Spot / kubectl Intake path is abandoned.

The back is the **batch deep SI** — sole writer of permanent debate content under `pages/…` on the comments branch. It consumes the intake queue (and any dirty job markers), files accepted posts, drops rejects so spam never lands in git, then runs associations / fetch / spam-court on filed content. Heavy think uses **metered providers** with rules + KB/context — **no Spot GPU wake** ([MyProblem `providers-ai.md`](../../myproblem/docs/providers-ai.md)).

Cleverchat is an independent product repo. Other apps (including MyProblem) may mount it; they depend on Cleverchat, not the reverse. The debate is never written into the host page repo. `page.json` can pin a canonical URL or a content commit and flag the thesis stale. Nothing is written back to the host.

## Spot GPU wake — abandoned

Historical scripts `infra/spot-wake-comments.sh` / `infra/spot-decommission-comments.sh` targeted SJC A30. **Do not use for product.** Leave `CLEVERTREE_SPOT_WAKE=0`. **Batch SI = Groq / Bedrock / peers only** (Phase 1 Cursor drain; Phase 2 automated provider drain). No GPU batch servers. Log and publicize `$/request` when provider calls land.

Curator commits use the service id `clevertree-chat-ai`. A person's name is never the author of a rewritten room. Each batch commit can be published to every local remote that serves the comments branch. The index and the files it points at are part of that commit.

## Any URL

A browser extension and an HTML snippet are small fronts in `fronts/`. They normalize the tab URL (public suffix first, campaign tags dropped, `id` / `p` / `story` kept) and stay empty until someone types. The extension uses **domain-level** page scope (one debate per site). Product rules for provisional pages, batch canonicalization of mirrors, and topic vs person homes are locked in [`url-pages-and-associations.md`](url-pages-and-associations.md) and [`person-space.md`](person-space.md); helpers in `associations.py` / `spam_court.py`. The **browser extension** is an MV3 side panel in [`fronts/extension/`](../fronts/extension/). The Android voice component in `android/` sends transcript text to the same filing API and asks for audio of the section. It does not write git. No APK is built here.

## Phase 2 gauge, still dry

The always-on path is this site's API, `POST /api/debate` and `GET /api/debate`. It records submit latency (gauge); after queue cutover that latency is enqueue time, not SoT write time.

The batch path is the curator (heuristic today; providers when wired). Drain consumes the intake queue, then runs the phase-1 engine plus `batch_hooks` on **accepted** content.

Owner answers on IRC (`!answer …` or `si answer: …`) fold into `owner-answers.md` and `rules.md`.

Full comments SoT: mount via PVC (or `scripts/bootstrap_comments_checkout.sh`). Marker `.clevertree-full-sot` skips fixture seed. Set `CLEVERTREE_SEED_FIXTURES=0` on Intake.

## Egress / anti-bot probe

Intake can fetch public URLs when `CLEVERTREE_FETCH=1`. Soft-fail on blocks — cite the URL anyway; never invent page bodies.

Ops sample: `python3 -c 'from clevertree_chat.fetch import probe_egress; import json; print(json.dumps(probe_egress(), indent=2))'` inside the chat pod.

Sampled 2026-11-15: `example.com`, `api.github.com`, RFC editor, httpbin, Wikipedia **OK**; `congress.gov` **403 blocked**. Expand the probe list in `clevertree_chat/fetch.py` as new hosts matter for suggested counters.

## Mesh persistence

Catalog repo `clevertree-chat-comments` (`publish_branch: comments`, forge GitLab `clevertree/clevertree-chat-comments`). Host env `CLEVERTREE_PUBLISH_REMOTES=git://iad1.relaygateway.net:9418/clevertree-chat-comments.git` pushes the comments tip after persist. Peers (hkg1/ord1) accept peer-notify when authorized from catalog.
