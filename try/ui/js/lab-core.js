/**
 * Shared state for Clevertree UI lab / mockup.
 * Demo mode (first-time default): pause after each user-submit → server update beat.
 * Live mode: continuous updates, no Continue gate. Server is never gated — UI only.
 */
(function (global) {
  const DEMO_KEY = "clevertree.demoMode";
  const DEMO_SEEN_KEY = "clevertree.demoSeen";

  const INTERFACES = [
    {
      id: "board",
      name: "Debate board",
      letter: "★",
      blurb: "Mockup UI — ranked perspectives + activity + demo pause.",
    },
    {
      id: "shelf",
      name: "Perspective Shelf",
      letter: "A",
      blurb: "Ranked scrollable cards.",
    },
    {
      id: "reading",
      name: "Reading Room",
      letter: "B",
      blurb: "Index + editorial pane.",
    },
    {
      id: "canvas",
      name: "Counterpoint Canvas",
      letter: "C",
      blurb: "Spatial graph of links.",
    },
    {
      id: "hybrid",
      name: "Hybrid (lab)",
      letter: "H",
      blurb: "Earlier A+B+C experiment.",
    },
  ];

  function readDemoMode() {
    try {
      const v = localStorage.getItem(DEMO_KEY);
      if (v === "0") return false;
      if (v === "1") return true;
      // First visit: demo on for first-time users
      return true;
    } catch (e) {
      return true;
    }
  }

  function writeDemoMode(on) {
    try {
      localStorage.setItem(DEMO_KEY, on ? "1" : "0");
      localStorage.setItem(DEMO_SEEN_KEY, "1");
    } catch (e) {}
  }

  function createStore() {
    const board = global.ClevertreeUiLabData.cloneBoard();
    return {
      board,
      demoMode: readDemoMode(),
      demoPaused: false,
      demoQueue: [],
      demoMessage: "",
      demoStepLabel: "",
      awaitingServer: false,
      selectedKeyId: board.keys[0].id,
      expandedKeyId: board.keys[0].id,
      focusLink: null,
      revealedFlags: new Set(),
      draft: "",
      draftKeys: [],
      activityOpen: false,
      mobileTab: "perspectives",
      mainTab: "board",
      composerOpen: false,
      savedScroll: 0,
      onChange: null,
    };
  }

  function keyById(board, id) {
    return board.keys.find((k) => k.id === id);
  }

  function postsForKey(board, keyId) {
    return board.posts.filter(
      (p) => p.keys.includes(keyId) || (p.provisionalKeys || []).includes(keyId)
    );
  }

  function unfiledPosts(board) {
    return board.posts.filter(
      (p) => (!p.keys || !p.keys.length) && !(p.provisionalKeys || []).length
    );
  }

  function totalPoints(board) {
    return board.posts.length;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function chipHtml(keyId, board, opts) {
    const provisional = opts && opts.provisional;
    const key = keyById(board, keyId);
    const label = key ? key.title : keyId;
    const cls = provisional ? "ct-chip ct-chip--provisional" : "ct-chip";
    return (
      '<span class="' +
      cls +
      '" title="' +
      escapeHtml(keyId) +
      '">' +
      escapeHtml(label) +
      "</span>"
    );
  }

  function postBodyHtml(store, post) {
    const flagged = post.flagged && post.flagged.visibility === "click-to-view";
    const revealed = store.revealedFlags.has(post.id);
    if (flagged && !revealed) {
      return (
        '<button type="button" class="ct-reveal" data-reveal="' +
        escapeHtml(post.id) +
        '">Potential issue · Click to view</button>' +
        (post.flagged.contestOpen
          ? ' <button type="button" class="ct-contest" data-contest="' +
            escapeHtml(post.id) +
            '">Contest flag</button>'
          : "")
      );
    }
    let html = '<p class="ct-post-body">' + escapeHtml(post.body) + "</p>";
    if (flagged && revealed) {
      html +=
        '<p class="ct-flag-note">' +
        escapeHtml(post.flagged.note || "Flagged · contestable") +
        (post.flagged.contestOpen
          ? ' · <button type="button" class="ct-contest" data-contest="' +
            escapeHtml(post.id) +
            '">Contest</button>'
          : "") +
        "</p>";
    }
    return html;
  }

  function postCardHtml(store, post) {
    const chips = (post.keys || [])
      .map((id) => chipHtml(id, store.board, { provisional: false }))
      .join("");
    const prov = (post.provisionalKeys || [])
      .map((id) => chipHtml(id, store.board, { provisional: true }))
      .join("");
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
      '<article class="ct-post" data-post="' +
      escapeHtml(post.id) +
      '">' +
      '<div class="ct-post-meta">' +
      avatar +
      who +
      '<span class="ct-chips">' +
      chips +
      prov +
      "</span></div>" +
      postBodyHtml(store, post) +
      "</article>"
    );
  }

  function activityHtml(store) {
    const items = store.board.activity
      .map(function (a) {
        const hi = a.highlight ? " is-highlight" : "";
        return (
          '<li class="ct-act ct-act--' +
          escapeHtml(a.kind) +
          hi +
          '"><span class="ct-act-dot" aria-hidden="true"></span>' +
          '<div><span class="ct-act-time">' +
          escapeHtml(a.at) +
          "</span> " +
          escapeHtml(a.text) +
          "</div></li>"
        );
      })
      .join("");
    return '<ul class="ct-activity-list">' + items + "</ul>";
  }

  function clockAt() {
    const now = new Date();
    return (
      String(now.getHours()).padStart(2, "0") +
      ":" +
      String(now.getMinutes()).padStart(2, "0")
    );
  }

  function pushActivity(store, kind, text, highlight) {
    store.board.activity.unshift({
      id: "a" + Date.now() + Math.random().toString(16).slice(2, 6),
      kind: kind,
      text: text,
      at: clockAt(),
      highlight: !!highlight,
    });
    // Clear older highlights
    store.board.activity.forEach(function (a, i) {
      if (i > 0) a.highlight = false;
    });
  }

  function setDemoMode(store, on) {
    store.demoMode = !!on;
    writeDemoMode(store.demoMode);
    if (!store.demoMode) {
      store.demoPaused = false;
      store.demoQueue = [];
      store.demoMessage = "";
      store.awaitingServer = false;
      flushQueueImmediate(store);
    }
  }

  function pauseForUpdate(store, beat) {
    if (!store.demoMode) {
      if (typeof beat.apply === "function") beat.apply();
      if (typeof store.onChange === "function") store.onChange();
      return;
    }
    store.demoQueue.push(beat);
    if (!store.demoPaused) {
      advanceDemo(store);
    } else if (typeof store.onChange === "function") {
      store.onChange();
    }
  }

  function advanceDemo(store) {
    if (!store.demoMode) {
      flushQueueImmediate(store);
      return;
    }
    const next = store.demoQueue.shift();
    if (!next) {
      store.demoPaused = false;
      store.demoMessage = "";
      store.demoStepLabel = "";
      store.awaitingServer = false;
      if (typeof store.onChange === "function") store.onChange();
      return;
    }
    if (typeof next.apply === "function") next.apply();
    store.demoPaused = true;
    store.demoMessage = next.message || "Something updated.";
    store.demoStepLabel = next.label || "Update";
    if (typeof store.onChange === "function") store.onChange();
  }

  function flushQueueImmediate(store) {
    while (store.demoQueue.length) {
      const beat = store.demoQueue.shift();
      if (typeof beat.apply === "function") beat.apply();
    }
    store.demoPaused = false;
    store.demoMessage = "";
    store.demoStepLabel = "";
    store.awaitingServer = false;
  }

  function continueDemo(store) {
    if (!store.demoPaused) return;
    advanceDemo(store);
  }

  /** Mock server replies after a visitor submit (UI-queued in demo mode). */
  function runServerReplySequence(store, postId) {
    store.awaitingServer = true;

    // Beat 1: live confirm (already applied on submit) — pause to explain
    pauseForUpdate(store, {
      label: "Your point",
      message: "Your point is live — even before organization.",
      apply: function () {
        pushActivity(store, "live", "Your point is live", true);
      },
    });

    // Beat 2: simulated peer (demo only)
    pauseForUpdate(store, {
      label: "Another voice",
      message: "A simulated participant added another perspective.",
      apply: function () {
        const peerId = "peer-" + Date.now();
        store.board.posts.unshift({
          id: peerId,
          body: "If clearance rates rise but trust falls, what metric are we optimizing for?",
          keys: ["privacy-concerns"],
          provisionalKeys: [],
          author: "peer",
          simulated: true,
          flagged: null,
          createdAt: new Date().toISOString(),
        });
        pushActivity(store, "live", "Simulated participant added a point", true);
      },
    });

    // Beat 3: organizing
    pauseForUpdate(store, {
      label: "Organizing",
      message: "Clevertree is grouping points into perspectives.",
      apply: function () {
        pushActivity(store, "batch", "Organizing in background", true);
      },
    });

    // Beat 4: board snapshot / filing
    pauseForUpdate(store, {
      label: "Board changed",
      message: "Your point now appears in these perspectives — here’s what changed.",
      apply: function () {
        const post = store.board.posts.find(function (p) {
          return p.id === postId;
        });
        if (post) {
          if (post.provisionalKeys && post.provisionalKeys.length) {
            post.keys = post.provisionalKeys.slice(0, 2);
            if (post.provisionalKeys.length > 2) {
              // Soft prune demo
              post.keys = [post.provisionalKeys[0]];
            }
            post.provisionalKeys = [];
          } else if (!post.keys.length) {
            post.keys = ["privacy-concerns"];
          }
          pushActivity(
            store,
            "batch",
            "Organized into " + post.keys.join(" · "),
            true
          );
        } else {
          pushActivity(store, "batch", "Board updated", true);
        }
        store.awaitingServer = false;
      },
    });
  }

  function submitPost(store) {
    const body = store.draft.trim();
    if (!body) return false;
    const id = "p" + Date.now();
    const provisional = store.draftKeys.slice();
    store.board.posts.unshift({
      id: id,
      body: body,
      keys: [],
      provisionalKeys: provisional,
      author: "me",
      simulated: false,
      flagged: null,
      createdAt: new Date().toISOString(),
    });
    store.draft = "";
    store.draftKeys = [];
    store.composerOpen = false;
    store.mobileTab = "perspectives";

    if (store.demoMode) {
      runServerReplySequence(store, id);
    } else {
      pushActivity(
        store,
        "live",
        provisional.length
          ? "Your point is live · provisional topics selected"
          : "Your point is live · awaiting organization",
        true
      );
      // Continuous mock organize without pause
      window.setTimeout(function () {
        pushActivity(store, "batch", "Organizing in background", false);
        window.setTimeout(function () {
          const post = store.board.posts.find(function (p) {
            return p.id === id;
          });
          if (post) {
            post.keys = provisional.length ? provisional.slice(0, 2) : ["privacy-concerns"];
            post.provisionalKeys = [];
            pushActivity(store, "batch", "Organized into " + post.keys.join(" · "), true);
          }
          if (typeof store.onChange === "function") store.onChange();
        }, 700);
        if (typeof store.onChange === "function") store.onChange();
      }, 400);
    }
    return true;
  }

  function composerHtml(store, opts) {
    const o = opts || {};
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
    const compact = o.compact;
    const form = function (extraClass, showClose, fieldId) {
      const id = fieldId || "ct-body";
      return (
        '<form class="ct-composer' +
        (extraClass ? " " + extraClass : "") +
        '" data-composer>' +
        '<div class="ct-composer-head">' +
        '<label class="ct-composer-label" for="' +
        id +
        '">Add your perspective</label>' +
        (showClose
          ? '<button type="button" class="ct-linkish" data-close-composer>Close</button>'
          : "") +
        "</div>" +
        '<textarea id="' +
        id +
        '" name="body" rows="3" placeholder="What would you like to say?" data-draft-body>' +
        escapeHtml(store.draft) +
        "</textarea>" +
        '<div class="ct-composer-tools">' +
        '<button type="button" class="ct-mic" data-mic title="Optional microphone transcription" aria-label="Microphone">' +
        '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11h-2z"/></svg>' +
        "</button>" +
        '<details class="ct-key-picker"><summary>Link perspectives (optional)</summary>' +
        '<div class="ct-key-opts">' +
        keys +
        "</div></details>" +
        '<button type="submit" class="ct-post-btn">Post</button>' +
        "</div>" +
        '<p class="ct-composer-hint">No title needed. Soft tags may be revised by batch.</p>' +
        "</form>"
      );
    };
    if (compact && !store.composerOpen) {
      return (
        '<div class="ct-composer-dock">' +
        '<button type="button" class="ct-composer-launch" data-open-composer>Add your perspective</button>' +
        "</div>" +
        form("ct-composer--wide-only", false, "ct-body-wide")
      );
    }
    if (compact && store.composerOpen) {
      return form("ct-composer--sheet", true, "ct-body");
    }
    return form("", false, "ct-body");
  }

  function demoBoxHtml(store) {
    if (!store.demoMode && !store.demoPaused) {
      return (
        '<aside class="ct-demo-box ct-demo-box--off">' +
        "<h3>Guided demo is off</h3>" +
        "<p>Updates arrive continuously. First-time visitors get the guided pause by default.</p>" +
        '<button type="button" class="ct-text-btn" data-demo-on>Enable demo mode</button>' +
        "</aside>"
      );
    }
    const paused = store.demoPaused;
    const msg = store.demoMessage ||
      "You’re participating in a guided debate. It pauses after each update so you can see what changed — with a simulated participant and AI organization.";
    return (
      '<aside class="ct-demo-box' +
      (paused ? " is-paused" : "") +
      '">' +
      '<div class="ct-demo-box-top">' +
      "<div>" +
      '<p class="ct-demo-kicker">Interactive demo</p>' +
      "<h3>" +
      (paused ? escapeHtml(store.demoStepLabel || "Paused") : "Guided walkthrough") +
      "</h3>" +
      "<p>" +
      escapeHtml(msg) +
      "</p>" +
      "</div>" +
      '<button type="button" class="ct-demo-play" data-demo-continue aria-label="' +
      (paused ? "Continue" : "Waiting for your next post") +
      '"' +
      (paused ? "" : " disabled") +
      ">" +
      (paused
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>') +
      "</button>" +
      "</div>" +
      '<div class="ct-demo-actions">' +
      (paused
        ? '<button type="button" class="ct-text-btn" data-demo-continue>Continue</button>'
        : "") +
      '<button type="button" class="ct-text-btn" data-demo-off>Disable demo mode</button>' +
      "</div>" +
      '<p class="ct-demo-note">UI-only pause · the server is not waiting</p>' +
      "</aside>"
    );
  }

  function bindShared(root, store, rerender) {
    store.onChange = rerender;

    root.addEventListener("click", function (e) {
      const t = e.target;
      if (!(t instanceof Element)) return;

      const reveal = t.closest("[data-reveal]");
      if (reveal) {
        store.revealedFlags.add(reveal.getAttribute("data-reveal"));
        rerender();
        return;
      }
      const contest = t.closest("[data-contest]");
      if (contest) {
        pushActivity(store, "flag", "Contest opened — awaiting re-evaluation", true);
        rerender();
        return;
      }
      const focusFrom = t.closest("[data-focus-from]");
      if (focusFrom) {
        const boardEl = root.querySelector("[data-board-scroll]");
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
        const boardEl = root.querySelector("[data-board-scroll]");
        if (boardEl) boardEl.scrollTop = store.savedScroll;
        return;
      }
      if (t.closest("[data-demo-continue]")) {
        continueDemo(store);
        return;
      }
      if (t.closest("[data-demo-off]")) {
        setDemoMode(store, false);
        rerender();
        return;
      }
      if (t.closest("[data-demo-on]")) {
        setDemoMode(store, true);
        rerender();
        return;
      }
      if (t.closest("[data-activity-toggle]")) {
        store.activityOpen = !store.activityOpen;
        rerender();
        return;
      }
      if (t.closest("[data-open-composer]")) {
        store.composerOpen = true;
        rerender();
        const ta = root.querySelector("[data-draft-body]");
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
      const pickKey = t.closest("[data-select-key]");
      if (pickKey) {
        store.selectedKeyId = pickKey.getAttribute("data-select-key");
        store.expandedKeyId = store.selectedKeyId;
        rerender();
        return;
      }
      const expand = t.closest("[data-expand-key]");
      if (expand) {
        const id = expand.getAttribute("data-expand-key");
        store.expandedKeyId = store.expandedKeyId === id ? null : id;
        store.selectedKeyId = id;
        rerender();
        return;
      }
      if (t.closest("[data-mic]")) {
        store.draft =
          (store.draft ? store.draft + " " : "") +
          "[Mic transcription placeholder — edit before posting]";
        store.composerOpen = true;
        rerender();
        const ta = root.querySelector("[data-draft-body]");
        if (ta) ta.focus();
        return;
      }
    });

    root.addEventListener("submit", function (e) {
      const form = e.target.closest("[data-composer]");
      if (!form) return;
      e.preventDefault();
      const ta = form.querySelector("[data-draft-body], textarea");
      store.draft = ta ? ta.value : store.draft;
      const boxes = form.querySelectorAll("[data-draft-key]");
      store.draftKeys = [];
      boxes.forEach(function (box) {
        if (box.checked) store.draftKeys.push(box.getAttribute("data-draft-key"));
      });
      if (submitPost(store)) rerender();
    });

    root.addEventListener("input", function (e) {
      const t = e.target;
      if (t && t.matches && t.matches("[data-draft-body], textarea[name='body']")) {
        store.draft = t.value;
      }
    });
  }

  /** Compat for older lab interfaces (A/B/C/hybrid). */
  function headerHtml(store, uiMeta) {
    const meta = uiMeta || { letter: "?", name: "Lab", blurb: "" };
    return (
      '<header class="ct-header">' +
      '<div class="ct-header-brand"><span class="ct-mark">Clevertree</span>' +
      (store.demoMode
        ? '<span class="ct-mode">Interactive demo</span>'
        : '<span class="ct-mode">Live</span>') +
      "</div>" +
      "<h1>" +
      escapeHtml(store.board.topic.title) +
      "</h1>" +
      '<p class="ct-ui-tag">Interface: <strong>' +
      escapeHtml(meta.letter + " · " + meta.name) +
      "</strong> — " +
      escapeHtml(meta.blurb) +
      "</p>" +
      demoBoxHtml(store) +
      "</header>"
    );
  }

  function coachHtml(store) {
    return store.demoMode || store.demoPaused ? demoBoxHtml(store) : "";
  }

  function focusCompareHtml(store) {
    if (!store.focusLink) return "";
    const a = keyById(store.board, store.focusLink.from);
    const b = keyById(store.board, store.focusLink.to);
    if (!a || !b) return "";
    function side(key) {
      const posts = postsForKey(store.board, key.id)
        .map(function (p) {
          return postCardHtml(store, p);
        })
        .join("");
      const counters = (key.countersTo || [])
        .map(function (id) {
          const k = keyById(store.board, id);
          return (
            '<button type="button" class="ct-counter-link" data-focus-from="' +
            escapeHtml(key.id) +
            '" data-focus-to="' +
            escapeHtml(id) +
            '">' +
            escapeHtml(k ? k.title : id) +
            "</button>"
          );
        })
        .join(" ");
      return (
        '<section class="ct-focus-side"><h2>' +
        escapeHtml(key.title) +
        "</h2><p>" +
        escapeHtml(key.summary) +
        '</p><div class="ct-counter-row">' +
        counters +
        '</div><div class="ct-posts">' +
        posts +
        "</div></section>"
      );
    }
    return (
      '<div class="ct-focus" data-focus>' +
      '<div class="ct-focus-bar"><p>Comparing linked perspectives — not For/Against.</p>' +
      '<button type="button" data-focus-back>Back to debate</button></div>' +
      '<div class="ct-focus-grid">' +
      side(a) +
      side(b) +
      "</div></div>"
    );
  }

  global.ClevertreeUiLabCore = {
    INTERFACES,
    DEMO_KEY,
    createStore,
    keyById,
    postsForKey,
    unfiledPosts,
    totalPoints,
    escapeHtml,
    chipHtml,
    postCardHtml,
    activityHtml,
    composerHtml,
    demoBoxHtml,
    headerHtml,
    coachHtml,
    focusCompareHtml,
    bindShared,
    pushActivity,
    setDemoMode,
    continueDemo,
    submitPost,
  };
})(typeof window !== "undefined" ? window : globalThis);
