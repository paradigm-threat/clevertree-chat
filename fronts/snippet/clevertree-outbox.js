/**
 * Clevertree Chat — offline post outbox (IndexedDB FIFO).
 * Posts queue on device and flush to /api/chat when the network returns.
 */
(function (global) {
  const DB_NAME = "clevertree-outbox";
  const DB_VERSION = 1;
  const STORE = "posts";

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = function () {
        reject(req.error || new Error("outbox open failed"));
      };
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const s = db.createObjectStore(STORE, { keyPath: "clientPostId" });
          s.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
    });
  }

  function idbReq(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error || new Error("outbox request failed"));
      };
    });
  }

  function isQuotaError(err) {
    if (!err) return false;
    if (err.name === "QuotaExceededError") return true;
    const msg = String(err.message || "").toLowerCase();
    return msg.indexOf("quota") >= 0 || msg.indexOf("storage") >= 0;
  }

  async function putPost(post) {
    try {
      const db = await openDb();
      try {
        const tx = db.transaction(STORE, "readwrite");
        await idbReq(tx.objectStore(STORE).put(post));
        await new Promise(function (resolve, reject) {
          tx.oncomplete = function () {
            resolve();
          };
          tx.onerror = function () {
            reject(tx.error || new Error("outbox put failed"));
          };
        });
      } finally {
        db.close();
      }
    } catch (err) {
      if (isQuotaError(err)) {
        throw new Error(
          "Device storage full — free space or sync existing posts, then try again.",
        );
      }
      throw err;
    }
  }

  async function deletePost(id) {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, "readwrite");
      await idbReq(tx.objectStore(STORE).delete(id));
      await new Promise(function (resolve, reject) {
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error || new Error("outbox delete failed"));
        };
      });
    } finally {
      db.close();
    }
  }

  async function listPending() {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, "readonly");
      const all = (await idbReq(tx.objectStore(STORE).getAll())) || [];
      return all
        .filter(function (p) {
          return p.status !== "synced";
        })
        .sort(function (a, b) {
          return a.createdAt - b.createdAt;
        });
    } finally {
      db.close();
    }
  }

  let flushInFlight = null;
  const listeners = [];

  function notify() {
    listeners.forEach(function (fn) {
      try {
        fn();
      } catch (e) {}
    });
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  async function enqueue(input) {
    const post = {
      clientPostId: crypto.randomUUID(),
      topic: input.topic || "",
      visitorId: input.visitorId || "",
      body: String(input.body || "").trim(),
      chosen: input.chosen || "",
      apiBase: input.apiBase || "",
      apiPath: input.apiPath || "/api/chat",
      createdAt: Date.now(),
      status: "queued",
      lastError: "",
    };
    if (!post.body) throw new Error("Empty post");
    await putPost(post);
    notify();
    try {
      const reg = await navigator.serviceWorker?.ready;
      await reg?.sync?.register("outbox-flush");
    } catch (e) {}
    void flush();
    return post;
  }

  function isRetriableStatus(status) {
    return status === 0 || status === 408 || status === 429 || status >= 500;
  }

  function isNetworkErr(err) {
    if (!err) return false;
    if (err.name === "TypeError") return true;
    const msg = String(err.message || "").toLowerCase();
    return (
      msg.indexOf("failed to fetch") >= 0 ||
      msg.indexOf("network") >= 0 ||
      msg.indexOf("offline") >= 0
    );
  }

  async function syncOne(post) {
    post.status = "syncing";
    post.lastError = "";
    await putPost(post);
    notify();
    try {
      const url = (post.apiBase || "").replace(/\/$/, "") + (post.apiPath || "/api/chat");
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": post.clientPostId,
        },
        credentials: post.apiBase ? "omit" : "same-origin",
        body: JSON.stringify({
          action: "submit",
          body: post.body,
          chosen: post.chosen || "",
          visitor: post.visitorId,
          topic: post.topic,
          client_post_id: post.clientPostId,
        }),
      });
      if (!response.ok) {
        let err = "Could not post";
        try {
          const data = await response.json();
          err = data.error || data.message || err;
        } catch (e) {}
        if (isRetriableStatus(response.status)) {
          post.status = "queued";
          post.lastError = err;
          await putPost(post);
          notify();
          return "deferred";
        }
        post.status = "failed";
        post.lastError = err;
        await putPost(post);
        notify();
        return "failed";
      }
      await deletePost(post.clientPostId);
      notify();
      return "synced";
    } catch (err) {
      if (isNetworkErr(err)) {
        post.status = "queued";
        post.lastError = "Waiting for network";
        await putPost(post);
        notify();
        return "deferred";
      }
      post.status = "failed";
      post.lastError = err.message || "Sync failed";
      await putPost(post);
      notify();
      return "failed";
    }
  }

  async function flush() {
    if (flushInFlight) return flushInFlight;
    flushInFlight = (async function () {
      const pending = await listPending();
      const work = pending.filter(function (p) {
        return p.status !== "failed";
      });
      if (!work.length) return { synced: 0, failed: 0, deferred: false };
      const reachable = await probeReachable(work[0].apiBase || "");
      if (!reachable) return { synced: 0, failed: 0, deferred: true };
      let synced = 0;
      let failed = 0;
      for (let i = 0; i < work.length; i++) {
        const post = work[i];
        // Never retarget — use the topic stored on the job at enqueue time.
        const result = await syncOne(post);
        if (result === "synced") synced += 1;
        else if (result === "failed") failed += 1;
        else return { synced: synced, failed: failed, deferred: true };
      }
      return { synced: synced, failed: failed, deferred: false };
    })().finally(function () {
      flushInFlight = null;
      notify();
    });
    return flushInFlight;
  }

  async function retry(id) {
    const pending = await listPending();
    const post = pending.find(function (p) {
      return p.clientPostId === id;
    });
    if (!post) return "failed";
    post.status = "queued";
    post.lastError = "";
    await putPost(post);
    notify();
    return syncOne(post);
  }

  async function discard(id) {
    await deletePost(id);
    notify();
  }

  async function probeReachable(apiBase) {
    try {
      const url = (apiBase || "").replace(/\/$/, "") || "";
      // Same-origin shell probe when posting from clevertree.chat; else ping API.
      const probe = url
        ? url + "/api/chat?action=view&topic=_probe&visitor=probe"
        : "/site.webmanifest";
      const res = await fetch(probe, { method: "GET", cache: "no-store" });
      // 404 on fake topic is still reachable
      return res.status > 0;
    } catch (e) {
      return false;
    }
  }

  let wakeArmed = false;
  function armWake() {
    if (wakeArmed || typeof window === "undefined") return;
    wakeArmed = true;
    window.addEventListener("online", function () {
      void flush();
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") void flush();
    });
    window.setInterval(function () {
      void flush();
    }, 30000);
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener("message", function (event) {
        if (event.data && event.data.type === "outbox-flush") void flush();
      });
    }
    void flush();
  }

  global.ClevertreeOutbox = {
    enqueue: enqueue,
    flush: flush,
    listPending: listPending,
    retry: retry,
    discard: discard,
    subscribe: subscribe,
    armWake: armWake,
  };
})(typeof window !== "undefined" ? window : globalThis);
