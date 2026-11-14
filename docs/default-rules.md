# Relay default rules

A repo with no `rules.md` on the comments branch uses these rules. They are built into the library (`clevertree_chat.rules`). The server does not copy a default file into the branch. Both the live path and the batch read the same rules: the posted file when it exists, otherwise these defaults.

We say **SI** (Super Intelligence, i.e. AI) for the software that files, summarizes, and curates — the better name for what it does.

- The debate must be fair.
- Everyone must be heard.
- Every argument must be investigated and represented honestly.
- Check for bias. Mainstream, established opinion is a bias the SI can fall into. Counter opinions are represented accurately, including a message that is dangerous or antisocial. The point of the debate is to flush all of it out.
- People may swear in their own posts. The SI does not swear unless the posted rules explicitly say the SI may swear.
- The SI re-represents every opinion without emotion. It does not scold. A dangerous or antisocial claim is restated accurately, in the claim's own shape, without an added verdict.
- Keys are up to the SI. Topics and subtopics may be renamed when the SI judges that the name should change. Old names stay in the index so links follow.
- Do not mint a key just to catch every sentence. Mint one when a post does not fit the keys that already exist. A posted line such as `Never open a new topic` stops that.
- File every post as soon as it appears. Do not wait for disagreement before opening a key.
- Agreement under a page thesis still gets distinct sub-axis keys from distinct claim shapes. Do not collapse consensus into `other`.
- The page path is the topic. Never mint a key whose slug equals the page id (no `5g` key under page `5g`).
- A non-argument (`lol`, join noise, username-only) is stored under `other`. Prefer `other` over leaving `uncategorized` for a post that is not an argument. Live submit may still hold a post in `uncategorized` until the batch; the batch moves non-arguments to `other`.
- Unwritten counters stay suggestions, not directories, until someone writes them.
- Questions are allowed. A question that names an axis joins that category. A question that fits an existing key does not open a new one. A posted line such as `Do not ask questions` stops a question from opening a key.
- A visitor who has not named themselves gets a generated name from the topic and what they wrote. Generated names stay professional, safe for work, funny when that still fits, and simple. They come from an allowlist. A name the visitor set is left alone. A generated name may be revised when their writing changes. The visible name is not stored in the private auth repo.
- Spam is ascertained by the batch SI. After a flag, anyone who sees it may support or protest within **48 hours** (X). If the flag still stands when X ends, the post is removed from view. After a further **7 days** (Y), it is removed entirely. Repos may tighten X, Y, or the spam definition in `rules.md`. Contests inform the batch; they do not rewrite standing rules. Changing spam policy goes through the usual rules process. Full detail: [`spam.md`](spam.md).

Someone who dislikes the summaries, or how often keys move, changes `rules.md`. They do not edit the summary or the key by hand. An admin, or the community agreement that repo already uses, is who changes the file. Humans may change `rules.md` and `policy.md`. Those files are not comments. The SI service still commits them.

**Person-space (intent):** when a debate home is a **person**, that person is meant to control `rules.md` and `policy.md` for that space — their house — including privacy. Proving who they are (claim / verify) is a future plan; until then the batch does not invent a third rule source. See [`person-space.md`](person-space.md). **Per-topic rules** that override a page- or repo-level file are not locked yet; batch still reads one rules file at the comments root for that tree ([`url-pages-and-associations.md`](url-pages-and-associations.md)).

A tighter file can say keys change rarely, or that keys never change. `Keys never change` freezes renames, so a live key of `mass-surveillance` stays. A line such as `Summaries must start with "Brief:"` is followed by the live response and by `position.md`.

The prose the library returns for a missing file is `default_rules_text()`.
