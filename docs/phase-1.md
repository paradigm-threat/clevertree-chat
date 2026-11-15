# Phase 1

Phase 1 does not deploy. It does not boot a Spot cloudspace, attach a domain, or call a cloud model. The filing engine in this repo is the tested stand-in: it chooses keys, writes the comments branch, and leaves a tree a later pass can extend.

The confidence bar is a clean git tree on a fresh topic, not only on the Flock cameras seed. A watcher can see the distinct one-liners and which ones answer each other. The name does not have to be the perfect name. Launch waits on that confidence. The model can keep learning after launch. Phase 1 exists so that learning is not a cleanup of a mess.

## The loop

1. Run a fixture through the live path and the batch.
2. Read the keys, the pairs, the questions, and the git tree.
3. Tighten the filer or the fixture.
4. Run again.

Stop when a topic that is not the seed, such as library fines, still lands in short distinct one-liners, keeps `illegal` and `legal` off the content keys, and leaves `git status` clean.

```bash
python3 -m unittest discover -s tests -v
```

Run that from the repo root. The suite uses `unittest`. It does not install pytest and it does not spend money.

## What a pass is allowed to do

While someone writes, the live path may show a suggested category that already exists. The suggestion does not permanently file the post. They may accept that category, or pick another existing one, as a **recommended** starting slot for the queue. They cannot type a new key. Policy ([`intake-queue.md`](intake-queue.md)): live **enqueues**; batch alone writes the comments SoT. `can_override` stays false: the batch decides the final slot and may move a post, including one they chose. Preview does not create a SoT topic. The batch does not author the opening post — it files the human’s words when accepted. One accepted post stays one file. If it names keys that already exist, that file is listed from each of them. A new key is minted only when the post does not fit the keys already there. A non-argument that fits nowhere can land in `other`. A question that names an axis does not. A posted rule that forbids a new topic sends that post to `other` instead of opening a key. The Flock spill, including the Patriot Act citation that does not open `legal`, is `docs/cases/spill.md`.

The batch checks out `comments` only. It loads `rules.md` or Relay's defaults, consumes the intake queue, rejects clear spam before SoT write, then splits arguments, pairs counters, rewrites `position.md`, and renames a same-argument key. Old names stay in the page index and in `key-history.json`. A second pass with no new accepted post and no new pair does not commit. New queue rows that arrive while draining join that same drain. When the queue is empty, the result says the hardware should shut down. The engine does not call the cloud to do that.
