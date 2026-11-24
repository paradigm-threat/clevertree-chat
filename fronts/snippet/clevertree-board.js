/**
 * Clevertree Debate board — live durable widget.
 * Mount: <div data-clevertree-board data-api="chat" data-topic="flock-cameras"></div>
 * Or URL room: data-url="https://example.com" data-api-base="https://api.clevertree.chat"
 * Host: HTTP /api/chat + WS /api/chat/ws. First-use coach is skippable UI only.
 * Comments SoT path is created only on first submit — resolve/view stay empty.
 */
(function () {
  const VISITOR_KEY = "clevertree.visitor";
  const COACH_KEY = "clevertree.coachSeen";

  function visitorId() {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  }

  function coachSeen() {
    try {
      return localStorage.getItem(COACH_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function markCoachSeen() {
    try {
      localStorage.setItem(COACH_KEY, "1");
    } catch (e) {}
  }

  function apiBase(el) {
    const custom = el.getAttribute("data-api-base");
    return custom ? custom.replace(/\/$/, "") : "";
  }

  function fetchCreds(el) {
    // Cross-origin mounts (clevertree.chat → api) send visitor in the body.
    return apiBase(el) ? "omit" : "same-origin";
  }

  function apiPath(el) {
    const mode = el.getAttribute("data-api") || "chat";
    // live/debate/demo all hit the durable chat host path now
    if (mode === "live" || mode === "debate") return "/api/debate";
    return "/api/chat";
  }

  function topicOf(el) {
    return (el.getAttribute("data-topic") || "").trim();
  }

  function pageTitleOf(el, topicId) {
    const custom = (el.getAttribute("data-title") || "").trim();
    if (custom) return custom;
    return topicTitle(topicId);
  }

  function wsUrl(el) {
    const base = apiBase(el);
    const path = "/api/chat/ws";
    const q =
      "?topic=" +
      encodeURIComponent(topicOf(el)) +
      "&visitor=" +
      encodeURIComponent(visitorId());
    if (base) {
      const u = new URL(base);
      u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
      return u.origin + path + q;
    }
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return proto + "//" + location.host + path + q;
  }

  async function resolveUrlRoom(el) {
    const href = (el.getAttribute("data-url") || "").trim();
    if (!href) return topicOf(el);
    const response = await fetch(apiBase(el) + apiPath(el), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: fetchCreds(el),
      body: JSON.stringify({
        action: "resolve",
        url: href,
        visitor: visitorId(),
        page_scope: (el.getAttribute("data-page-scope") || "").trim() || undefined,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not resolve page.");
    if (data.visitor) {
      try {
        localStorage.setItem(VISITOR_KEY, data.visitor);
      } catch (e) {}
    }
    if (data.topic) el.setAttribute("data-topic", data.topic);
    if (data.title) el.setAttribute("data-title", data.title);
    if (data.normalized) el.setAttribute("data-normalized", data.normalized);
    if (data.url) el.setAttribute("data-url", data.url);
    return data.topic || "";
  }

  async function call(el, payload) {
    const response = await fetch(apiBase(el) + apiPath(el), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: fetchCreds(el),
      body: JSON.stringify({ visitor: visitorId(), topic: topicOf(el), ...payload }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "The debate could not be saved.");
    return data;
  }

  async function getView(el) {
    const params = new URLSearchParams({
      topic: topicOf(el),
      visitor: visitorId(),
      action: "view",
    });
    const response = await fetch(apiBase(el) + apiPath(el) + "?" + params.toString(), {
      credentials: fetchCreds(el),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "The debate could not be read.");
    return data;
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

  function emptyBoard(topicId, title) {
    return {
      topic: {
        id: topicId,
        title: title || humanizeKey(topicId) || "Standing debate",
        invite:
          "Nothing here yet — add the first point. The board stays empty until you write.",
      },
      keys: [],
      posts: [],
      activity: [],
    };
  }

  function topicTitle(topicId) {
    if (topicId === "flock-cameras") return "Should cities use camera networks?";
    if (topicId === "thc-legalization") return "Should adult-use cannabis be legal?";
    if (!topicId) return "Standing debate";
    if (String(topicId).indexOf("u-") === 0) return "This page";
    return humanizeKey(topicId) || "Standing debate";
  }

  /** Map host build_view → board store. */
  function viewToBoard(view, topicId, title) {
    if (!view || !view.exists) {
      return emptyBoard(topicId, title || topicTitle(topicId));
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
    keyIds.forEach(function (keyId) {
      const section = sections[keyId] || {};
      (section.comments || []).forEach(function (c) {
        const id = String(c.id);
        if (!postsById[id]) {
          postsById[id] = {
            id: id,
            body: c.text || stripHtml(c.html) || "",
            keys: [],
            provisionalKeys: [],
            author: c.mine ? "me" : "peer",
            simulated: !!c.injected,
            flagged: null,
            createdAt: "",
          };
        }
        const keys = (c.keys || []).filter(function (k) {
          return k && k !== "uncategorized";
        });
        if (!keys.length && keyId !== "uncategorized") keys.push(keyId);
        keys.forEach(function (k) {
          if (postsById[id].keys.indexOf(k) < 0) postsById[id].keys.push(k);
        });
      });
    });

    const uncat = sections.uncategorized;
    if (uncat) {
      (uncat.comments || []).forEach(function (c) {
        const id = String(c.id);
        if (!postsById[id]) {
          postsById[id] = {
            id: id,
            body: c.text || stripHtml(c.html) || "",
            keys: [],
            provisionalKeys: c.starting && c.starting !== "uncategorized" ? [c.starting] : [],
            author: c.mine ? "me" : "peer",
            simulated: !!c.injected,
            flagged: null,
            createdAt: "",
          };
        } else if (!postsById[id].keys.length && c.starting && c.starting !== "uncategorized") {
          postsById[id].provisionalKeys = [c.starting];
        }
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
        counterLabels: {},
        responsesToCounters: [],
      };
    });

    keys.sort(function (a, b) {
      return b.prominence - a.prominence || a.rank - b.rank;
    });
    keys.forEach(function (k, i) {
      k.rank = i + 1;
    });

    const posts = Object.keys(postsById)
      .map(function (id) {
        return postsById[id];
      })
      .sort(function (a, b) {
        return (parseInt(b.id, 10) || 0) - (parseInt(a.id, 10) || 0);
      });

    const activity = [];
    (view.activity || []).slice().reverse().forEach(function (row) {
      if (!row) return;
      activity.push({
        id: String(row.id),
        kind: row.kind === "batch" ? "batch" : "live",
        text:
          row.kind === "batch"
            ? row.body || view.batch_notice || "Board updated"
            : row.mine
              ? "Your point is live"
              : row.injected
                ? "Simulated participant added a point"
                : (row.author || "Participant") + " contributed a point",
        at: clockAt(),
        highlight: false,
      });
    });
    if (view.batch_notice && !activity.some(function (a) {
      return a.kind === "batch" && a.text === view.batch_notice;
    })) {
      activity.unshift({
        id: "batch-notice",
        kind: "batch",
        text: view.batch_notice,
        at: clockAt(),
        highlight: false,
      });
    }

    return {
      topic: {
        id: topicId,
        title: title || topicTitle(topicId),
        invite: "Explore the main perspectives, then add your own point.",
      },
      keys: keys,
      posts: posts,
      activity: activity,
    };
  }

  function pushActivity(store, kind, text, highlight) {
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

  function mount(el) {
    if (el._boardMounted) return;
    el._boardMounted = true;
    el.classList.add("clevertree-board");

    const store = {
      board: emptyBoard(topicOf(el), pageTitleOf(el, topicOf(el))),
      coachOpen: !coachSeen(),
      coachStep: 0,
      selectedKeyId: null,
      expandedKeyId: null,
      focusLink: null,
      revealedFlags: new Set(),
      draft: "",
      draftKeys: [],
      activityOpen: false,
      mobileTab: "perspectives",
      mainTab: "board",
      composerOpen: false,
      savedScroll: 0,
      liveState: "closed",
      liveText: "Connecting…",
      status: "",
      busy: false,
      outboxPending: [],
    };

    const COACH_STEPS = [
      "Write a point in your own words — no reply threads.",
      "Perspectives are keys: distinct angles, not winners.",
      "Activity shows what just happened on the board.",
      "SI organizes the map; it does not vote or pick sides.",
    ];

    function connectedLabel() {
      return "Live";
    }

    function reconnectLabel() {
      return "Reconnecting…";
    }

    function applyView(view, opts) {
      const o = opts || {};
      const tid = topicOf(el);
      const pageMeta = (view && view.page) || {};
      if (pageMeta.title) el.setAttribute("data-title", pageMeta.title);
      store.board = viewToBoard(view, tid, pageTitleOf(el, tid));
      if (!store.selectedKeyId && store.board.keys[0]) {
        store.selectedKeyId = store.board.keys[0].id;
        store.expandedKeyId = store.board.keys[0].id;
      }
      if (o.highlightActivity) {
        if (store.board.activity[0]) store.board.activity[0].highlight = true;
      }
    }

    function dismissCoach() {
      store.coachOpen = false;
      markCoachSeen();
      rerender();
    }

    function advanceCoach() {
      if (store.coachStep >= COACH_STEPS.length - 1) {
        dismissCoach();
        return;
      }
      store.coachStep += 1;
      rerender();
    }

    function keyById(id) {
      return store.board.keys.find(function (k) {
        return k.id === id;
      });
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

    function chipHtml(keyId, provisional) {
      const key = keyById(keyId);
      const label = key ? key.title : humanizeKey(keyId);
      return (
        '<span class="ct-chip' +
        (provisional ? " ct-chip--provisional" : "") +
        '">' +
        escapeHtml(label) +
        "</span>"
      );
    }

    function postCardHtml(post) {
      const chips = (post.keys || []).map(function (id) {
        return chipHtml(id, false);
      }).join("");
      const prov = (post.provisionalKeys || []).map(function (id) {
        return chipHtml(id, true);
      }).join("");
      const who =
        post.author === "me"
          ? '<span class="ct-who ct-who--me">You</span>'
          : post.simulated
            ? '<span class="ct-who ct-who--sim">Simulated participant</span>'
            : '<span class="ct-who">Participant</span>';
      const avatar =
        post.author === "me"
          ? '<span class="ct-avatar ct-avatar--me" aria-hidden="true">Y</span>'
          : '<span class="ct-avatar" aria-hidden="true">S</span>';
      return (
        '<article class="ct-post"><div class="ct-post-meta">' +
        avatar +
        who +
        '<span class="ct-chips">' +
        chips +
        prov +
        "</span></div><p class=\"ct-post-body\">" +
        escapeHtml(post.body) +
        "</p></article>"
      );
    }

    function activityHtml() {
      return (
        '<ul class="ct-activity-list">' +
        store.board.activity
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
          .join("") +
        "</ul>"
      );
    }

    function coachBoxHtml() {
      if (!store.coachOpen) return "";
      const step = store.coachStep;
      const msg = COACH_STEPS[step] || COACH_STEPS[0];
      const last = step >= COACH_STEPS.length - 1;
      return (
        '<aside class="ct-demo-box ct-coach-box" role="region" aria-label="Quick tour">' +
        '<p class="ct-demo-kicker">Quick tour · ' +
        (step + 1) +
        "/" +
        COACH_STEPS.length +
        "</p><p>" +
        escapeHtml(msg) +
        '</p><div class="ct-demo-actions">' +
        '<button type="button" class="ct-text-btn" data-coach-next>' +
        (last ? "Done" : "Next") +
        "</button>" +
        '<button type="button" class="ct-text-btn" data-coach-skip>Skip</button>' +
        "</div></aside>"
      );
    }

    function composerHtml() {
      const keys = store.board.keys
        .map(function (k) {
          const on = store.draftKeys.indexOf(k.id) >= 0;
          return (
            '<label class="ct-key-opt"><input type="checkbox" data-draft-key="' +
            escapeHtml(k.id) +
            '"' +
            (on ? " checked" : "") +
            "> " +
            escapeHtml(k.title) +
            "</label>"
          );
        })
        .join("");
      if (!store.composerOpen) {
        return (
          '<div class="ct-composer-dock"><button type="button" class="ct-composer-launch" data-open-composer>Add your perspective</button></div>' +
          '<form class="ct-composer ct-composer--wide-only" data-composer>' +
          '<div class="ct-composer-head"><label class="ct-composer-label" for="ct-body-wide">Add your perspective</label></div>' +
          '<textarea id="ct-body-wide" name="body" rows="3" placeholder="What would you like to say?" data-draft-body>' +
          escapeHtml(store.draft) +
          "</textarea>" +
          '<div class="ct-composer-tools">' +
          '<details class="ct-key-picker"><summary>Link perspectives (optional)</summary><div class="ct-key-opts">' +
          keys +
          '</div></details><button type="submit" class="ct-post-btn"' +
          (store.busy ? " disabled" : "") +
          ">Post</button></div>" +
          '<p class="ct-composer-hint">No title needed. Soft tags may be revised by batch.</p></form>'
        );
      }
      return (
        '<form class="ct-composer ct-composer--sheet" data-composer>' +
        '<div class="ct-composer-head"><label class="ct-composer-label" for="ct-body">Add your perspective</label>' +
        '<button type="button" class="ct-linkish" data-close-composer>Close</button></div>' +
        '<textarea id="ct-body" name="body" rows="3" placeholder="What would you like to say?" data-draft-body>' +
        escapeHtml(store.draft) +
        "</textarea>" +
        '<div class="ct-composer-tools">' +
        '<details class="ct-key-picker"><summary>Link perspectives (optional)</summary><div class="ct-key-opts">' +
        keys +
        '</div></details><button type="submit" class="ct-post-btn"' +
        (store.busy ? " disabled" : "") +
        ">Post</button></div></form>"
      );
    }

    function perspectiveCard(key, expanded) {
      const posts = postsForKey(key.id);
      const counters = (key.countersTo || [])
        .map(function (id) {
          const k = keyById(id);
          return (
            '<li><button type="button" class="ct-counter-chip" data-focus-from="' +
            escapeHtml(key.id) +
            '" data-focus-to="' +
            escapeHtml(id) +
            '">' +
            escapeHtml(k ? k.title : humanizeKey(id)) +
            "</button></li>"
          );
        })
        .join("");
      if (!expanded) {
        return (
          '<article class="ct-pcard"><button type="button" class="ct-pcard-toggle" data-expand-key="' +
          escapeHtml(key.id) +
          '" aria-expanded="false"><span class="ct-rank">' +
          String(key.rank).padStart(2, "0") +
          '</span><span class="ct-pcard-title">' +
          escapeHtml(key.title) +
          '</span><span class="ct-pcard-meta">' +
          posts.length +
          ' points</span><span class="ct-chevron" aria-hidden="true">›</span></button></article>'
        );
      }
      return (
        '<article class="ct-pcard is-expanded"><button type="button" class="ct-pcard-toggle" data-expand-key="' +
        escapeHtml(key.id) +
        '" aria-expanded="true"><span class="ct-rank">' +
        String(key.rank).padStart(2, "0") +
        '</span><span class="ct-pcard-title">' +
        escapeHtml(key.title) +
        '</span><span class="ct-chevron is-open" aria-hidden="true">›</span></button>' +
        '<p class="ct-summary">' +
        escapeHtml(key.summary) +
        '</p><div class="ct-pcard-cols"><div class="ct-pcard-col"><h3>Recent points</h3><div class="ct-posts">' +
        (posts
          .slice(0, 6)
          .map(postCardHtml)
          .join("") || '<p class="ct-muted">No points yet.</p>') +
        '</div></div><div class="ct-pcard-col"><h3>Common counterarguments</h3><ul class="ct-counter-list">' +
        (counters || '<li class="ct-muted">No linked counters yet.</li>') +
        "</ul></div></div></article>"
      );
    }

    function focusHtml() {
      const a = keyById(store.focusLink.from);
      const b = keyById(store.focusLink.to);
      if (!a || !b) return "";
      function side(key) {
        const posts = postsForKey(key.id);
        return (
          '<section class="ct-focus-side"><span class="ct-rank">' +
          String(key.rank).padStart(2, "0") +
          "</span><h2>" +
          escapeHtml(key.title) +
          '</h2><p class="ct-muted">' +
          posts.length +
          ' points</p><p class="ct-summary">' +
          escapeHtml(key.summary) +
          '</p><div class="ct-posts">' +
          posts.slice(0, 3).map(postCardHtml).join("") +
          "</div></section>"
        );
      }
      return (
        '<div class="ct-focus"><button type="button" class="ct-back" data-focus-back>← Back to all perspectives</button>' +
        '<p class="ct-focus-label">Focused comparison · This ↔ That</p>' +
        '<div class="ct-focus-grid">' +
        side(a) +
        '<div class="ct-focus-swap" aria-hidden="true"><span>↔</span></div>' +
        side(b) +
        "</div></div>"
      );
    }

    function boardListHtml() {
      const cards = store.board.keys
        .map(function (k) {
          return perspectiveCard(k, store.expandedKeyId === k.id);
        })
        .join("");
      const unfiled = unfiledPosts();
      const empty =
        !store.board.keys.length && !unfiled.length
          ? '<p class="ct-invite ct-invite--empty">No perspectives yet — be the first to add a point.</p>'
          : "";
      return (
        '<div class="ct-board-scroll" data-board-scroll>' +
        empty +
        cards +
        '<section class="ct-unfiled"><h3 class="ct-unfiled-title">Unfiled' +
        (unfiled.length ? " · " + unfiled.length + " awaiting organization" : "") +
        "</h3>" +
        (unfiled.length
          ? unfiled.map(postCardHtml).join("")
          : '<p class="ct-muted">Nothing waiting.</p>') +
        "</section></div>"
      );
    }

    function aboutHtml() {
      return (
        '<div class="ct-about" data-board-scroll><h2>About this debate</h2>' +
        "<p>Standing debate on a durable board. SI organizes perspectives; it does not vote or pick winners. Humans alone supply preference.</p>" +
        coachBoxHtml() +
        "</div>"
      );
    }

    function mapHtml() {
      const keys = store.board.keys;
      if (!keys.length) {
        return '<div class="ct-map-pane"><p class="ct-muted">No perspectives to map yet.</p></div>';
      }
      const n = keys.length;
      const nodes = keys.map(function (k, i) {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        return {
          id: k.id,
          x: 200 + Math.cos(angle) * 100,
          y: 150 + Math.sin(angle) * 100,
          key: k,
        };
      });
      const byId = {};
      nodes.forEach(function (n) {
        byId[n.id] = n;
      });
      let edges = "";
      keys.forEach(function (k) {
        (k.countersTo || []).forEach(function (to) {
          if (k.id >= to) return;
          const A = byId[k.id];
          const B = byId[to];
          if (!A || !B) return;
          edges +=
            '<line class="ct-edge" x1="' +
            A.x +
            '" y1="' +
            A.y +
            '" x2="' +
            B.x +
            '" y2="' +
            B.y +
            '" data-focus-from="' +
            escapeHtml(k.id) +
            '" data-focus-to="' +
            escapeHtml(to) +
            '" />';
        });
      });
      const circles = nodes
        .map(function (n) {
          return (
            '<g class="ct-node" data-expand-key="' +
            escapeHtml(n.id) +
            '" transform="translate(' +
            n.x +
            "," +
            n.y +
            ')"><circle r="18"/><text y="4">' +
            String(n.key.rank).padStart(2, "0") +
            '</text><text class="ct-node-label" y="32">' +
            escapeHtml(n.key.title.length > 22 ? n.key.title.slice(0, 20) + "…" : n.key.title) +
            "</text></g>"
          );
        })
        .join("");
      return (
        '<div class="ct-map-pane"><p class="ct-muted">Map of links — click an edge for this ↔ that.</p>' +
        '<svg class="ct-canvas-svg" viewBox="0 0 400 320">' +
        edges +
        circles +
        "</svg></div>"
      );
    }

    function rerender() {
      const n = store.board.keys.length;
      const pts = store.board.posts.length;
      let main = boardListHtml();
      if (store.mainTab === "map") main = mapHtml();
      if (store.mainTab === "about") main = aboutHtml();

      if (store.focusLink) {
        el.innerHTML =
          '<div class="ct-app"><p class="ct-status-line" data-live="' +
          escapeHtml(store.liveState) +
          '">' +
          escapeHtml(store.liveText) +
          (store.status ? " · " + escapeHtml(store.status) : "") +
          "</p>" +
          pendingPostsHtml() +
          focusHtml() +
          composerHtml() +
          "</div>";
      } else {
        el.innerHTML =
          '<div class="ct-app">' +
          '<p class="ct-status-line" data-live="' +
          escapeHtml(store.liveState) +
          '">' +
          escapeHtml(store.liveText) +
          (store.status ? " · " + escapeHtml(store.status) : "") +
          "</p>" +
          '<header class="ct-app-header"><div class="ct-app-brand"><span>Clevertree Chat</span>' +
          '<span class="ct-badge-live">Live</span>' +
          '</div><h2 class="ct-topic-title">' +
          escapeHtml(store.board.topic.title) +
          '</h2><div class="ct-app-meta">' +
          '<a class="ct-rules-link" href="https://clevertree.chat/dev" target="_blank" rel="noopener">House rules · SI organizes (Super Intelligence, i.e. AI)</a>' +
          '<span class="ct-count-pill">' +
          n +
          " perspectives · " +
          pts +
          " total points</span></div></header>" +
          pendingPostsHtml() +
          '<nav class="ct-tabs" aria-label="Board sections">' +
          '<button type="button" class="ct-tab' +
          (store.mainTab === "board" ? " is-active" : "") +
          '" data-main-tab="board">Debate board</button>' +
          '<button type="button" class="ct-tab' +
          (store.mainTab === "map" ? " is-active" : "") +
          '" data-main-tab="map">Map of links</button>' +
          '<button type="button" class="ct-tab' +
          (store.mainTab === "about" ? " is-active" : "") +
          '" data-main-tab="about">About</button></nav>' +
          '<div class="ct-mobile-tabs">' +
          '<button type="button" class="ct-mobile-tab' +
          (store.mobileTab === "perspectives" ? " is-active" : "") +
          '" data-mobile-tab="perspectives">Perspectives</button>' +
          '<button type="button" class="ct-mobile-tab' +
          (store.mobileTab === "activity" ? " is-active" : "") +
          '" data-mobile-tab="activity">Recent activity</button></div>' +
          '<div class="ct-app-body"><div class="ct-main' +
          (store.mobileTab === "activity" ? " is-mobile-hidden" : "") +
          '">' +
          main +
          '</div><div class="ct-rail-wrap' +
          (store.mobileTab === "perspectives" ? " is-mobile-hidden-rail" : "") +
          '"><aside class="ct-rail"><h2>Recent activity</h2>' +
          activityHtml() +
          coachBoxHtml() +
          "</aside></div></div>" +
          composerHtml() +
          "</div>";
      }

      el.querySelectorAll(".ct-edge").forEach(function (line) {
        line.style.cursor = "pointer";
        line.addEventListener("click", function () {
          store.focusLink = {
            from: line.getAttribute("data-focus-from"),
            to: line.getAttribute("data-focus-to"),
          };
          rerender();
        });
      });
    }

    async function refresh() {
      const view = await getView(el);
      applyView(view);
      rerender();
      return view;
    }

    function pendingPostsHtml() {
      const pending = store.outboxPending || [];
      if (!pending.length) return "";
      const items = pending
        .map(function (p) {
          const st =
            p.status === "failed"
              ? escapeHtml(p.lastError || "Failed")
              : p.status === "syncing"
                ? "Uploading…"
                : "On device · waiting for network";
          return (
            '<li class="ct-outbox-item" data-outbox-id="' +
            escapeHtml(p.clientPostId) +
            '"><p class="ct-post-body">' +
            escapeHtml(p.body) +
            '</p><p class="ct-muted">' +
            st +
            (p.status === "failed"
              ? ' <button type="button" class="ct-linkish" data-retry-outbox="' +
                escapeHtml(p.clientPostId) +
                '">Retry</button>'
              : "") +
            ' <button type="button" class="ct-linkish" data-discard-outbox="' +
            escapeHtml(p.clientPostId) +
            '">Discard</button></p></li>'
          );
        })
        .join("");
      return (
        '<div class="ct-outbox" role="status"><p class="ct-outbox-head"><strong>' +
        pending.length +
        " post" +
        (pending.length === 1 ? "" : "s") +
        " saved on this device</strong></p>" +
        '<p class="ct-muted">Uploads when the host is reachable. Clearing site data drops this queue.</p>' +
        '<ul class="ct-outbox-list">' +
        items +
        "</ul></div>"
      );
    }

    async function refreshOutboxUi() {
      const box = globalThis.ClevertreeOutbox;
      if (!box) {
        store.outboxPending = [];
        return;
      }
      try {
        const all = await box.listPending();
        const topic = topicOf(el);
        store.outboxPending = all.filter(function (p) {
          return !topic || p.topic === topic;
        });
      } catch (e) {
        store.outboxPending = [];
      }
    }

    async function submitPost(body, draftKeys) {
      store.busy = true;
      store.status = "Saving on device…";
      rerender();
      try {
        const chosen = draftKeys[0] || "";
        const box = globalThis.ClevertreeOutbox;
        if (!box) {
          const filed = await call(el, {
            action: "submit",
            body: body,
            chosen: chosen,
          });
          if (filed.view) applyView(filed.view, { highlightActivity: true });
          pushActivity(store, "live", "Your point is live", true);
        } else {
          await box.enqueue({
            topic: topicOf(el),
            visitorId: visitorId(),
            body: body,
            chosen: chosen,
            apiBase: apiBase(el),
            apiPath: apiPath(el),
          });
          await refreshOutboxUi();
          pushActivity(
            store,
            "live",
            navigator.onLine
              ? "Queued — syncing when the host accepts it"
              : "Queued on this device — will sync when you are online",
            true,
          );
          void box.flush().then(async function (summary) {
            await refreshOutboxUi();
            if (summary && summary.synced > 0) {
              try {
                await refresh();
                pushActivity(store, "live", "Synced from this device", true);
              } catch (e) {}
            }
            rerender();
          });
        }
        store.draft = "";
        store.draftKeys = [];
        store.composerOpen = false;
        store.status = "";
        dismissCoach();
      } catch (err) {
        store.status = err.message || "Could not post.";
        store.liveState = "error";
      } finally {
        store.busy = false;
        rerender();
      }
    }

    let socket = null;
    let reconnectTimer = 0;
    function connectWs() {
      try {
        socket = new WebSocket(wsUrl(el));
      } catch (e) {
        store.liveState = "error";
        store.liveText = "Socket failed";
        rerender();
        return;
      }
      socket.addEventListener("open", function () {
        store.liveState = "open";
        store.liveText = connectedLabel();
        rerender();
      });
      socket.addEventListener("close", function () {
        store.liveState = "closed";
        store.liveText = reconnectLabel();
        rerender();
        window.clearTimeout(reconnectTimer);
        reconnectTimer = window.setTimeout(connectWs, 1600);
      });
      socket.addEventListener("message", function (event) {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch (e) {
          return;
        }
        if (msg.type === "hello") {
          if (msg.view) applyView(msg.view);
          rerender();
          return;
        }
        if (msg.type === "post.live" && msg.comment) {
          const mine = msg.comment.author_uuid === visitorId();
          if (mine && store.busy) return;
          if (msg.view) applyView(msg.view);
          pushActivity(
            store,
            "live",
            mine ? "Your point is live" : "Participant contributed a point",
            true
          );
          rerender();
          return;
        }
        if (msg.type === "batch.notice") {
          if (msg.view) applyView(msg.view);
          pushActivity(store, "batch", msg.notice || "Organizing in background", true);
          rerender();
          return;
        }
        if (msg.type === "board.snapshot" && msg.view) {
          applyView(msg.view, { highlightActivity: true });
          pushActivity(store, "batch", "Board updated", true);
          rerender();
        }
      });
    }

    el.addEventListener("click", function (e) {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest("[data-coach-skip]")) {
        dismissCoach();
        return;
      }
      if (t.closest("[data-coach-next]")) {
        advanceCoach();
        return;
      }
      if (t.closest("[data-open-composer]")) {
        store.composerOpen = true;
        rerender();
        const ta = el.querySelector("[data-draft-body]");
        if (ta) ta.focus();
        return;
      }
      if (t.closest("[data-close-composer]")) {
        store.composerOpen = false;
        rerender();
        return;
      }
      const tab = t.closest("[data-main-tab]");
      if (tab) {
        store.mainTab = tab.getAttribute("data-main-tab");
        rerender();
        return;
      }
      const mtab = t.closest("[data-mobile-tab]");
      if (mtab) {
        store.mobileTab = mtab.getAttribute("data-mobile-tab");
        rerender();
        return;
      }
      const expand = t.closest("[data-expand-key]");
      if (expand) {
        const id = expand.getAttribute("data-expand-key");
        store.expandedKeyId = store.expandedKeyId === id ? null : id;
        store.selectedKeyId = id;
        store.mainTab = "board";
        rerender();
        return;
      }
      const focusFrom = t.closest("[data-focus-from]");
      if (focusFrom) {
        const boardEl = el.querySelector("[data-board-scroll]");
        store.savedScroll = boardEl ? boardEl.scrollTop : 0;
        store.focusLink = {
          from: focusFrom.getAttribute("data-focus-from"),
          to: focusFrom.getAttribute("data-focus-to"),
        };
        rerender();
        return;
      }
      if (t.closest("[data-focus-back]")) {
        store.focusLink = null;
        rerender();
        const boardEl = el.querySelector("[data-board-scroll]");
        if (boardEl) boardEl.scrollTop = store.savedScroll;
        return;
      }
      const retryBtn = t.closest("[data-retry-outbox]");
      if (retryBtn && globalThis.ClevertreeOutbox) {
        const id = retryBtn.getAttribute("data-retry-outbox");
        void globalThis.ClevertreeOutbox.retry(id).then(async function () {
          await refreshOutboxUi();
          try {
            await refresh();
          } catch (err) {}
          rerender();
        });
        return;
      }
      const discardBtn = t.closest("[data-discard-outbox]");
      if (discardBtn && globalThis.ClevertreeOutbox) {
        const id = discardBtn.getAttribute("data-discard-outbox");
        void globalThis.ClevertreeOutbox.discard(id).then(async function () {
          await refreshOutboxUi();
          rerender();
        });
      }
    });

    el.addEventListener("submit", function (e) {
      const form = e.target.closest("[data-composer]");
      if (!form) return;
      e.preventDefault();
      const ta = form.querySelector("[data-draft-body]");
      const body = (ta ? ta.value : store.draft).trim();
      if (!body || store.busy) return;
      const boxes = form.querySelectorAll("[data-draft-key]");
      const draftKeys = [];
      boxes.forEach(function (box) {
        if (box.checked) draftKeys.push(box.getAttribute("data-draft-key"));
      });
      store.draft = body;
      store.draftKeys = draftKeys;
      submitPost(body, draftKeys);
    });

    el.addEventListener("input", function (e) {
      const t = e.target;
      if (t && t.matches && t.matches("[data-draft-body]")) store.draft = t.value;
    });

    rerender();

    function startLive() {
      if (!topicOf(el)) {
        store.status = "Missing topic or URL.";
        store.liveState = "error";
        rerender();
        return;
      }
      refresh()
        .then(function () {
          connectWs();
        })
        .catch(function (err) {
          store.status = err.message || "Could not load debate.";
          store.liveState = "error";
          rerender();
        });
    }

    if (globalThis.ClevertreeOutbox) {
      globalThis.ClevertreeOutbox.armWake();
      globalThis.ClevertreeOutbox.subscribe(function () {
        void refreshOutboxUi().then(function () {
          rerender();
        });
      });
      void refreshOutboxUi().then(function () {
        rerender();
      });
    }

    if ((el.getAttribute("data-url") || "").trim()) {
      store.liveText = "Opening…";
      rerender();
      resolveUrlRoom(el)
        .then(function () {
          store.board = emptyBoard(topicOf(el), pageTitleOf(el, topicOf(el)));
          rerender();
          startLive();
        })
        .catch(function (err) {
          store.status = err.message || "Could not open this URL.";
          store.liveState = "error";
          rerender();
        });
    } else {
      startLive();
    }
  }

  function boot() {
    document.querySelectorAll("[data-clevertree-board]").forEach(mount);
  }

  if (typeof window !== "undefined") {
    window.ClevertreeBoard = { mount: mount, boot: boot };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
