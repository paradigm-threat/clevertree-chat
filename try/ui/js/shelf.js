/** Concept A — Perspective Shelf */
(function (global) {
  const C = () => global.ClevertreeUiLabCore;

  function perspectiveCard(store, key) {
    const { escapeHtml, postsForKey, postCardHtml, keyById } = C();
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
    const postHtml = posts.map(function (p) {
      return postCardHtml(store, p);
    }).join("");

    return (
      '<article class="ct-card" id="key-' +
      escapeHtml(key.id) +
      '">' +
      '<header class="ct-card-head">' +
      '<span class="ct-rank">' +
      String(key.rank).padStart(2, "0") +
      "</span>" +
      "<h2>" +
      escapeHtml(key.title) +
      "</h2>" +
      '<span class="ct-meta">' +
      posts.length +
      " points · " +
      (key.countersTo || []).length +
      " counter-links</span></header>" +
      '<p class="ct-summary">' +
      escapeHtml(key.summary) +
      "</p>" +
      '<div class="ct-counter-row">' +
      counters +
      "</div>" +
      (responses
        ? '<div class="ct-responses"><p class="ct-muted">Responses to counters</p><ul>' +
          responses +
          "</ul></div>"
        : "") +
      '<div class="ct-posts"><p class="ct-muted">Original points</p>' +
      postHtml +
      "</div></article>"
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
        focusCompareHtml(store) +
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
        return perspectiveCard(store, k);
      })
      .join("");

    const unfiled = unfiledPosts(store.board);
    const unfiledHtml = unfiled.length
      ? '<section class="ct-unfiled"><h3>Unfiled · ' +
        unfiled.length +
        " awaiting organization</h3>" +
        unfiled.map(function (p) {
          return postCardHtml(store, p);
        }).join("") +
        "</section>"
      : '<section class="ct-unfiled ct-unfiled--empty"><h3>Unfiled</h3><p>No unfiled points.</p></section>';

    root.innerHTML =
      headerHtml(store, uiMeta) +
      '<p class="ct-invite">' +
      escapeHtml(store.board.topic.invite) +
      "</p>" +
      '<div class="ct-shelf-layout">' +
      '<div class="ct-board" data-board-scroll>' +
      '<p class="ct-board-label">Perspectives · Ranked by prominence</p>' +
      cards +
      unfiledHtml +
      "</div>" +
      '<aside class="ct-rail">' +
      "<h3>Recent activity</h3>" +
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

  global.ClevertreeUiLabShelf = { render };
})(typeof window !== "undefined" ? window : globalThis);
