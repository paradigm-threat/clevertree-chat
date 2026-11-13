/**
 * Clevertree Debate board — live guided-demo widget.
 * Mount: <div data-clevertree-board data-api="chat" data-topic="flock-cameras" data-guided="true"></div>
 * Host: HTTP /api/chat + WS /api/chat/ws. Demo pause is UI-only.
 */
(function () {
  const VISITOR_KEY = "clevertree.visitor";
  const DEMO_KEY = "clevertree.demoMode";

  function visitorId() {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  }

  function readDemoPref(guided) {
    if (!guided) return false;
    try {
      const v = localStorage.getItem(DEMO_KEY);
      if (v === "0") return false;
      if (v === "1") return true;
    } catch (e) {}
    return true;
  }

  function writeDemoPref(on) {
    try {
      localStorage.setItem(DEMO_KEY, on ? "1" : "0");
    } catch (e) {}
  }

  function apiBase(el) {
    const custom = el.getAttribute("data-api-base");
    return custom ? custom.replace(/\/$/, "") : "";
  }

  function apiPath(el) {
    const mode = el.getAttribute("data-api") || "chat";
    if (mode === "live") return "/api/debate";
    if (mode === "demo") return "/api/demo";
    return "/api/chat";
  }

  function topicOf(el) {
    return (el.getAttribute("data-topic") || "flock-cameras").trim();
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

  async function call(el, payload) {
    const response = await fetch(apiBase(el) + apiPath(el), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
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
      credentials: "same-origin",
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
        invite: "Explore the main perspectives, then add your own point.",
      },
      keys: [],
      posts: [],
      activity: [],
    };
  }

  function topicTitle(topicId) {
    if (topicId === "flock-cameras") return "Should cities use camera networks?";
    if (topicId === "thc-legalization") return "Should adult-use cannabis be legal?";
    return humanizeKey(topicId) || "Standing debate";
  }

  /** Map host build_view → board store. */
  function viewToBoard(view, topicId) {
    if (!view || !view.exists) {
      return emptyBoard(topicId, topicTitle(topicId));
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
        title: topicTitle(topicId),
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

    const guided = (el.getAttribute("data-guided") || "true") !== "false";
    const topicId = topicOf(el);

    const store = {
      board: emptyBoard(topicId),
      demoMode: readDemoPref(guided),
      demoPaused: false,
      demoQueue: [],
      demoMessage: "",
      demoStepLabel: "",
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
      liveText: guided ? "Demo · connecting…" : "Connecting…",
      status: "",
      busy: false,
    };

    function connectedLabel() {
      return guided ? "Demo · connected" : "Live";
    }

    function reconnectLabel() {
      return guided ? "Demo · reconnecting…" : "Reconnecting…";
    }

    function applyView(view, opts) {
      const o = opts || {};
      store.board = viewToBoard(view, topicId);
      if (!store.selectedKeyId && store.board.keys[0]) {
        store.selectedKeyId = store.board.keys[0].id;
        store.expandedKeyId = store.board.keys[0].id;
      }
      if (o.highlightActivity) {
        if (store.board.activity[0]) store.board.activity[0].highlight = true;
      }
    }

    function pauseOrApply(beat) {
      if (!store.demoMode) {
        if (typeof beat.apply === "function") beat.apply();
        rerender();
        return;
      }
      store.demoQueue.push(beat);
      if (!store.demoPaused) advanceDemo();
      else rerender();
    }

    function advanceDemo() {
      const next = store.demoQueue.shift();
      if (!next) {
        store.demoPaused = false;
        store.demoMessage = "";
        store.demoStepLabel = "";
        rerender();
        return;
      }
      if (typeof next.apply === "function") next.apply();
      store.demoPaused = true;
      store.demoMessage = next.message || "Something updated.";
      store.demoStepLabel = next.label || "Update";
      rerender();
    }

    function continueDemo() {
      if (!store.demoPaused) return;
      advanceDemo();
    }

    function setDemoMode(on) {
      store.demoMode = !!on && guided;
      writeDemoPref(store.demoMode);
      if (!store.demoMode) {
        while (store.demoQueue.length) {
          const b = store.demoQueue.shift();
          if (typeof b.apply === "function") b.apply();
        }
        store.demoPaused = false;
        store.demoMessage = "";
      }
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

    function demoBoxHtml() {
      if (!guided) return "";
      if (!store.demoMode) {
        return (
          '<aside class="ct-demo-box ct-demo-box--off"><h3>Guided demo is off</h3>' +
          "<p>Updates arrive continuously.</p>" +
          '<button type="button" class="ct-text-btn" data-demo-on>Enable demo mode</button></aside>'
        );
      }
      const paused = store.demoPaused;
      const msg =
        store.demoMessage ||
        "You’re in a guided debate. It pauses after each update so you can see what changed — simulated peers and AI organization included.";
      return (
        '<aside class="ct-demo-box' +
        (paused ? " is-paused" : "") +
        '"><div class="ct-demo-box-top"><div>' +
        '<p class="ct-demo-kicker">Interactive demo</p><h3>' +
        escapeHtml(paused ? store.demoStepLabel || "Paused" : "Guided walkthrough") +
        "</h3><p>" +
        escapeHtml(msg) +
        '</p></div><button type="button" class="ct-demo-play" data-demo-continue aria-label="Continue"' +
        (paused ? "" : " disabled") +
        '><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></button></div>' +
        '<div class="ct-demo-actions">' +
        (paused
          ? '<button type="button" class="ct-text-btn" data-demo-continue>Continue</button>'
          : "") +
        '<button type="button" class="ct-text-btn" data-demo-off>Disable demo mode</button>' +
        '<button type="button" class="ct-text-btn" data-reset>Reset</button>' +
        '</div><p class="ct-demo-note">UI-only pause · the server is not waiting</p></aside>'
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
          ? guided
            ? '<p class="ct-invite">Demo start — post a point below. The script will organize it and a simulated peer may reply.</p>'
            : '<p class="ct-invite">No perspectives yet — be the first to add a point.</p>'
          : '<p class="ct-invite">' + escapeHtml(store.board.topic.invite) + "</p>";
      return (
        '<div class="ct-board-scroll" data-board-scroll>' +
        empty +
        cards +
        '<section class="ct-unfiled"><h3>Unfiled' +
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
        '<div class="ct-about" data-board-scroll><h2>About this demo</h2>' +
        "<p>This is an <strong>interactive product demo</strong>, not a live hosted topic. Simulated peers are labeled. Demo pauses are <strong>UI-only</strong> — the server keeps going.</p>" +
        demoBoxHtml() +
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
          (store.demoMode
            ? '<span class="ct-badge-demo">Interactive demo</span>'
            : '<span class="ct-badge-live">Live</span>') +
          '</div><h1 class="ct-topic-title">' +
          escapeHtml(store.board.topic.title) +
          '</h1><div class="ct-app-meta">' +
          '<a class="ct-rules-link" href="https://clevertree.chat/try/ui/design-brief.md" target="_blank" rel="noopener">House rules · AI-assisted</a>' +
          '<span class="ct-count-pill">' +
          n +
          " perspectives · " +
          pts +
          " total points</span></div></header>" +
          '<nav class="ct-tabs" aria-label="Board sections">' +
          '<button type="button" class="ct-tab' +
          (store.mainTab === "board" ? " is-active" : "") +
          '" data-main-tab="board">Debate board</button>' +
          '<button type="button" class="ct-tab' +
          (store.mainTab === "map" ? " is-active" : "") +
          '" data-main-tab="map">Map of links</button>' +
          '<button type="button" class="ct-tab' +
          (store.mainTab === "about" ? " is-active" : "") +
          '" data-main-tab="about">About this demo</button></nav>' +
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
          demoBoxHtml() +
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

    async function submitPost(body, draftKeys) {
      store.busy = true;
      store.status = "Posting…";
      rerender();
      try {
        const chosen = draftKeys[0] || "";
        const filed = await call(el, {
          action: "submit",
          body: body,
          chosen: chosen,
          name: "You",
        });
        pauseOrApply({
          label: "Your point",
          message: "Your point is live — even before organization.",
          apply: function () {
            applyView(filed.view, { highlightActivity: true });
            pushActivity(store, "live", "Your point is live", true);
          },
        });
        const drained = await call(el, { action: "drain" });
        pauseOrApply({
          label: "Organizing",
          message: drained.batch_notice || drained.message || "Clevertree grouped points into perspectives.",
          apply: function () {
            applyView(drained.view, { highlightActivity: true });
            pushActivity(
              store,
              "batch",
              drained.batch_notice || drained.message || "Board updated",
              true
            );
          },
        });
        store.draft = "";
        store.draftKeys = [];
        store.composerOpen = false;
        store.status = "";
      } catch (err) {
        store.status = err.message || "Could not post.";
        store.liveState = "error";
      } finally {
        store.busy = false;
        rerender();
      }
    }

    async function resetDemo() {
      store.status = "Resetting…";
      rerender();
      try {
        const data = await call(el, { action: "replay" });
        store.demoQueue = [];
        store.demoPaused = false;
        applyView(data.view);
        store.status = "Demo reset.";
        rerender();
      } catch (err) {
        store.status = err.message || "Reset failed.";
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
          const injected = !!msg.comment.injected;
          if (mine && store.busy) return; // HTTP submit path already handling
          pauseOrApply({
            label: injected ? "Another voice" : mine ? "Your point" : "New point",
            message: injected
              ? "A simulated participant added another perspective."
              : mine
                ? "Your point is live."
                : "Someone added a point.",
            apply: function () {
              if (msg.view) applyView(msg.view);
              pushActivity(
                store,
                "live",
                injected
                  ? "Simulated participant added a point"
                  : mine
                    ? "Your point is live"
                    : "Participant contributed a point",
                true
              );
            },
          });
          return;
        }
        if (msg.type === "batch.notice") {
          pauseOrApply({
            label: "Organizing",
            message: msg.notice || "Clevertree is grouping points into perspectives.",
            apply: function () {
              if (msg.view) applyView(msg.view);
              pushActivity(store, "batch", msg.notice || "Organizing in background", true);
            },
          });
          return;
        }
        if (msg.type === "board.snapshot" && msg.view) {
          pauseOrApply({
            label: "Board changed",
            message: "The board updated — here’s what changed.",
            apply: function () {
              applyView(msg.view, { highlightActivity: true });
              pushActivity(store, "batch", "Board updated", true);
            },
          });
        }
      });
    }

    el.addEventListener("click", function (e) {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest("[data-demo-continue]")) {
        continueDemo();
        return;
      }
      if (t.closest("[data-demo-off]")) {
        setDemoMode(false);
        return;
      }
      if (t.closest("[data-demo-on]")) {
        setDemoMode(true);
        return;
      }
      if (t.closest("[data-reset]")) {
        resetDemo();
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
    refresh().catch(function (err) {
      store.status = err.message || "Could not load debate.";
      store.liveState = "error";
      rerender();
    });
    connectWs();
  }

  function boot() {
    document.querySelectorAll("[data-clevertree-board]").forEach(mount);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
