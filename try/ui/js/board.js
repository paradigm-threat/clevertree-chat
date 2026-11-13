/**
 * Primary mockup UI — Debate board (desktop + mobile + focused this↔that).
 */
(function (global) {
  const C = () => global.ClevertreeUiLabCore;

  function headerHtml(store) {
    const { escapeHtml, totalPoints } = C();
    const t = store.board.topic;
    const n = store.board.keys.length;
    const pts = totalPoints(store.board);
    return (
      '<header class="ct-app-header">' +
      '<div class="ct-app-brand">' +
      '<img src="/icon-128x128.png" alt="" width="28" height="28">' +
      "<span>Clevertree Chat</span>" +
      (store.demoMode
        ? '<span class="ct-badge-demo"><svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg> Interactive demo</span>'
        : '<span class="ct-badge-live">Live</span>') +
      "</div>" +
      '<h1 class="ct-topic-title">' +
      escapeHtml(t.title) +
      "</h1>" +
      '<div class="ct-app-meta">' +
      '<a class="ct-rules-link" href="/try/ui/design-brief.md" target="_blank" rel="noopener">House rules · AI-assisted</a>' +
      '<span class="ct-count-pill">' +
      n +
      " perspectives · " +
      pts +
      " total points</span>" +
      "</div>" +
      "</header>"
    );
  }

  function tabsHtml(store) {
    function tab(id, label) {
      const on = store.mainTab === id ? " is-active" : "";
      return (
        '<button type="button" class="ct-tab' +
        on +
        '" data-main-tab="' +
        id +
        '">' +
        label +
        "</button>"
      );
    }
    return (
      '<nav class="ct-tabs" aria-label="Board sections">' +
      tab("board", "Debate board") +
      tab("map", "Map of links") +
      tab("about", "About this demo") +
      "</nav>"
    );
  }

  function mobileTabsHtml(store) {
    return (
      '<div class="ct-mobile-tabs" role="tablist">' +
      '<button type="button" role="tab" class="ct-mobile-tab' +
      (store.mobileTab === "perspectives" ? " is-active" : "") +
      '" data-mobile-tab="perspectives">Perspectives</button>' +
      '<button type="button" role="tab" class="ct-mobile-tab' +
      (store.mobileTab === "activity" ? " is-active" : "") +
      '" data-mobile-tab="activity">Recent activity</button>' +
      "</div>"
    );
  }

  function perspectiveCard(store, key, expanded) {
    const { escapeHtml, postsForKey, postCardHtml, keyById } = C();
    const posts = postsForKey(store.board, key.id);
    const counters = (key.countersTo || [])
      .map(function (id) {
        const label =
          (key.counterLabels && key.counterLabels[id]) ||
          (keyById(store.board, id) || {}).title ||
          id;
        return (
          '<li><button type="button" class="ct-counter-chip" data-focus-from="' +
          escapeHtml(key.id) +
          '" data-focus-to="' +
          escapeHtml(id) +
          '">' +
          escapeHtml(label) +
          "</button></li>"
        );
      })
      .join("");

    if (!expanded) {
      return (
        '<article class="ct-pcard">' +
        '<button type="button" class="ct-pcard-toggle" data-expand-key="' +
        escapeHtml(key.id) +
        '" aria-expanded="false">' +
        '<span class="ct-rank">' +
        String(key.rank).padStart(2, "0") +
        "</span>" +
        '<span class="ct-pcard-title">' +
        escapeHtml(key.title) +
        '</span>' +
        '<span class="ct-pcard-meta">' +
        posts.length +
        " points</span>" +
        '<span class="ct-chevron" aria-hidden="true">›</span>' +
        "</button></article>"
      );
    }

    const recent = posts
      .slice(0, 4)
      .map(function (p) {
        return postCardHtml(store, p);
      })
      .join("");

    return (
      '<article class="ct-pcard is-expanded" id="key-' +
      escapeHtml(key.id) +
      '">' +
      '<button type="button" class="ct-pcard-toggle" data-expand-key="' +
      escapeHtml(key.id) +
      '" aria-expanded="true">' +
      '<span class="ct-rank">' +
      String(key.rank).padStart(2, "0") +
      "</span>" +
      '<span class="ct-pcard-title">' +
      escapeHtml(key.title) +
      "</span>" +
      '<span class="ct-chevron is-open" aria-hidden="true">›</span>' +
      "</button>" +
      '<p class="ct-summary">' +
      escapeHtml(key.summary) +
      "</p>" +
      '<div class="ct-pcard-cols">' +
      '<div class="ct-pcard-col">' +
      '<h3>Recent points</h3><div class="ct-posts">' +
      (recent || "<p class=\"ct-muted\">No points yet.</p>") +
      "</div></div>" +
      '<div class="ct-pcard-col">' +
      "<h3>Common counterarguments</h3><ul class=\"ct-counter-list\">" +
      counters +
      "</ul></div>" +
      "</div></article>"
    );
  }

  function boardListHtml(store) {
    const { unfiledPosts, postCardHtml, escapeHtml } = C();
    const cards = store.board.keys
      .slice()
      .sort(function (a, b) {
        return a.rank - b.rank;
      })
      .map(function (k) {
        return perspectiveCard(store, k, store.expandedKeyId === k.id);
      })
      .join("");

    const unfiled = unfiledPosts(store.board);
    const unfiledHtml =
      '<section class="ct-unfiled">' +
      "<h3>Unfiled" +
      (unfiled.length ? " · " + unfiled.length + " awaiting organization" : "") +
      "</h3>" +
      (unfiled.length
        ? unfiled
            .map(function (p) {
              return postCardHtml(store, p);
            })
            .join("")
        : "<p class=\"ct-muted\">Nothing waiting — new posts without a topic land here.</p>") +
      "</section>";

    return (
      '<div class="ct-board-scroll" data-board-scroll>' +
      '<p class="ct-invite">' +
      escapeHtml(store.board.topic.invite) +
      "</p>" +
      cards +
      unfiledHtml +
      "</div>"
    );
  }

  function mapHtml(store) {
    const { escapeHtml, keyById, postsForKey } = C();
    const keys = store.board.keys.slice().sort(function (a, b) {
      return a.rank - b.rank;
    });
    const n = keys.length || 1;
    const cx = 200;
    const cy = 150;
    const r = 100;
    const nodes = keys.map(function (k, i) {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      return {
        id: k.id,
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
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
        const a = byId[k.id];
        const b = byId[to];
        if (!a || !b) return;
        edges +=
          '<line class="ct-edge" x1="' +
          a.x +
          '" y1="' +
          a.y +
          '" x2="' +
          b.x +
          '" y2="' +
          b.y +
          '" data-focus-from="' +
          escapeHtml(k.id) +
          '" data-focus-to="' +
          escapeHtml(to) +
          '" />';
      });
    });
    const circles = nodes
      .map(function (n) {
        const count = postsForKey(store.board, n.id).length;
        return (
          '<g class="ct-node" data-select-key="' +
          escapeHtml(n.id) +
          '" transform="translate(' +
          n.x +
          "," +
          n.y +
          ')"><circle r="' +
          (16 + Math.min(10, count)) +
          '"/><text y="4">' +
          String(n.key.rank).padStart(2, "0") +
          '</text><text class="ct-node-label" y="32">' +
          escapeHtml(n.key.title.length > 24 ? n.key.title.slice(0, 22) + "…" : n.key.title) +
          "</text></g>"
        );
      })
      .join("");
    return (
      '<div class="ct-map-pane" data-board-scroll>' +
      '<p class="ct-muted">Map of links — click a node to expand on the board, or an edge for this ↔ that.</p>' +
      '<svg class="ct-canvas-svg" viewBox="0 0 400 320" role="img" aria-label="Perspective links">' +
      edges +
      circles +
      "</svg></div>"
    );
  }

  function aboutHtml(store) {
    const { escapeHtml, demoBoxHtml } = C();
    return (
      '<div class="ct-about" data-board-scroll>' +
      "<h2>About this demo</h2>" +
      "<p>This is a guided walkthrough on sample data — not a live hosted topic. Simulated peers are labeled. Demo pauses are <strong>UI-only</strong>; the server is never waiting on Continue.</p>" +
      "<ul>" +
      "<li>Debate first: ranked perspectives are the main view.</li>" +
      "<li>Simple participation: body only, optional mic, optional tags.</li>" +
      "<li>Guided demos: pause after each update from your submit through server replies.</li>" +
      "<li>Trust: house rules · AI-assisted organization; abuse is click-to-view, not instant delete.</li>" +
      "</ul>" +
      demoBoxHtml(store) +
      "</div>"
    );
  }

  function railHtml(store) {
    const { activityHtml, demoBoxHtml } = C();
    return (
      '<aside class="ct-rail">' +
      "<h2>Recent activity</h2>" +
      activityHtml(store) +
      demoBoxHtml(store) +
      "</aside>"
    );
  }

  function focusHtml(store) {
    const { escapeHtml, keyById, postsForKey, postCardHtml } = C();
    const a = keyById(store.board, store.focusLink.from);
    const b = keyById(store.board, store.focusLink.to);
    if (!a || !b) return "";

    function side(key) {
      const posts = postsForKey(store.board, key.id);
      const bullets = posts
        .slice(0, 3)
        .map(function (p) {
          const text =
            p.flagged && !store.revealedFlags.has(p.id)
              ? "Potential issue · hidden"
              : p.body.length > 120
                ? p.body.slice(0, 118) + "…"
                : p.body;
          return "<li>" + escapeHtml(text) + "</li>";
        })
        .join("");
      return (
        '<section class="ct-focus-side">' +
        '<span class="ct-rank">' +
        String(key.rank).padStart(2, "0") +
        "</span>" +
        "<h2>" +
        escapeHtml(key.title) +
        "</h2>" +
        '<p class="ct-muted">' +
        posts.length +
        " points · perspective</p>" +
        '<p class="ct-summary">' +
        escapeHtml(key.summary) +
        "</p>" +
        "<h3>Key points (3 of " +
        posts.length +
        ")</h3><ul>" +
        bullets +
        "</ul>" +
        '<div class="ct-posts ct-posts--focus">' +
        posts
          .slice(0, 2)
          .map(function (p) {
            return postCardHtml(store, p);
          })
          .join("") +
        "</div></section>"
      );
    }

    return (
      '<div class="ct-focus">' +
      '<button type="button" class="ct-back" data-focus-back>← Back to all perspectives</button>' +
      '<p class="ct-focus-label">Focused comparison · This ↔ That · not For/Against</p>' +
      '<div class="ct-focus-grid">' +
      side(a) +
      '<div class="ct-focus-swap" aria-hidden="true"><span>↔</span></div>' +
      side(b) +
      "</div></div>"
    );
  }

  function render(root, store, uiMeta) {
    const { composerHtml, activityHtml, escapeHtml } = C();

    if (store.focusLink) {
      root.innerHTML =
        '<div class="ct-app">' +
        headerHtml(store) +
        focusHtml(store) +
        composerHtml(store, { compact: false }) +
        "</div>";
      return;
    }

    let main = "";
    if (store.mainTab === "map") main = mapHtml(store);
    else if (store.mainTab === "about") main = aboutHtml(store);
    else main = boardListHtml(store);

    root.innerHTML =
      '<div class="ct-app">' +
      headerHtml(store) +
      tabsHtml(store) +
      mobileTabsHtml(store) +
      '<div class="ct-app-body">' +
      '<div class="ct-main' +
      (store.mobileTab === "activity" ? " is-mobile-hidden" : "") +
      '">' +
      main +
      "</div>" +
      '<div class="ct-rail-wrap' +
      (store.mobileTab === "perspectives" ? " is-mobile-hidden-rail" : "") +
      '">' +
      railHtml(store) +
      "</div>" +
      "</div>" +
      composerHtml(store, { compact: true }) +
      "</div>";

    root.querySelectorAll(".ct-edge").forEach(function (line) {
      line.style.cursor = "pointer";
      line.addEventListener("click", function () {
        store.focusLink = {
          from: line.getAttribute("data-focus-from"),
          to: line.getAttribute("data-focus-to"),
        };
        if (typeof store.onChange === "function") store.onChange();
      });
    });
  }

  global.ClevertreeUiLabBoard = { render };
})(typeof window !== "undefined" ? window : globalThis);
