# Infrastructure

The front of the product is the live path. While someone writes, it may show a suggested existing category. That suggestion does not file the post. The author does not wait on the batch, and the live path does not boot a GPU.

**Chat host (realtime AI server):** the containable UI, durable `/api/chat`, WebSocket fan-out, and always-on heuristic drain run on the chat host (`scripts/chat_host.py`, see [`chat-host.md`](chat-host.md)). No scripted peers. Optional **IRC bridge** mirrors Ergo (`flashbackrepository.org:6697`) — see [`irc-backbone.md`](irc-backbone.md). Cleverchat’s public hostname is **`https://api.clevertree.chat`** (same hardware as Intake). Vercel does not own the socket — `clevertree.chat/try` links to `https://api.clevertree.chat/chat/…`.

The back is the deep pass. A job file on the `comments` branch is the queue. The worker checks out `comments` only, drains every dirty page, and lets new comments that arrive during the drain join that same drain. When the queue is empty, the result says the hardware should shut down.

Cleverchat is an independent product repo. Other apps (including MyProblem) may mount it; they depend on Cleverchat, not the reverse. The debate is never written into the host page repo. `page.json` can pin a canonical URL or a content commit and flag the thesis stale. Nothing is written back to the host.

## Spot wake gate

By default the scripts only echo the calls (no network):

- `infra/spot-wake-comments.sh` echoes `createCloudspace` and `createSpotNodePool` for class `gpu.vs2.xlargeplusplus-sjc` in `us-west-sjc-1`, org `paradigmthreat`, about $0.15/hr.
- `infra/spot-decommission-comments.sh` echoes `deleteSpotNodePool` and `deleteCloudspace`.

Set `CLEVERTREE_SPOT_WAKE=1` to mark a wake request. A real Spot create/delete runs only when `RACKSPACE_SPOT_TOKEN` (or `CLEVERTREE_SPOT_TOKEN`) is also present; otherwise the script stays soft-fail dry-run and `cloud_api_called` remains false. Leaving the A30 at desired=0 is not the idle state. On-demand A30 is not this path. A comments cloudspace is its own box so a debate pass does not sit behind ticket vision, and a vision job does not keep this GPU up.

Curator commits use the service id `clevertree-chat-ai`. A person's name is never the author of a rewritten room. Each batch commit can be published to every local remote that serves the comments branch. The index and the files it points at are part of that commit.

## Any URL

A browser extension and an HTML snippet are small fronts in `fronts/`. They normalize the tab URL (public suffix first, campaign tags dropped, `id` / `p` / `story` kept) and stay empty until someone types. The extension uses **domain-level** page scope (one debate per site). Product rules for provisional pages, batch canonicalization of mirrors, and topic vs person homes are locked in [`url-pages-and-associations.md`](url-pages-and-associations.md) and [`person-space.md`](person-space.md); helpers in `associations.py` / `spam_court.py`. The **browser extension** is an MV3 side panel in [`fronts/extension/`](../fronts/extension/). The Android voice component in `android/` sends transcript text to the same filing API and asks for audio of the section. It does not write git. No APK is built here.

## Phase 2 gauge, still dry

The always-on path is this site's API, `POST /api/debate` and `GET /api/debate`. It files the starting slot and records submit latency for that slot in `gauge/live-key-latency.json` on the comments branch. The number is how long the live submit took. It is not a GPU measurement.

The batch path is the in-process curator. Submit writes `pages/<page>/job.json`. The page then calls the drain action. That drain runs the phase-1 engine plus `batch_hooks` (associations, spam court clocks, optional live fetch of suggested-counter URLs when `CLEVERTREE_FETCH=1`, IRC delivery of `questions.md` asks). After the queue is empty, `clevertree_chat.gauge` runs the two Spot scripts and stores their echo. The wake echo names `createCloudspace` and class `gpu.vs2.xlargeplusplus-sjc`. The other echo names `deleteCloudspace`.

`CLEVERTREE_SPOT_WAKE` gates a real wake. Production Intake keeps it `0` until a Spot token is mounted. Owner answers on IRC (`!answer …` or `si answer: …`) fold into `owner-answers.md` and `rules.md`.

Full comments SoT: mount via PVC (or `scripts/bootstrap_comments_checkout.sh`). Marker `.clevertree-full-sot` skips fixture seed. Set `CLEVERTREE_SEED_FIXTURES=0` on Intake.
