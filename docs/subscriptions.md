# Subscriptions

People subscribe to the section they took part in. The first comment is enough. The short id is written to `subscribers.json` on that key in the same commit as the comment.

They are not notified because another comment was posted. A new comment does not append a notice.

They are notified when the batch finishes work on that section:

- the position was rewritten
- questions were put to them
- a suggested counter is waiting for someone to write

Notices live in `pages/<page>/notifications.json`. Each event names the subscriber's short id, the section (`topic/key`), and a kind of `position`, `questions`, or `suggested-counter`. There is no `comment` kind.

A vote does not by itself subscribe someone, and it does not count as a section update. The section update is the batch's rewrite, which is what makes a solo debate a complete loop.
