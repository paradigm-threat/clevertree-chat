# Flock cameras

Seed case. The topic key is `flock-cameras`. The folders start empty. A person submits the first words. If they do not choose an existing category, the post stays uncategorized until the batch files the key below. The batch writes the position, the pairs, and the history.

| Post | Key |
|---|---|
| These cameras are mass surveillance | `invasion-of-privacy` |
| We need these cameras now for national security | `national-security` |
| Borders, elections, and crime | `national-security` (not new keys) |
| They are illegal | `illegal` |
| They are legal | `legal` |

`invasion-of-privacy` is paired with `national-security`. `illegal` is paired with `legal`. The legality keys link to the privacy and security keys. Linking is not a merge. `illegal` is not renamed onto `invasion-of-privacy`. `legal` is not renamed onto `national-security`.

A person may choose an existing category on submit. That choice is only the starting slot. The batch may move the post, including one placed by hand, or also attach the same body to another existing key. One comment is one file, referenced from each category. The old key stays in `key-history.json` and the page index when a key moves. A link to `mass-surveillance` resolves to `invasion-of-privacy`. Choosing a key that does not exist yet does not create it. A live suggestion does not file the post.

A non-argument is stored, not rejected. Blank text, `lol`, a question with no claim, and an insult with no claim can land in `other`. A question that names an axis joins that axis. A new key appears only when a post does not fit the keys that already exist. A counter nobody has written, such as the Patriot Act, stays a cited suggestion. A question that names an axis does not. The spill that opens `illegal`, and the one comment listed from both `invasion-of-privacy` and `illegal`, is [spill.md](spill.md).

## Tree

```text
users/index.json
pages/<page>/index.json
pages/<page>/job.json
pages/<page>/topics/flock-cameras/pairs.json
pages/<page>/topics/flock-cameras/key-history.json
pages/<page>/topics/flock-cameras/votes.json
pages/<page>/topics/flock-cameras/invasion-of-privacy/position.md
pages/<page>/topics/flock-cameras/invasion-of-privacy/questions.md
pages/<page>/topics/flock-cameras/invasion-of-privacy/suggested-counter.md
pages/<page>/topics/flock-cameras/invasion-of-privacy/comments/<id>.md
pages/<page>/topics/flock-cameras/invasion-of-privacy/votes.json
pages/<page>/topics/flock-cameras/invasion-of-privacy/comment-votes.json
pages/<page>/topics/flock-cameras/national-security/...
pages/<page>/topics/flock-cameras/illegal/...
pages/<page>/topics/flock-cameras/legal/...
```

`rules.md` and `policy.md` sit at the root of `comments` when a human has posted them. A missing file is not copied in. The host page's branch is not in this tree.

A suggested opposing key is a citation in `suggested-counter.md`. It is not a directory until a person writes the first words there. The AI does not open that side.
