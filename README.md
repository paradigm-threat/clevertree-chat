Clevertree Chat, called Cleverchat for short, is a standing debate that can live on a page. The site is clevertree.chat. The name can change. The debates stay. People add original posts to an argument. They do not reply to each other. The place a point is answered is the other argument, which has its own short URL.

A topic and a one-line argument make that URL. `flock-cameras/invasion-of-privacy` is the claim that these cameras are mass surveillance. `flock-cameras/national-security` is the claim that they are needed now. `flock-cameras/illegal` and `flock-cameras/legal` are a different pair. Similar sentences that make the same argument share a key. Legality does not get folded into privacy, and privacy does not get folded into security. The AI’s job is to keep those apart so someone watching can see the debate. How it decides, and how it writes the summaries, comes from the rules posted in that repo. A repo with no rules uses Relay’s defaults: a fair debate, everyone heard, every argument investigated and represented honestly, bias checked, counter opinions represented accurately even when the message is dangerous or antisocial. People may swear in their own posts. The AI does not, unless those rules explicitly allow it. Summaries carry the opinion without emotion, so a person can trust the AI to receive what they wrote and help it sit with the opinions already there. An admin, or the community agreement that repo uses, is who changes the rules. After a change, both the live pass and the batch follow the new file.

While someone writes, the page may suggest a category that already exists. The suggestion does not file the post. On submit they may pick an existing category as the starting slot, or pick nothing. They cannot type a new key. If they pick nothing, the post stays uncategorized until the batch. The choice is only the starting slot. The batch may move it, and it may also attach that same post to another key that already exists. One comment is one body. Each category holds a reference to that body. The text is not copied into a second file.

A post can sit in several categories, or in none. A joke, an insult, or a question that names no argument can land in `other`. A question that names an axis does not. The batch does not mint a key to catch every sentence. A new key appears when a post does not fit the keys that already exist. That is the spill. If only invasion-of-privacy exists and someone writes “but it’s illegal!”, that post does not fit privacy, so illegal is created and a question is posed there. “Are these cameras illegal?” is kept, and it joins illegal because that is the axis it names. A counter that nobody has written stays a cited suggestion. The Patriot Act is the example: the citation is recorded, and patriot-act is not a directory until a person writes the first words there.

The topic and the subtopic come into existence when a person submits the first words. The project does not start topics for people. How often a key may change is in the posted rules. Relay’s rule is that it is up to the AI. A repo can instead say keys change rarely, or not at all.

After the post is in git, a heavier model reads the topic the user opened, suggests the opposing one-liner, and rewrites the section they started into a short position. Long piles of the same point get simpler. Every distinct position stays addressable once a person has written it.

A second person is optional. The first comment is enough for a debate with the AI: questions on the section they opened, and counterpoints already published online offered as a suggestion. The other key waits until someone writes it. Each time a section they took part in changes, they are told that it was updated. They are not pinged because another comment appeared.

The front of the product is built for that live moment. The back is built for the deep pass, then the heavy hardware shuts down. That split is myproblem.app’s infrastructure, and myproblem.app is the first app that uses this comment system wherever a public page can hold a debate. Knowledge-base articles, public site pages, and published handoff posts mount the add-on. A private ticket stays a dossier. This debate is its own repo. Any other Relay page or application, and any other page, can mount the same component. The page keeps its own content. The debate is stored here, on its own git branch.

Phase 1 is the tests. Real arguments, including ones like Flock cameras, run until there is a reasonable confidence the AI can handle a topic and write the git files without leaving a mess for a later upgrade to clean up. The model will keep learning after launch. Launch waits on that confidence. The next phases run it on phone hardware and server hardware and measure the real thing.

**Any URL → debate (architecture locked):** normalize the tab URL, open a topic only when someone writes, then let batch associate mirrors and related pages — and classify homes as topic or person. See [`docs/url-pages-and-associations.md`](docs/url-pages-and-associations.md) and [`docs/person-space.md`](docs/person-space.md). **Browser extension — planned next:** capture the current URL into the containable chat; empty until typed; associations remain batch work.

Public lines on the page: “A new way to debate.” “Don’t get lost in the weeds.” “Make your opinion finally heard.”

## One post, the keys it fits

One post may belong to more than one category, or to none. It is not split into two comment bodies. There is one comment file, and each category it belongs to lists that same file.

If the post’s axes already exist as keys, it is assigned to each of those keys. Both `invasion-of-privacy` and `illegal` already exist, and the post is “These cameras are illegal mass surveillance.” It is filed in both. It is not copied into two different bodies.

Do not create new topics to capture everything. The default is the path of least resistance.

A new topic is warranted when the conversation spills into it: the post does not fit cleanly in the topics that already exist. Only `invasion-of-privacy` exists. Someone writes “Mass surveillance is necessary.” A later post says “but it's illegal!” That reply does not fit privacy, so the batch creates `illegal`, files the reply there, and poses a question. If no post yet states the counter to the accusation of being illegal, the batch investigates and cites a real counter. The Patriot Act is the example, at `https://www.congress.gov/bill/107th-congress/house-bill/3162`. It does not invent a second copy of the reply. The opposing key `legal` is still not created until a person has written words that spill into it. The citation is a suggestion, not a new directory by itself.

Posted rules define when a new topic is necessary. Relay’s default is: do not mint a key just to catch every sentence; mint one when a post does not fit the existing keys.

Early manual category choices may influence keys. The batch may clean them up later. A manual choice remains only the starting slot.

Questions are allowed unless the posted rules forbid them. A question that names an axis joins that category. “Are these cameras illegal?” belongs on `illegal`. If `illegal` does not exist yet and the question does not fit the existing topic, that is a spill and `illegal` may be created, under the same least-resistance rule. If it fits an existing topic cleanly, do not mint a new key. “Are these cameras mass surveillance?” stays on `invasion-of-privacy` once that key exists.

Non-arguments that fit nowhere can still land in `other`. A question that names a real axis does not get dumped in `other`.

Those batch decisions, and the confidence posted with each one, are inventoried in `docs/cases/batch-decisions.md`.

---

The product page files are `index.html`, `try/index.html`, and `styles.css`. A photograph at `images/hero.jpg` replaces the drawn tree.
