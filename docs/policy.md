# Markdown policy

Comments and server copy are Markdown. That includes a person's post and the text the AI writes: the position, the questions, and the suggested counter. The renderer outputs a safe subset. Raw HTML is escaped and is not rendered.

Links are allowed. Images are not shown yet. An image in the Markdown stays a clickable link.

A repo can post `policy.md` to change that. `images: show` lets images appear. `images: links` keeps them as links. `links: off` turns links off. The policy file is how a repo enables images. The AI rules file is not.

A repo with no policy file uses Relay's default policy. That default is built into `clevertree_chat.policy`. It is not a file the server copies in. The built-in policy allows links and keeps images as links. The same people who may change `rules.md` may change `policy.md`.

Spam (flag → contest → hide → remove) is a **rules** concern, not Markdown policy. See [`spam.md`](spam.md) and [`default-rules.md`](default-rules.md).
