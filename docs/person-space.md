# Person-space debates

Some Clevertree Chat homes are **people**, not only topics. Batch may cluster public usernames and handles across networks so public posts about or by the same person can sit in one standing debate. That space is treated like **their house**: they implicitly control the rules that govern privacy and how the AI files there.

Related: [`url-pages-and-associations.md`](url-pages-and-associations.md) · [`default-rules.md`](default-rules.md) · [`policy.md`](policy.md) · [`auth.md`](auth.md).

---

## One-sentence rule

> **A person-kind chat is that person’s house for rules and policy; claim and verify who they are is a future plan — until then, document the intent and do not invent a third unsigned rule source.**

---

## Why person-kind exists

Public life is scattered: the same person often has similar (or slightly different) usernames on many networks. Tracking **public** posts in one debate requires knowing those handles and their association to each other. The AI batch builds those associations when confidence is high enough, and asks a human when a merge would be risky — the same posture as topical mint/rename ([MyProblem `topical-repos.md`](../../myproblem/docs/topical-repos.md)).

This is **not** a private tip dossier. Tip evidence and PII rules stay on the ticket SoT. Person-space is for **public** identity hubs and debates that hang off them.

---

## Their house (rules ownership — intent)

For a debate whose home kind is **person**:

- That person **implicitly** may change `rules.md` and `policy.md` for that space (privacy, what may be filed, whether keys move, summary shape, and similar).
- Those files remain the only human-posted rule sources, committed by the AI service as today ([`default-rules.md`](default-rules.md)). They are not comments.
- Until a **claim / verify** plan ships, this is **intent only**. The live path and batch still use Relay defaults or whatever `rules.md` / `policy.md` is already posted. They do not guess a third policy ([`cases/batch-decisions.md`](cases/batch-decisions.md)).

Claim (passkey, proven public handles, or similar) is explicitly **deferred**.

---

## Handle clustering (batch)

Batch may:

- Propose that handles across networks refer to the same public person
- Attach those handles as associations on the person-kind home
- Keep old ids as aliases when a display key is renamed

Risky merges (two large person trees, contested identity) wait for human consult. Low confidence stays unmerged.

---

## Topic chats vs person chats

| | Topic home | Person home |
|--|------------|-------------|
| Typical source | Article URL, product page, public claim | Public profile / handle cluster |
| Who changes rules today | Admin or community agreement already used by that repo | Same, until claim lands; **intent:** the person |
| Privacy posture | Public debate defaults | Person may tighten rules for their house once claim exists |

Per-topic rules that override a page- or repo-level file are **TBD**. Until then, one rules file at the comments root for that tree ([`url-pages-and-associations.md`](url-pages-and-associations.md)).

---

## Out of scope here

- Implementing claim / verify
- UI for “this is my space”
- Automatic doxxing or private-data linkage — associations are for **public** handles and posts only
