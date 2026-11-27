# Context tags (IRC rooms)

One IRC channel can host many topics. **Do not** open a new channel per page.

**Debate board** = IRC room + SI panel. Tags attribute a message; they do not create channels.

## Wire grammar

| Tag | Meaning |
|---|---|
| `[[t:N]]` | Product-repo topic **index** (`0` = general). Human/admin curated in `chat/topics.json`. Trailing on the message. |
| `[[d:example.com]]` | Public `#web` domain attribution (short host; strip `www.`). Never page path. |
| `[[c:collection-id]]` | MyProblem collection |
| `[[nd:group/post]]` | Nextdoor post |
| `[[ndg:group]]` | Nextdoor group |

Compose **appends** tags at the **end** from UI context (topic id or domain). Renderers **hide raw tags** and show chips/links (`fronts/room/context-tags.js`).

**Privacy:** never auto-tag full page path/query. Domain-only on `#web` is intentional.

## Topic index (human only)

Per content repo, next to chat config — e.g. `chat/topics.json`:

```json
{
  "schema": "clevertree.chat-topics.v1",
  "irc_channel": "#pt",
  "topics": [
    { "id": 0, "slug": "general", "title": "General", "href": "/" },
    { "id": 1, "slug": "nukes", "title": "Nuclear weapons", "href": "/science/nukes" }
  ]
}
```

- Index **0** is always general.
- SI may display/organize topics in the SI panel; it **must not mint** index entries.
- Unknown `[[t:N]]` → plain chip, no invented URL.

## Identity

Chat is **anonymous by default**. No visitor UUID is required for room posting. UUIDs remain for data-storage products (e.g. QuizGate), not for public IRC.

## Channel policy

See [`fronts/room/channel-policy.json`](../fronts/room/channel-policy.json):

- **Paradigm Threat:** `#pt`; topics via `[[t:N]]`.
- **Public web (extension default):** `#web`; domain via `[[d:host]]`.
- **MyProblem collections:** typically one channel per collection.
