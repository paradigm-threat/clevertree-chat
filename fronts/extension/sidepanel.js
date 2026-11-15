/**
 * Clevertree Chat side panel — durable host, domain-level page scope.
 */
(function () {
  const DEFAULT_API = "https://api.clevertree.chat";
  const VISITOR_KEY = "clevertree.visitor";
  const API_KEY = "clevertree.apiBase";
  const COACH_KEY = "clevertree.coachSeen";

  const STARTERS = {
    "flock-cameras": "Should cities use camera networks?",
    "thc-legalization": "Should adult-use cannabis be legal?",
  };

  const els = {
    status: document.querySelector(".ct-status"),
    badge: document.getElementById("mode-badge"),
    title: document.getElementById("topic-title"),
    page: document.getElementById("page-chip"),
    count: document.getElementById("count-pill"),
    board: document.getElementById("board"),
    activity: document.getElementById("activity"),
    coachBox: document.getElementById("coach-box"),
    btnCoachSkip: document.getElementById("btn-coach-skip"),
    composer: document.getElementById("composer"),
    body: document.getElementById("body"),
    hint: document.getElementById("composer-hint"),
    btnPost: document.getElementById("btn-post"),
    statusMsg: document.getElementById("status-msg"),
  };

  const store = {
    apiBase: DEFAULT_API,
    visitor: "",
    topic: "",
    pageUrl: "",
    pageNorm: "",
    pageLabel: "",
    board: emptyBoard(""),
    coachSeen: false,
    expandedKeyId: null,
    busy: false,
    liveState: "closed",
    liveText: "Connecting…",
    socket: null,
    reconnectTimer: 0,
    pinTopic: "",
  };

  function storageGet(keys) {
    return new Promise(function (resolve) {
      chrome.storage.local.get(keys, resolve);
    });
  }

  function storageSet(obj) {
    return new Promise(function (resolve) {
      chrome.storage.local.set(obj, resolve);
    });
  }

  function rememberVisitor(id) {
    if (!id) return;
    store.visitor = id;
    return storageSet({ [VISITOR_KEY]: id });
  }

  async function cachedVisitor() {
    if (store.visitor) return store.visitor;
    const data = await storageGet([VISITOR_KEY]);
    if (data[VISITOR_KEY]) {
      store.visitor = data[VISITOR_KEY];
      return store.visitor;
    }
    return "";
  }

  async function ensureVisitor() {
    const known = await cachedVisitor();
    const data = await apiPost({
      action: "identify",
      visitor: known || undefined,
    });
    await rememberVisitor(data.visitor);
    return data.visitor;
  }

  function readPrefs() {
    return storageGet([API_KEY, VISITOR_KEY, COACH_KEY]).then(function (data) {
      if (data[API_KEY]) store.apiBase = String(data[API_KEY]).replace(/\/$/, "");
      if (data[VISITOR_KEY]) store.visitor = data[VISITOR_KEY];
      if (data[COACH_KEY] === "1" || data[COACH_KEY] === true) store.coachSeen = true;
    });
  }

  function markCoachSeen() {
    store.coachSeen = true;
    return storageSet({ [COACH_KEY]: "1" });
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function stripHtml(html) {
    const d = document.createElement("div");
    d.innerHTML = String(html || "");
    return (d.textContent || "").replace(/\s+/g, " ").trim();
  }

  function humanizeKey(id) {
    return String(id || "")
      .split("-")
      .filter(Boolean)
      .map(function (w) {
        return w.charAt(0).toUpperCase() + w.slice(1);
      })
      .join(" ");
  }

  function clockAt() {
    const now = new Date();
    return (
      String(now.getHours()).padStart(2, "0") +
      ":" +
      String(now.getMinutes()).padStart(2, "0")
    );
  }

  /** Domain-level debate path for extension tabs. */
  function domainNormalized(href) {
    if (!href || !/^https?:/i.test(href) || typeof normalizeUrl !== "function") return "";
    try {
      const u = new URL(href);
      return normalizeUrl(u.protocol + "//" + u.hostname + "/");
    } catch (e) {
      return "";
    }
  }

  function emptyBoard(topicId, title) {
    return {
      topic: {
        id: topicId,
        title: title || STARTERS[topicId] || humanizeKey(topicId) || "This site",
        invite: "Explore the main perspectives, then add your own point.",
      },
      keys: [],
      posts: [],
      activity: [],
    };
  }

  function viewToBoard(view, topicId) {
    const pageTitle =
      (view && view.page && view.page.title) ||
      STARTERS[topicId] ||
      store.pageLabel ||
      "This site";
    if (view && view.page) {
      if (view.page.normalized) store.pageNorm = view.page.normalized;
      if (view.page.title) store.pageLabel = view.page.title;
      if (view.page.url) store.pageUrl = view.page.url;
    }
    if (!view || !view.exists) {
      return emptyBoard(topicId, pageTitle);
    }
    const sections = view.sections || {};
    const pairs = view.pairs || [];
    const existing = (view.existing || []).slice();
    const counters = {};
    pairs.forEach(function (pair) {
      if (!pair || pair.length < 2) return;
      const a = pair[0];
      const b = pair[1];
      if (!counters[a]) counters[a] = [];
      if (!counters[b]) counters[b] = [];
      if (counters[a].indexOf(b) < 0) counters[a].push(b);
      if (counters[b].indexOf(a) < 0) counters[b].push(a);
    });
    const keyIds = existing.slice();
    Object.keys(sections).forEach(function (k) {
      if (k !== "uncategorized" && keyIds.indexOf(k) < 0) keyIds.push(k);
    });
    const postsById = {};
    function ingest(keyId, c, provisional) {
      const id = String(c.id);
      if (!postsById[id]) {
        postsById[id] = {
          id: id,
          body: c.text || stripHtml(c.html) || "",
          keys: [],
          provisionalKeys: [],
          author: c.mine ? "me" : "peer",
        };
      }
      const keys = (c.keys || []).filter(function (k) {
        return k && k !== "uncategorized";
      });
      if (!keys.length && keyId !== "uncategorized" && !provisional) keys.push(keyId);
      keys.forEach(function (k) {
        if (postsById[id].keys.indexOf(k) < 0) postsById[id].keys.push(k);
      });
      if (provisional && c.starting && c.starting !== "uncategorized") {
        postsById[id].provisionalKeys = [c.starting];
      }
    }
    keyIds.forEach(function (keyId) {
      const section = sections[keyId] || {};
      (section.comments || []).forEach(function (c) {
        ingest(keyId, c, false);
      });
    });
    const uncat = sections.uncategorized;
    if (uncat) {
      (uncat.comments || []).forEach(function (c) {
        ingest("uncategorized", c, true);
      });
    }
    const keys = keyIds.map(function (keyId, i) {
      const section = sections[keyId] || {};
      const tally = section.tally || (section.comments || []).length || 0;
      return {
        id: keyId,
        title: humanizeKey(keyId),
        rank: i + 1,
        prominence: tally,
        summary: stripHtml(section.position_html) || "Standing perspective in this debate.",
        countersTo: counters[keyId] || [],
      };
    });
    keys.sort(function (a, b) {
      return b.prominence - a.prominence || a.rank - b.rank;
    });
    keys.forEach(function (k, i) {
      k.rank = i + 1;
    });
    const posts = Object.keys(postsById).map(function (id) {
      return postsById[id];
    });
    const activity = [];
    (view.activity || []).slice().reverse().forEach(function (row) {
      if (!row) return;
      activity.push({
        id: String(row.id),
        kind: row.kind === "batch" ? "batch" : "live",
        text:
          row.kind === "batch"
            ? row.body || "Board updated"
            : row.mine
              ? "Your point is live"
              : (row.author || "Participant") + " contributed a point",
        at: clockAt(),
        highlight: false,
      });
    });
    return {
      topic: {
        id: topicId,
        title: pageTitle || store.pageLabel || humanizeKey(topicId),
        invite: "Explore the main perspectives, then add your own point.",
      },
      keys: keys,
      posts: posts,
      activity: activity,
    };
  }

  function pushActivity(kind, text, highlight) {
    store.board.activity.unshift({
      id: "a" + Date.now(),
      kind: kind,
      text: text,
      at: clockAt(),
      highlight: !!highlight,
    });
    store.board.activity.forEach(function (a, i) {
      if (i > 0) a.highlight = false;
    });
  }

  async function activeTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs[0] ? tabs[0] : null;
  }

  async function apiPost(payload) {
    const response = await fetch(store.apiBase + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "The debate could not be saved.");
    if (data.visitor) await rememberVisitor(data.visitor);
    return data;
  }

  async function call(payload) {
    const visitor = await ensureVisitor();
    return apiPost({ visitor: visitor, topic: store.topic, ...payload });
  }

  async function getView() {
    const visitor = await ensureVisitor();
    const params = new URLSearchParams({
      topic: store.topic,
      visitor: visitor,
      action: "view",
    });
    const response = await fetch(store.apiBase + "/api/chat?" + params.toString());
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "The debate could not be read.");
    if (data.visitor && data.visitor.uuid) await rememberVisitor(data.visitor.uuid);
    return data;
  }

  async function resolveOnServer(opts) {
    const o = opts || {};
    const visitor = await cachedVisitor();
    if (o.forcedTopic && STARTERS[o.forcedTopic]) {
      return apiPost({
        action: "resolve",
        url: "https://api.clevertree.chat/chat/" + o.forcedTopic,
        visitor: visitor || undefined,
      });
    }
    const tab = await activeTab();
    const href = (tab && tab.url) || "";
    const normalized = domainNormalized(href);
    return apiPost({
      action: "resolve",
      url: href || "",
      normalized: normalized || undefined,
      page_scope: "domain",
      visitor: visitor || undefined,
    });
  }

  function applyView(view) {
    store.board = viewToBoard(view, store.topic);
    if (!store.expandedKeyId && store.board.keys[0]) {
      store.expandedKeyId = store.board.keys[0].id;
    }
  }

  function postsForKey(keyId) {
    return store.board.posts.filter(function (p) {
      return p.keys.indexOf(keyId) >= 0 || (p.provisionalKeys || []).indexOf(keyId) >= 0;
    });
  }

  function unfiledPosts() {
    return store.board.posts.filter(function (p) {
      return (!p.keys || !p.keys.length) && !(p.provisionalKeys || []).length;
    });
  }

  function postCardHtml(post) {
    const chips = (post.keys || [])
      .map(function (id) {
        return '<span class="ct-chip">' + escapeHtml(humanizeKey(id)) + "</span>";
      })
      .join("");
    const prov = (post.provisionalKeys || [])
      .map(function (id) {
        return '<span class="ct-chip ct-chip--provisional">' + escapeHtml(humanizeKey(id)) + "</span>";
      })
      .join("");
    const who =
      post.author === "me"
        ? '<span class="ct-who--me">You</span>'
        : "<span>Participant</span>";
    return (
      '<article class="ct-post"><div class="ct-post-meta">' +
      who +
      chips +
      prov +
      '</div><p class="ct-post-body">' +
      escapeHtml(post.body) +
      "</p></article>"
    );
  }

  function renderBoard() {
    const keys = store.board.keys;
    const unfiled = unfiledPosts();
    let html = "";
    if (!keys.length && !unfiled.length) {
      html +=
        '<p class="ct-invite">Nothing on this site yet — add the first point. The board stays empty until you write.</p>';
    } else {
      html += '<p class="ct-invite">' + escapeHtml(store.board.topic.invite) + "</p>";
    }
    keys.forEach(function (key) {
      const expanded = store.expandedKeyId === key.id;
      const posts = postsForKey(key.id);
      html += '<article class="ct-pcard' + (expanded ? " is-expanded" : "") + '">';
      html +=
        '<button type="button" class="ct-pcard-toggle" data-expand="' +
        escapeHtml(key.id) +
        '"><span class="ct-rank">' +
        String(key.rank).padStart(2, "0") +
        '</span><span class="ct-pcard-title">' +
        escapeHtml(key.title) +
        '</span><span class="ct-pcard-meta">' +
        posts.length +
        " pts</span></button>";
      if (expanded) {
        html += '<p class="ct-summary">' + escapeHtml(key.summary) + "</p>";
        html +=
          posts.slice(0, 5).map(postCardHtml).join("") ||
          '<p class="ct-muted">No points yet.</p>';
        if (key.countersTo && key.countersTo.length) {
          html +=
            '<ul class="ct-counter-list">' +
            key.countersTo
              .map(function (id) {
                return "<li>" + escapeHtml(humanizeKey(id)) + "</li>";
              })
              .join("") +
            "</ul>";
        }
      }
      html += "</article>";
    });
    html +=
      '<div class="ct-unfiled"><h3>Unfiled' +
      (unfiled.length ? " · " + unfiled.length : "") +
      "</h3>" +
      (unfiled.length
        ? unfiled.map(postCardHtml).join("")
        : '<p class="ct-muted">Nothing waiting.</p>') +
      "</div>";
    els.board.innerHTML = html;
  }

  function renderActivity() {
    els.activity.innerHTML = store.board.activity
      .slice(0, 12)
      .map(function (a) {
        return (
          '<li class="ct-act ct-act--' +
          escapeHtml(a.kind) +
          (a.highlight ? " is-highlight" : "") +
          '"><span class="ct-act-dot" aria-hidden="true"></span><div><span class="ct-act-time">' +
          escapeHtml(a.at) +
          "</span> " +
          escapeHtml(a.text) +
          "</div></li>"
        );
      })
      .join("");
  }

  function render() {
    els.status.dataset.live = store.liveState;
    els.status.textContent = store.liveText + (store.busy ? " · Posting…" : "");
    const pinned = !!store.pinTopic;
    els.badge.textContent = pinned ? "Demo" : "Site";
    els.badge.dataset.mode = pinned ? "demo" : "page";
    els.title.textContent = store.board.topic.title;
    els.page.textContent = store.pageNorm || store.pageLabel || store.topic || "—";
    els.page.title = store.pageUrl || store.pageNorm;
    els.count.textContent =
      store.board.keys.length +
      " perspectives · " +
      store.board.posts.length +
      " points";
    els.coachBox.hidden = store.coachSeen;
    els.hint.textContent =
      "One debate per site. Empty until you write. Soft tags may be revised by batch.";
    renderBoard();
    renderActivity();
    els.btnPost.disabled = store.busy;
  }

  function setStatus(msg, isError) {
    if (!msg) {
      els.statusMsg.hidden = true;
      els.statusMsg.textContent = "";
      return;
    }
    els.statusMsg.hidden = false;
    els.statusMsg.textContent = msg;
    els.statusMsg.style.color = isError ? "#a33" : "var(--ct-ink-soft)";
  }

  async function refresh() {
    const view = await getView();
    applyView(view);
    render();
    return view;
  }

  async function submitPost(body) {
    store.busy = true;
    setStatus("");
    render();
    try {
      const filed = await call({ action: "submit", body: body });
      if (filed.view) applyView(filed.view);
      pushActivity("live", "Your point is live", true);
      await markCoachSeen();
      els.body.value = "";
    } catch (err) {
      setStatus(err.message || "Could not post.", true);
      store.liveState = "error";
      store.liveText = "Error";
    } finally {
      store.busy = false;
      render();
    }
  }

  async function connectWs() {
    if (store.socket) {
      try {
        store.socket.close();
      } catch (e) {}
      store.socket = null;
    }
    const visitor = await ensureVisitor();
    const base = store.apiBase;
    let ws;
    try {
      const u = new URL(base);
      u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
      u.pathname = "/api/chat/ws";
      u.search =
        "?topic=" +
        encodeURIComponent(store.topic) +
        "&visitor=" +
        encodeURIComponent(visitor);
      ws = new WebSocket(u.toString());
    } catch (e) {
      store.liveState = "error";
      store.liveText = "Socket failed";
      render();
      return;
    }
    store.socket = ws;
    ws.addEventListener("open", function () {
      store.liveState = "open";
      store.liveText = "Connected";
      render();
    });
    ws.addEventListener("close", function () {
      store.liveState = "closed";
      store.liveText = "Reconnecting…";
      render();
      window.clearTimeout(store.reconnectTimer);
      store.reconnectTimer = window.setTimeout(connectWs, 1600);
    });
    ws.addEventListener("message", async function (event) {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (e) {
        return;
      }
      const visitor = await ensureVisitor();
      if (msg.type === "hello") {
        if (msg.view) applyView(msg.view);
        render();
        return;
      }
      if (msg.type === "post.live" && msg.comment) {
        const mine = msg.comment.author_uuid === visitor;
        if (mine && store.busy) return;
        if (msg.view) applyView(msg.view);
        pushActivity(
          "live",
          mine ? "Your point is live" : "Participant contributed a point",
          true
        );
        render();
        return;
      }
      if (msg.type === "batch.notice") {
        if (msg.view) applyView(msg.view);
        pushActivity("batch", msg.notice || "Organizing in background", true);
        render();
        return;
      }
      if (msg.type === "board.snapshot" && msg.view) {
        applyView(msg.view);
        pushActivity("batch", "Board updated", true);
        render();
      }
    });
  }

  async function bindTopic(opts) {
    const o = opts || {};
    store.expandedKeyId = null;
    store.liveText = "Resolving…";
    store.liveState = "closed";
    if (o.forcedTopic) store.pinTopic = o.forcedTopic;
    else if (!o.keepPin) store.pinTopic = "";
    render();
    try {
      const resolved = await resolveOnServer(o);
      store.topic = resolved.topic;
      store.pageUrl = resolved.url || store.pageUrl || "";
      store.pageNorm = resolved.normalized || resolved.topic;
      store.pageLabel = resolved.title || STARTERS[resolved.topic] || resolved.topic;
      if (resolved.view) applyView(resolved.view);
      else store.board = emptyBoard(store.topic, store.pageLabel);
      setStatus("");
      render();
      if (!resolved.view) await refresh();
    } catch (err) {
      setStatus(err.message || "Could not resolve page on server.", true);
      store.liveState = "error";
      store.liveText = "Error";
      render();
      return;
    }
    await connectWs();
  }

  els.board.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-expand]");
    if (!btn) return;
    const id = btn.getAttribute("data-expand");
    store.expandedKeyId = store.expandedKeyId === id ? null : id;
    render();
  });

  els.btnCoachSkip.addEventListener("click", function () {
    markCoachSeen().then(render);
  });
  document.getElementById("btn-refresh").addEventListener("click", function () {
    bindTopic();
  });
  document.getElementById("btn-flock").addEventListener("click", function () {
    bindTopic({ forcedTopic: "flock-cameras" });
  });
  document.getElementById("btn-thc").addEventListener("click", function () {
    bindTopic({ forcedTopic: "thc-legalization" });
  });

  els.composer.addEventListener("submit", function (e) {
    e.preventDefault();
    const body = els.body.value.trim();
    if (!body || store.busy) return;
    submitPost(body);
  });

  chrome.tabs.onActivated.addListener(function () {
    if (store.pinTopic) return;
    bindTopic();
  });
  chrome.tabs.onUpdated.addListener(function (tabId, info, tab) {
    if (info.status !== "complete" || !tab.active) return;
    if (store.pinTopic) return;
    bindTopic();
  });

  readPrefs()
    .then(function () {
      return bindTopic();
    })
    .catch(function (err) {
      setStatus(err.message || "Startup failed.", true);
    });
})();
