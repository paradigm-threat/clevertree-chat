# Context tags (IRC rooms)

One IRC channel can host many topics. **Do not** open a new channel per page.

## Wire grammar

| Tag | Meaning |
|---|---|
| `[[t:topic-id]]` | Debate / tip page topic (e.g. former `#pt-flock-cameras`) |
| `[[c:collection-id]]` | MyProblem collection |
| `[[nd:group/post]]` | Nextdoor post |
| `[[ndg:group]]` | Nextdoor group |

Compose auto-prepends tags from UI context. Renderers **hide raw tags** and show chips/links (`fronts/room/context-tags.js`).

## Identity

Chat is **anonymous by default**. No visitor UUID is required for room posting. UUIDs remain for data-storage products (e.g. QuizGate), not for public IRC.

## Channel policy

See [`fronts/room/channel-policy.json`](../fronts/room/channel-policy.json):

- **Paradigm Threat:** one default channel `#pt`; topics via `[[t:]]`.
- **MyProblem collections:** typically one channel per collection (listed in collection JSON).
