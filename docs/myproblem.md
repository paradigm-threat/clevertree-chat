# Where myproblem.app mounts this

Wherever a public MyProblem page states something people can argue with, the page includes this add-on. The topic key is the debate once a person has started it. The page is only a mount. Loading the page does not open a topic.

- Knowledge-base reader articles. The article remains the knowledge-base page. The debate hangs off it under a topic key, on the comments branch this product owns.
- Marketing and other public site pages on myproblem.app that make a claim.
- A published handoff post, the redacted public file already separate from the private ticket. The private tip itself stays a dossier. It does not become a comment thread.

One article can offer one topic, or more than one when the page actually contains more than one argument. Posts accumulate in the topic a user brought up. Flock cameras on many pages is one debate only after someone has written the first words under `flock-cameras`. On the next page, the index stores a pointer. It does not start a second copy.

The widget, the realtime path, and the batch worker are Clevertree Chat. myproblem.app does not grow a second comment implementation. Tickets stay private dossiers. The knowledge base stays the curated articles. Live chat and this debate are the same kind of add-on: the host page keeps its own content.

The site is [clevertree.chat](https://clevertree.chat). The repo is this one, `clevertree-chat`.

## External IRC peers (planned)

MyProblem is the primary product for a future **peer IRC bot**: connect to networks outside Relay Ergo (starting with **Georgia-** and **Israel-oriented** nets such as IvritNet / regional channels, plus optional Libera/OFTC tech rooms), join channels when asked, and answer only on bang commands or scarce “can anyone help…” patterns — short replies, rules-bound SI/API when needed. Design SoT: [`external-irc-peers.md`](external-irc-peers.md). Keep that plan in this repo; mount from MyProblem rather than forking peer-bot docs into other product trees.
