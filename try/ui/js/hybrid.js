/**
 * Hybrid — recommended product mix:
 * Shelf (A) landing + Reading Room depth on expand (B) + small canvas slice when a counter is focused (C).
 */
(function (global) {
  const C = () => global.ClevertreeUiLabCore;

  function miniCanvas(store) {
    const { escapeHtml, keyById } = C();
    if (!store.focusLink) return "";
    const a = keyById(store.board, store.focusLink.from);
    const b = keyById(store.board, store.focusLink.to);
    if (!a || !b) return "";
    const neighbors = new Set([a.id, b.id]);
    (a.countersTo || []).forEach(function (id) {
      neighbors.add(id);
    });
    (b.countersTo || []).forEach(function (id) {
      neighbors.add(id);
    });
    const ids = Array.from(neighbors);
    const nodes = ids.map(function (id, i) {
      const angle = (Math.PI * 2 * i) / ids.length - Math.PI / 2;
      return {
        id: id,
        x: 160 + Math.cos(angle) * 70,
        y: 90 + Math.sin(angle) * 55,
        title: (keyById(store.board, id) || {}).title || id,
        hot: id === a.id || id === b.id,
      };
    });
    const byId = {};
    nodes.forEach(function (n) {
      byId[n.id] = n;
    });
    let edges = "";
    ids.forEach(function (from) {
      const k = keyById(store.board, from);
      (k.countersTo || []).forEach(function (to) {
        if (!byId[to] || from > to) return;
        const A = byId[from];
        const B = byId[to];
        const hot =
          (from === a.id && to === b.id) || (from === b.id && to === a.id);
        edges +=
          '<line class="ct-edge' +
          (hot ? " is-hot" : "") +
          '" x1="' +
          A.x +
          '" y1="' +
          A.y +
          '" x2="' +
          B.x +
          '" y2="' +
          B.y +
          '" />';
      });
    });
    const circles = nodes
      .map(function (n) {
        return (
          '<g class="ct-node' +
          (n.hot ? " is-active" : "") +
          '" transform="translate(' +
          n.x +
          "," +
          n.y +
          ')"><circle r="14"/><text class="ct-node-label" y="26">' +
          escapeHtml(n.title.length > 22 ? n.title.slice(0, 20) + "…" : n.title) +
          "</text></g>"
        );
      })
      .join("");
    return (
      '<aside class="ct-mini-canvas" aria-label="Link neighborhood">' +
      '<p class="ct-muted">Canvas slice (C) · focused link neighborhood</p>' +
      '<svg viewBox="0 0 320 180" class="ct-canvas-svg ct-canvas-svg--mini">' +
      edges +
      circles +
      "</svg></aside>"
    );
  }

  function card(store, key) {
    const { escapeHtml, postsForKey, postCardHtml, keyById } = C();
    const expanded = store.expandedKeyId === key.id;
    const posts = postsForKey(store.board, key.id);
    const counters = (key.countersTo || [])
      .map(function (id) {
        const k = keyById(store.board, id);
        return (
          '<button type="button" class="ct-counter-link" data-focus-from="' +
          escapeHtml(key.id) +
          '" data-focus-to="' +
          escapeHtml(id) +
          '">Counter: ' +
          escapeHtml(k ? k.title : id) +
          " ↗</button>"
        );
      })
      .join("");

    let body =
      '<p class="ct-summary">' +
      escapeHtml(key.summary) +
      "</p>" +
      '<div class="ct-counter-row">' +
      counters +
      "</div>" +
      '<p class="ct-meta">' +
      posts.length +
      " points · " +
      (key.countersTo || []).length +
      " counter-links</p>";

    if (expanded) {
      const responses = (key.responsesToCounters || [])
        .map(function (r) {
          const k = keyById(store.board, r.against);
          return (
            "<li><strong>Re " +
            escapeHtml(k ? k.title : r.against) +
            ":</strong> " +
            escapeHtml(r.text) +
            "</li>"
          );
        })
        .join("");
      body +=
        '<div class="ct-reading-expand"><p class="ct-muted">Reading treatment (B)</p><ul>' +
        responses +
        '</ul><div class="ct-posts">' +
        posts
          .map(function (p) {
            return postCardHtml(store, p);
          })
          .join("") +
        "</div></div>";
    } else {
      body +=
        '<button type="button" class="ct-linkish" data-expand-key="' +
        escapeHtml(key.id) +
        '">Expand reading · show all points ↓</button>';
    }

    return (
      '<article class="ct-card' +
      (expanded ? " is-expanded" : "") +
      '" id="key-' +
      escapeHtml(key.id) +
      '">' +
      '<header class="ct-card-head">' +
      '<span class="ct-rank">' +
      String(key.rank).padStart(2, "0") +
      "</span>" +
      "<h2>" +
      escapeHtml(key.title) +
      "</h2>" +
      (expanded
        ? '<button type="button" class="ct-linkish" data-expand-key="' +
          escapeHtml(key.id) +
          '">Collapse</button>'
        : "") +
      "</header>" +
      body +
      "</article>"
    );
  }

  function render(root, store, uiMeta) {
    const {
      headerHtml,
      activityHtml,
      composerHtml,
      coachHtml,
      focusCompareHtml,
      unfiledPosts,
      postCardHtml,
      escapeHtml,
    } = C();

    if (store.focusLink) {
      root.innerHTML =
        headerHtml(store, uiMeta) +
        '<div class="ct-hybrid-focus">' +
        focusCompareHtml(store) +
        miniCanvas(store) +
        "</div>" +
        composerHtml(store) +
        coachHtml(store);
      return;
    }

    const cards = store.board.keys
      .slice()
      .sort(function (a, b) {
        return a.rank - b.rank;
      })
      .map(function (k) {
        return card(store, k);
      })
      .join("");

    const unfiled = unfiledPosts(store.board);
    const unfiledHtml =
      '<section class="ct-unfiled' +
      (unfiled.length ? "" : " ct-unfiled--empty") +
      '"><h3>Unfiled' +
      (unfiled.length ? " · " + unfiled.length + " awaiting organization" : "") +
      "</h3>" +
      (unfiled.length
        ? unfiled
            .map(function (p) {
              return postCardHtml(store, p);
            })
            .join("")
        : "<p>No unfiled points.</p>") +
      "</section>";

    root.innerHTML =
      headerHtml(store, uiMeta) +
      '<p class="ct-invite">' +
      escapeHtml(store.board.topic.invite) +
      "</p>" +
      '<div class="ct-shelf-layout">' +
      '<div class="ct-board" data-board-scroll>' +
      '<p class="ct-board-label">Hybrid · Shelf first (A) · expand for reading (B)</p>' +
      cards +
      unfiledHtml +
      "</div>" +
      '<aside class="ct-rail"><h3>Recent activity</h3>' +
      activityHtml(store) +
      "</aside>" +
      '<button type="button" class="ct-activity-mobile" data-activity-toggle>' +
      store.board.activity.length +
      " recent updates " +
      (store.activityOpen ? "▾" : "▴") +
      "</button>" +
      (store.activityOpen
        ? '<div class="ct-activity-drawer">' + activityHtml(store) + "</div>"
        : "") +
      "</div>" +
      composerHtml(store) +
      coachHtml(store);
  }

  global.ClevertreeUiLabHybrid = { render };
})(typeof window !== "undefined" ? window : globalThis);
