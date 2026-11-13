/** Concept B — Debate Reading Room */
(function (global) {
  const C = () => global.ClevertreeUiLabCore;

  function indexHtml(store) {
    const { escapeHtml, postsForKey } = C();
    return (
      '<nav class="ct-index" aria-label="Perspectives">' +
      '<p class="ct-board-label">Index · Ranked</p>' +
      store.board.keys
        .slice()
        .sort(function (a, b) {
          return a.rank - b.rank;
        })
        .map(function (k) {
          const n = postsForKey(store.board, k.id).length;
          const on = store.selectedKeyId === k.id ? " is-active" : "";
          return (
            '<button type="button" class="ct-index-item' +
            on +
            '" data-select-key="' +
            escapeHtml(k.id) +
            '">' +
            '<span class="ct-rank">' +
            String(k.rank).padStart(2, "0") +
            "</span>" +
            '<span class="ct-index-title">' +
            escapeHtml(k.title) +
            '</span><span class="ct-meta">' +
            n +
            " pts</span></button>"
          );
        })
        .join("") +
      "</nav>"
    );
  }

  function readingPane(store) {
    const {
      escapeHtml,
      keyById,
      postsForKey,
      postCardHtml,
      unfiledPosts,
    } = C();
    const key = keyById(store.board, store.selectedKeyId) || store.board.keys[0];
    if (!key) {
      return '<div class="ct-reading"><p>No perspectives yet.</p></div>';
    }
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
      .join("");
    const deeper = (key.responsesToCounters || [])
      .map(function (r) {
        return (
          "<li>" +
          escapeHtml(r.text) +
          ' <button type="button" class="ct-linkish" data-select-key="' +
          escapeHtml(r.against) +
          '">→ ' +
          escapeHtml((keyById(store.board, r.against) || {}).title || r.against) +
          "</button></li>"
        );
      })
      .join("");
    const posts = postsForKey(store.board, key.id)
      .map(function (p) {
        return postCardHtml(store, p);
      })
      .join("");

    const unfiled = unfiledPosts(store.board);
    const unfiledBlock = unfiled.length
      ? '<section class="ct-unfiled"><h3>Unfiled · ' +
        unfiled.length +
        "</h3>" +
        unfiled.map(function (p) {
          return postCardHtml(store, p);
        }).join("") +
        "</section>"
      : "";

    return (
      '<article class="ct-reading" data-board-scroll>' +
      '<p class="ct-muted">Reading pane</p>' +
      "<h2>" +
      escapeHtml(key.title) +
      "</h2>" +
      '<p class="ct-summary">' +
      escapeHtml(key.summary) +
      "</p>" +
      '<h3>Common counters</h3><div class="ct-counter-row">' +
      counters +
      "</div>" +
      "<h3>Responses to counters</h3><ul class=\"ct-deeper\">" +
      deeper +
      "</ul>" +
      "<h3>Original points</h3><div class=\"ct-posts\">" +
      posts +
      "</div>" +
      unfiledBlock +
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
      '<div class="ct-reading-layout">' +
      indexHtml(store) +
      readingPane(store) +
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

  global.ClevertreeUiLabReading = { render };
})(typeof window !== "undefined" ? window : globalThis);
