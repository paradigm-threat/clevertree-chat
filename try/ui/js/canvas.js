/** Concept C — Counterpoint Canvas (spatial graph; not the product default) */
(function (global) {
  const C = () => global.ClevertreeUiLabCore;

  /** Simple deterministic layout around a circle */
  function layoutKeys(keys) {
    const n = keys.length || 1;
    const cx = 220;
    const cy = 180;
    const r = 120;
    return keys.map(function (k, i) {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      return {
        id: k.id,
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        key: k,
      };
    });
  }

  function graphSvg(store) {
    const { escapeHtml, keyById, postsForKey } = C();
    const nodes = layoutKeys(
      store.board.keys.slice().sort(function (a, b) {
        return a.rank - b.rank;
      })
    );
    const byId = {};
    nodes.forEach(function (n) {
      byId[n.id] = n;
    });

    const edges = [];
    store.board.keys.forEach(function (k) {
      (k.countersTo || []).forEach(function (to) {
        if (k.id < to) edges.push({ from: k.id, to: to });
      });
    });

    const lines = edges
      .map(function (e) {
        const a = byId[e.from];
        const b = byId[e.to];
        if (!a || !b) return "";
        return (
          '<line class="ct-edge" x1="' +
          a.x +
          '" y1="' +
          a.y +
          '" x2="' +
          b.x +
          '" y2="' +
          b.y +
          '" data-focus-from="' +
          escapeHtml(e.from) +
          '" data-focus-to="' +
          escapeHtml(e.to) +
          '" />'
        );
      })
      .join("");

    const circles = nodes
      .map(function (n) {
        const on = store.selectedKeyId === n.id ? " is-active" : "";
        const count = postsForKey(store.board, n.id).length;
        const label = n.key.title.length > 28 ? n.key.title.slice(0, 26) + "…" : n.key.title;
        return (
          '<g class="ct-node' +
          on +
          '" data-select-key="' +
          escapeHtml(n.id) +
          '" transform="translate(' +
          n.x +
          "," +
          n.y +
          ')">' +
          '<circle r="' +
          (18 + Math.min(12, count * 2)) +
          '" />' +
          '<text class="ct-node-rank" y="-4">' +
          String(n.key.rank).padStart(2, "0") +
          "</text>" +
          '<text class="ct-node-label" y="28">' +
          escapeHtml(label) +
          "</text></g>"
        );
      })
      .join("");

    return (
      '<div class="ct-canvas-wrap" data-board-scroll>' +
      '<p class="ct-board-label">Counterpoint canvas · click a node or an edge</p>' +
      '<svg class="ct-canvas-svg" viewBox="0 0 440 360" role="img" aria-label="Perspective link graph">' +
      lines +
      circles +
      "</svg>" +
      '<p class="ct-muted">Graph is exploratory. Full reading happens in the detail panel — not buried in nodes.</p>' +
      "</div>"
    );
  }

  function detailHtml(store) {
    const {
      escapeHtml,
      keyById,
      postsForKey,
      postCardHtml,
      unfiledPosts,
    } = C();
    const key = keyById(store.board, store.selectedKeyId) || store.board.keys[0];
    if (!key) return "";
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
          " ↗</button>"
        );
      })
      .join("");
    const posts = postsForKey(store.board, key.id)
      .map(function (p) {
        return postCardHtml(store, p);
      })
      .join("");
    const unfiled = unfiledPosts(store.board);

    return (
      '<section class="ct-canvas-detail">' +
      "<h2>" +
      escapeHtml(key.title) +
      "</h2>" +
      "<p>" +
      escapeHtml(key.summary) +
      "</p>" +
      '<div class="ct-counter-row">' +
      counters +
      "</div>" +
      '<div class="ct-posts">' +
      posts +
      "</div>" +
      (unfiled.length
        ? '<div class="ct-unfiled"><h3>Unfiled</h3>' +
          unfiled.map(function (p) {
            return postCardHtml(store, p);
          }).join("") +
          "</div>"
        : "") +
      "</section>"
    );
  }

  function render(root, store, uiMeta) {
    const {
      headerHtml,
      activityHtml,
      composerHtml,
      coachHtml,
      focusCompareHtml,
      escapeHtml,
    } = C();

    if (store.focusLink) {
      root.innerHTML =
        headerHtml(store, uiMeta) +
        focusCompareHtml(store) +
        composerHtml(store) +
        coachHtml(store);
      return;
    }

    root.innerHTML =
      headerHtml(store, uiMeta) +
      '<p class="ct-invite">' +
      escapeHtml(store.board.topic.invite) +
      "</p>" +
      '<div class="ct-canvas-layout">' +
      graphSvg(store) +
      detailHtml(store) +
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

    // SVG edge clicks: line elements need pointer events
    root.querySelectorAll(".ct-edge").forEach(function (line) {
      line.style.cursor = "pointer";
      line.addEventListener("click", function () {
        store.savedScroll = 0;
        store.focusLink = {
          from: line.getAttribute("data-focus-from"),
          to: line.getAttribute("data-focus-to"),
        };
        if (typeof store.onChange === "function") store.onChange();
      });
    });
  }

  global.ClevertreeUiLabCanvas = { render };
})(typeof window !== "undefined" ? window : globalThis);
