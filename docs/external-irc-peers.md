# External IRC peers (planned)

Clevertree Chat’s **home** network is Relay Ergo (`pub1.relaygateway.net` and mirrors). This doc is the plan to **also** run a rules-bound helper bot on **other** IRC networks — without merging those networks into Ergo, and without turning Cleverchat into a spammy always-on chatter bot.

**Primary product fit:** [MyProblem.app](https://myproblem.app) — collection rooms, programming help, and local community IRC. Clevertree Chat stays the independent IRC+SI backbone; MyProblem mounts it. Do **not** fork this design into QuizGate/PT repos; keep the SoT here and mount from MyProblem.

Status: **planned / suggested** — not shipping yet. Relay `#web` / `#pt` / MyProblem craft channels remain the live product.

## Goal

An IRC bot that can:

1. Connect to **any number** of external networks and channels (config + runtime invites).
2. **Join additional channels when asked** (ops/`!join`, invite, or allowlisted auto-join).
3. **Monitor** feeds for actionable lines — then optionally hit a Clevertree/MyProblem **API** or run a **bounded SI assessment**.
4. Reply only when rules say so: short, brief, non-obnoxious — fill blanks humans are not already filling, or escalate when deep investigation is required.

## Trigger rules (hard)

| Mode | When the bot may speak |
|------|-------------------------|
| **Bang commands** | Primary gate. Lines starting with `!` that match an allowlisted command (`!help`, `!investigate`, `!tip`, product-specific verbs). No bang → no command path. |
| **Help phrases** | Secondary, opt-in per channel. Soft patterns such as “can anyone help…”, “does anyone know…”, “how do I…”, with cooldown + rate limits. Must not pile on if a human already answered. |
| **Silence default** | Everything else is monitor-only (optional enqueue for batch SI / logs). No unsolicited essays. |

Replies stay **short** (aim under the soft PRIVMSG limit used on Relay). Long findings stay in SI panel / tip / API — IRC gets a teaser + link when needed.

## What “actionable” means

1. **Bang command** → dispatch to known handlers (help text, tip lookup, `!investigate`-style queue, MyProblem collection API).
2. **Help phrase** → check recent channel context; if unanswered and on-topic, brief suggestion or “ask with `!help …`”.
3. **Deep lane** → only when rules + confidence say so: queue batch SI (Groq/Bedrock/peers), never a standing chatty GPU presence.
4. **Never** vote, take sides in debates, mint topic-index rows, or invent standing exceptions.

## Starting networks (Georgia + Israel)

Scout first; join only with channel consent / operator awareness where required.

| Region | Network (starting point) | Notes |
|--------|--------------------------|--------|
| **Israel** | **IvritNet** — `irc.co.il` (port `7000`; see [irc.co.il](https://www.irc.co.il/)) | Long-running Hebrew/English regional network (`#Israel`, `#Ivrit`, `#Help_IL`, tech-adjacent channels TBD with locals). |
| **Israel / OSS** | **OFTC** — `irc.oftc.net` | Project channels (e.g. historic `#osm-il`); useful for open-source adjacency, not a Hebrew social home. |
| **Georgia** | **DALnet** `#georgia` and related | Small regional presence; verify live before relying. Georgian tech is often Facebook/Meetup-first — IRC may be sparse. |
| **Georgia / global tech** | **Libera.Chat** — `irc.libera.chat` | Not Georgia-local, but where Georgian developers already hang for languages (`#python`, `##programming`, etc.). Treat as optional peer, not a national network. |

Config should be data-driven (`networks[]` / `channels[]` / `triggers[]`) so MyProblem ops can add peers without code forks.

## Architecture sketch

```
External nets (IvritNet, DALnet, Libera, …)
        │  TLS IRC clients (one process or pool)
        ▼
  peer-bot  ──monitor──►  trigger rules
        │                      │
        │              bang / help phrase
        ▼                      ▼
   join/part on ask      API (MyProblem tip / Clevertree chat)
        │                      │
        │              optional SI batch (short reply)
        ▼                      ▼
   PRIVMSG (brief)       enqueue / tip / SI panel SoT
```

- **Home Ergo** stays authoritative for Clevertree product channels.
- **Peer bots** do not bridge full channel history into Ergo by default (avoid cross-network spam). Optional one-way notice into a MyProblem craft channel is a product decision.
- Same batch SI rules as Relay: curate/help under posted rules; queue-before-SoT when filing permanently.

## MyProblem mount story

- Collection `#mp-*` rooms stay on Relay.
- Peer bot is the **outreach / help** arm: sit in regional and programming IRC, answer `!` and scarce help-asks, open or update MyProblem tips when rules allow.
- Website and `/dev` point here so builders know the intended path without implementing peer bots in every product repo.

## Non-goals

- Replacing Relay Ergo.
- Auto-joining every channel on a network.
- Unsolicited marketing or debate flooding.
- Cross-posting full external logs into Paradigm Threat / QuizGate SoT.

## Related

- [`irc-backbone.md`](irc-backbone.md) — home Ergo mesh
- [`chat-host.md`](chat-host.md) — API / WS host
- [`myproblem.md`](myproblem.md) — mount notes
- [`default-rules.md`](default-rules.md) — SI behavior
