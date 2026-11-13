# Passkeys

A visitor is a UUID in local storage. They can type immediately. The first comment or vote writes that UUID into `users/index.json` on the comments branch, in the same commit as the comment or vote. Comments and votes store the short incremental id, not the UUID.

A passkey is how that same UUID comes back on another browser. The private key never leaves the device. The browser proves it with WebAuthn:

- `navigator.credentials.create` and `navigator.credentials.get`
- discoverable credential (`residentKey: required`, and `requireResidentKey`)
- `userVerification: required`
- conditional UI (`mediation: "conditional"`, `autocomplete="username webauthn"`)

This is not the W3C Digital Credentials API, and it is not a password.

After a passkey check, the API layer sets an httpOnly session cookie (`clevertree_session`). Edits, votes, and further posts for a visitor who has a passkey require that session. A bare UUID is not enough, or anyone who read the public index could post as them. A visitor who has never created a passkey still uses the unguessable UUID.

## Private repo

Email recovery and credential records live in a separate git repo named `clevertree-chat-auth`. Tests use a temp repo. It is not the comments branch, it is not merged into it, and the public debate servers do not serve it.

That repo holds:

- the credential id
- the passkey public key
- `HMAC-SHA256(pepper, normalized email)`
- the UUID they unlock

The pepper is a node secret. It is not stored in the repo. A bare hash of an email is not what gets written, because a bare hash can be guessed. The HMAC is the lookup for a one-time recovery link that registers a new passkey onto the same UUID.

Comments, votes, short ids, and the visible name stay on the comments branch. The UUID is the only field in both repos. Registering a passkey writes that UUID into the user index in the same step if it is not there yet.

A related-origins list for `https://clevertree.chat` and `https://myproblem.app` lives in the library. Phase 1 does not change the marketing page to publish a `.well-known` file.
