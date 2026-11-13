# Infrastructure

The front of the product is the live path. While someone writes, it may show a suggested existing category. That suggestion does not file the post. The author does not wait on the batch, and the live path does not boot a GPU.

**Chat host (Intake):** the containable UI, `/api/chat`, and WebSocket fan-out run on Intake (`scripts/chat_host.py`, see [`chat-host.md`](chat-host.md)). Peer posts are server-injected. Vercel does not own the multi-person demo socket — `clevertree.chat/try` links to `https://intake.myproblem.app/chat/…`.

The back is the deep pass. A job file on the `comments` branch is the queue. The worker checks out `comments` only, drains every dirty page, and lets new comments that arrive during the drain join that same drain. When the queue is empty, the result says the hardware should shut down.

That split is myproblem.app's infrastructure: always-on intake for the live path, ephemeral Spot for the deep pass, git as the record. This product stays its own repo. myproblem.app is the first app that mounts it. The debate is never written into the host page repo. `page.json` can pin a canonical URL or a content commit and flag the thesis stale. Nothing is written back to the host.

## Spot, dry run only

Phase 1 does not create a cloudspace. The scripts only echo the calls:

- `infra/spot-wake-comments.sh` echoes `createCloudspace` and `createSpotNodePool` for class `gpu.vs2.xlargeplusplus-sjc` in `us-west-sjc-1`, org `paradigmthreat`, about $0.15/hr.
- `infra/spot-decommission-comments.sh` echoes `deleteSpotNodePool` and `deleteCloudspace`.

They do not curl and they do not call the network. Leaving the A30 at desired=0 is not the idle state. On-demand A30 is not this path. A comments cloudspace is its own box so a debate pass does not sit behind ticket vision, and a vision job does not keep this GPU up.

Curator commits use the service id `clevertree-chat-ai`. A person's name is never the author of a rewritten room. Each batch commit can be published to every local remote that serves the comments branch. The index and the files it points at are part of that commit.

## Any URL

A browser extension and an HTML snippet are small fronts in `fronts/`. They normalize the tab URL (public suffix first, campaign tags dropped, `id` / `p` / `story` kept) and stay empty until someone types. Product rules for provisional pages, batch canonicalization of mirrors, and topic vs person homes are locked in [`url-pages-and-associations.md`](url-pages-and-associations.md) and [`person-space.md`](person-space.md). The **browser extension** is an MV3 side panel in [`fronts/extension/`](../fronts/extension/) (simplified Debate board; load unpacked). The Android voice component in `android/` sends transcript text to the same filing API and asks for audio of the section. It does not write git. No APK is built here.

## Phase 2 gauge, still dry

The always-on path is this site's API, `POST /api/debate` and `GET /api/debate`. It files the starting slot and records submit latency for that slot in `gauge/live-key-latency.json` on the comments branch. The number is how long the live submit took. It is not a GPU measurement.

The batch path is the in-process curator. Submit writes `pages/<page>/job.json`. The page then calls the drain action. That drain runs the phase-1 engine. It does not boot hardware. After the queue is empty, `clevertree_chat.gauge` runs the two scripts above and stores their echo. The wake echo names `createCloudspace` and class `gpu.vs2.xlargeplusplus-sjc`. The other echo names `deleteCloudspace`. `cloud_api_called` stays false.

`CLEVERTREE_SPOT_WAKE` is the name reserved for a later real wake. It is not set. The scripts do not read it, and they do not call the Spot API. A comments pass that should shut the hardware down still only says so.
