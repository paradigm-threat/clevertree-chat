# Batch decisions

The batch files the comments branch. At decision time it reads `rules.md` when that file is posted. A missing file is the Relay default built into `clevertree_chat.rules`. It does not guess a third policy.

Confidence is posted on the decision. It does not pick a different outcome. `high` means the reading is unambiguous. `low` means the batch still followed the rule, and a person can see it was not sure.

Where it is stored:

- `pages/<page>/index.json`, at `topics.<topic>.decisions`. Each item has `kind`, `rule` (`posted` or `default`), and `confidence` (`high` or `low`).
- A post listed from more than one key also has `confidence` on that entry in each key's `listing.json`.
- `pairs.json` carries `confidence` and `rule` for the pairing decision.
- `key-history.json` stays a map of the old key to the current key. The rename's confidence sits on the `rename` decision next to that history in the page index.

`rule: "default"` means `rules.md` was absent and the built-in default was read. `rule: "posted"` means the batch read the posted file.

## Category keys

### Spill creates a key

Situation: Only `invasion-of-privacy` exists. A later post says "but it's illegal!"
Rule: Relay default. No `rules.md`. Mint a key when the post fits nothing that exists.
Decision: Create `illegal` and file that reply there. Do not create `legal`. Cite the Patriot Act in the suggestion. `national-security` stays a suggestion too, because "necessary" was not a second argument.
Confidence: `high` on the filing and on the suggestion.

### A suggestion does not create a key

Situation: The first post is "These cameras are mass surveillance." Nobody has written the opposing line.
Rule: Relay default. A counter nobody has written is a citation, not a directory.
Decision: File the post under `invasion-of-privacy`. Record `national-security` as a suggestion with `created: false`. The directory is absent.
Confidence: `high`.

### A posted rule refuses a new key

Situation: `rules.md` says `Never open a new topic`. Someone writes "but it's illegal!" and `illegal` does not exist.
Rule: The posted file, read at drain time. `mint` is `never`.
Decision: Do not create `illegal` or `invasion-of-privacy`. File the post under `other`.
Confidence: filing `high`, because the posted line is explicit. The summary of `other` is `low`, because that folder has no catalog one-liner.

A posted `Do not ask questions` is the same kind of refusal for a question that would have opened a key. The question is kept and filed under `other`. A statement that spills is still allowed to open a key, because that line does not forbid new topics.

### A rename keeps history

Situation: A post was placed under `mass-surveillance`.
Rule: Relay default. Keys are up to the AI. A same-argument rename is allowed. Legality never folds into another axis.
Decision: Rename to `invasion-of-privacy`. `key-history.json` and the page index keep `mass-surveillance` pointing at the new key.
Confidence: `high` on the `rename` decision.

Situation: `rules.md` says `Keys never change` before that post is placed.
Rule: The posted file. `keys` is `never`.
Decision: Leave the key at `mass-surveillance`. No rename decision.
Confidence: filing `high`.

### Leave the unwritten counter uncreated

Situation: `illegal` exists and nobody has written the defense.
Rule: Relay default. Do not open a directory for a counter a person has not written.
Decision: Suggest `legal` and cite the Patriot Act (`patriot-act`). Neither directory is created.
Confidence: `high`, including when the filing that opened `illegal` was itself `low`.

## Summary wording

### Reword the summary

Situation: The post is the surveillance claim plus an extra sentence ("I disagree with the key.").
Rule: Relay default. The AI re-represents the opinion as a short position, without emotion. No `rules.md`, so no required prefix.
Decision: `position.md` is the catalog one-liner for `invasion-of-privacy`, not a paste of the extra sentence.
Confidence: `high`.

Situation: `rules.md` says `Summaries must start with "Brief:"`.
Rule: The posted file. `summary_prefix` is `Brief:`.
Decision: The same one-liner, starting with that prefix.
Confidence: `high`.

### A holding summary is not a settled one-liner

Situation: The only text in `uncategorized` or `other` is a post with no catalog one-liner.
Rule: Relay default, or the posted file if one is present. The section is still restated.
Decision: Write `position.md` from the post. Mark the summary `low` so it does not look like a certain argument.
Confidence: summary `low`. The filing confidence is separate.

## Where a post sits

One comment file. The `file` decision lists every key it belongs to. `starting` is the slot from submit, when there was one.

### A manual starting slot can be moved

Situation: `illegal` already exists. The author picks it for "We need these cameras now for national security."
Rule: Relay default. A chosen existing key is only the starting slot.
Decision: File the post under `national-security`. Leave `starting` as `illegal`. Do not rename `illegal`.
Confidence: `high`.

### One post, several keys, one file

Situation: Both `invasion-of-privacy` and `illegal` exist. The post is "These cameras are illegal mass surveillance."
Rule: Relay default. A post belongs to every existing key it names. The body is not copied.
Decision: One comment file. Both keys list it. `listing.json` on each key records that path and the same confidence.
Confidence: `high`.

### A question joins the named axis

Situation: `invasion-of-privacy` exists. Someone asks "Are these cameras mass surveillance?"
Rule: Relay default. Questions are allowed. A question that names an axis joins it and does not open a new key.
Decision: File the question on `invasion-of-privacy`. It is not put in `other`.
Confidence: `high`.

Situation: The question is "Are these cameras illegal?" and `illegal` does not exist yet.
Rule: Same default. The question names an axis that fits nothing present, so that is a spill.
Decision: Create `illegal` and file the question there.
Confidence: `high`.

### A non-argument can land in other

Situation: The post is "lol", "Why?", or an insult. It names no axis.
Rule: Relay default. Non-arguments are stored, not rejected. The batch may file them under `other` when they fit no distinct argument. The default does not mint a key to hold them.
Decision: Leave them in `uncategorized`. Do not open `other` for "lol".
Confidence: filing `high`. Summary of `uncategorized` is `low`.

A post that names a real axis and is refused a new key does land in `other`. That is the refused-key scenario above, not a silent drop.

### Low confidence is posted

Situation: The post says both, "These cameras are legal but they are illegal."
Rule: Relay default. The reading keeps the later legality word. The rules do not offer a second outcome for a conflict, and confidence does not invent one.
Decision: File it under `illegal`. Do not also create `legal`. Do not leave it uncategorized.
Confidence: filing `low`. The value is the string `low`, not an omitted field and not `high`. The suggestion that `legal` stays uncreated is still `high`.

### Missing rules use the built-in default

Situation: The repo has no `rules.md`. The post swears and calls the cameras mass surveillance.
Rule: `parse_rules(None)`, the built-in Relay default. People may swear. The AI does not. A post that fits nothing mints a key.
Decision: Create `invasion-of-privacy`. The position restates the claim and does not keep the swear.
Confidence: `high`. `rule` is `default`.

## Pairs, and a second pass

### Record a pair without merging

Situation: Both `invasion-of-privacy` and `national-security` have posts.
Rule: Relay default. Counters that both exist are paired. A rename still cannot fold one axis into the other.
Decision: `pairs.json` lists the pair. `try_rename` from one to the other does nothing.
Confidence: `high` on `pairs.json`.

### A finished tree is left alone

Situation: The batch has already filed the post. Nothing new arrives.
Rule: The same rules as the first pass, read again.
Decision: Do not commit. The posted decisions stay as they were.
Confidence: unchanged. A second pass does not replace a posted `high` or `low` with a different guess.

## When the batch is not sure

Situation: A filing or a summary is not high confidence.
Rule: The batch still files the posts. The low mark does not change the outcome. The question is written where a person can answer it, on `pages/<page>/questions.md` for that page, and in `users/questions.md` when the question is about who someone is.
Decision: Flag the question for a person. A later batch may investigate with Bedrock or another outside service. Until that lookup exists, the flag goes to IRC in real time. A person watching can answer in the moment, or leave a note the next run of that repo must read. The answer updates the posted rules or the knowledge base. The batch does not keep a private exception.
Confidence: the flag is the low mark itself. IRC delivery and Bedrock lookup are documented here and are not built yet.

## Anonymous ids on a backlog import

Situation: A backlog has messages with no author, and live visitors already carry a browser id.
Rule: One anonymous UUID per channel is a one-time backlog exception, and only for messages with no author. The map is labeled historical. Live traffic must not mint a fresh anonymous id per channel. A later visitor keeps the id they already have, restored by a passkey.
Decision: The Paradigm Threat import recorded that map in `users/backlog-anonymous.json` on the comments branch. Every exported message had an author, so those ids are reserved and unused. Named authors keep one UUID across every channel. The same name is not issued twice.
Confidence: `high` on the live-traffic prohibition.
