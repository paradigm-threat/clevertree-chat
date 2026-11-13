/**
 * Clevertree Chat containable widget.
 * Mount: <div data-clevertree-chat data-api="chat" data-topic="thc-legalization"></div>
 * Live updates via WebSocket (/api/chat/ws). Composer is visitor-only; peers arrive from the server.
 */
(function () {
  const VISITOR_KEY = "clevertree.visitor";
  const STEPS_BASE = "/fronts/snippet/demo-steps/";

  function visitorId() {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  }

  function apiBase(el) {
    const custom = el.getAttribute("data-api-base");
    if (custom) return custom.replace(/\/$/, "");
    return "";
  }

  function apiPath(el) {
    const mode = el.getAttribute("data-api") || "chat";
    if (mode === "live") return "/api/debate";
    if (mode === "demo") return "/api/demo";
    return "/api/chat";
  }

  function topicOf(el) {
    return (el.getAttribute("data-topic") || "thc-legalization").trim();
  }

  function wsUrl(el) {
    const base = apiBase(el);
    const path = "/api/chat/ws";
    if (base) {
      const u = new URL(base);
      u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
      u.pathname = path;
      u.search = "";
      return (
        u.origin +
        path +
        "?topic=" +
        encodeURIComponent(topicOf(el)) +
        "&visitor=" +
        encodeURIComponent(visitorId())
      );
    }
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return (
      proto +
      "//" +
      location.host +
      path +
      "?topic=" +
      encodeURIComponent(topicOf(el)) +
      "&visitor=" +
      encodeURIComponent(visitorId())
    );
  }

  function stepDelayMs() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return 200;
    }
    return 900;
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

  async function loadSteps(topic) {
    const response = await fetch(STEPS_BASE + encodeURIComponent(topic) + ".json", {
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error("Demo steps for " + topic + " were not found.");
    return response.json();
  }

  function oneLine(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function placementText(comment) {
    const start = comment.starting || "uncategorized";
    const keys = (comment.keys && comment.keys.length ? comment.keys : [comment.key]).filter(
      (key) => key && key !== "uncategorized"
    );
    if (!keys.length) return "Starting slot: " + start + ". It is in no category.";
    if (keys.length === 1 && keys[0] === start) return "Starting slot: " + start + ".";
    return "Starting slot: " + start + ". Batch placed it in " + keys.join(" and ") + ".";
  }

  function mount(el) {
    if (el._clevertreeMounted) return;
    el._clevertreeMounted = true;
    el.classList.add("clevertree-chat");

    const guided = (el.getAttribute("data-guided") || "true") !== "false";
    const mode = el.getAttribute("data-api") || "chat";
    const autoplay = (el.getAttribute("data-autoplay") || "false") === "true";
    const useWs = mode === "chat" || mode === "demo";

    el.innerHTML = `
      <div class="ct-shell-head">
        <p class="ct-topic-label" data-role="topic-label"></p>
        <p class="ct-live" data-role="live" data-state="closed">Connecting…</p>
      </div>
      <p class="ct-empty">Don’t get lost in the weeds.</p>
      <div class="ct-controls" ${guided ? "" : "hidden"}>
        <button type="button" class="ct-button" data-act="play">Play demo conversation</button>
        <button type="button" class="ct-text-button" data-act="reset">Reset</button>
      </div>
      <p class="ct-batch-notice" data-role="batch" hidden></p>
      <p class="ct-status" data-role="status" role="status"></p>
      <ul class="ct-activity" data-role="activity" aria-label="Activity"></ul>
      <form class="ct-composer" data-role="composer">
        <label for="ct-post-${el.id || "main"}">Your post</label>
        <textarea id="ct-post-${el.id || "main"}" data-role="post" rows="4" required placeholder="Write the point in your own words."></textarea>
        <p class="ct-suggestion" data-role="suggestion">The key appears here only when that category already exists.</p>
        <div class="ct-slots" data-role="slots" role="group" aria-label="Starting slot"></div>
        <p class="ct-hint">You post as yourself. Other people arrive from the server — not through this box.</p>
        <label for="ct-name-${el.id || "main"}">Name</label>
        <input id="ct-name-${el.id || "main"}" data-role="name" autocomplete="nickname" placeholder="Shown on your posts">
        <div class="ct-actions">
          <button type="submit" class="ct-button" data-role="submit">Post</button>
        </div>
      </form>
      <div class="ct-board" data-role="board">
        <p class="ct-board-label">Standing arguments</p>
        <div data-role="board-body"></div>
      </div>
    `;

    const status = el.querySelector('[data-role="status"]');
    const batchNotice = el.querySelector('[data-role="batch"]');
    const suggestion = el.querySelector('[data-role="suggestion"]');
    const slots = el.querySelector('[data-role="slots"]');
    const activity = el.querySelector('[data-role="activity"]');
    const boardBody = el.querySelector('[data-role="board-body"]');
    const form = el.querySelector('[data-role="composer"]');
    const post = el.querySelector('[data-role="post"]');
    const nameInput = el.querySelector('[data-role="name"]');
    const empty = el.querySelector(".ct-empty");
    const live = el.querySelector('[data-role="live"]');
    const topicLabel = el.querySelector('[data-role="topic-label"]');
    topicLabel.textContent = topicOf(el);

    let chosen = "";
    let currentView = null;
    let playing = false;
    let activityRows = [];
    let openIds = new Set();
    let socket = null;
    let stepTable = null;
    let visitorStepIndex = 0;

    function paintSlots(view) {
      slots.replaceChildren();
      const existing = (view && view.existing) || [];
      if (!existing.length) {
        const note = document.createElement("p");
        note.className = "ct-hint";
        note.textContent = "No category exists yet. The first post stays uncategorized until the batch.";
        slots.append(note);
        return;
      }
      existing.forEach((key) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ct-slot";
        button.textContent = key;
        button.setAttribute("data-slot", key);
        button.setAttribute("aria-pressed", chosen === key ? "true" : "false");
        button.addEventListener("click", () => {
          chosen = chosen === key ? "" : key;
          paintSlots(currentView);
        });
        slots.append(button);
      });
    }

    function sectionNode(key, section) {
      const article = document.createElement("article");
      article.className = "ct-section";
      article.setAttribute("data-section", key);
      const heading = document.createElement("h2");
      heading.textContent = section.uncategorized ? "Uncategorized" : key;
      article.append(heading);
      if (section.position_html) {
        const position = document.createElement("div");
        position.className = "ct-position";
        position.innerHTML = section.position_html;
        article.append(position);
      }
      (section.comments || []).forEach((comment) => {
        const block = document.createElement("div");
        block.className = "ct-comment";
        block.setAttribute("data-mine", comment.mine ? "true" : "false");
        const by = document.createElement("p");
        by.className = "ct-byline";
        by.textContent = (comment.mine ? "You · " : "") + comment.author;
        const place = document.createElement("p");
        place.className = "ct-placement";
        place.textContent = placementText(comment);
        const body = document.createElement("div");
        body.className = "ct-comment-body";
        body.innerHTML = comment.html;
        block.append(by, place, body);
        article.append(block);
      });
      return article;
    }

    function paintActivity() {
      activity.replaceChildren();
      activityRows.forEach((row) => {
        const li = document.createElement("li");
        li.className = "ct-activity-row";
        li.setAttribute("data-kind", row.kind || "post");
        li.setAttribute("data-mine", row.mine ? "true" : "false");
        li.setAttribute("data-id", row.id || "");
        if (openIds.has(row.id)) li.setAttribute("data-open", "true");
        const summary = document.createElement("button");
        summary.type = "button";
        summary.className = "ct-activity-summary";
        const chip = document.createElement("span");
        chip.className = "ct-chip";
        if (row.kind === "batch") chip.textContent = "Batch";
        else chip.textContent = row.mine ? "You" : row.author || "Other";
        const preview = document.createElement("p");
        preview.className = "ct-preview";
        preview.textContent = oneLine(row.body);
        const badge = document.createElement("span");
        badge.className = "ct-key-badge";
        badge.textContent = (row.keys && row.keys[0]) || "";
        summary.append(chip, preview, badge);
        summary.addEventListener("click", () => {
          if (openIds.has(row.id)) openIds.delete(row.id);
          else openIds.add(row.id);
          paintActivity();
        });
        const body = document.createElement("div");
        body.className = "ct-activity-body";
        body.textContent = row.body || "";
        li.append(summary, body);
        activity.append(li);
      });
      activity.scrollTop = activity.scrollHeight;
    }

    function mergeActivity(rows) {
      if (!rows || !rows.length) return;
      const byId = new Map(activityRows.map((r) => [r.id, r]));
      rows.forEach((r) => {
        if (!r || !r.id) return;
        byId.set(r.id, { ...byId.get(r.id), ...r });
      });
      activityRows = Array.from(byId.values()).sort((a, b) => {
        const ai = String(a.id).startsWith("batch-") ? 1e9 : parseInt(a.id, 10) || 0;
        const bi = String(b.id).startsWith("batch-") ? 1e9 : parseInt(b.id, 10) || 0;
        if (String(a.id).startsWith("batch-") && String(b.id).startsWith("batch-")) {
          return String(a.id).localeCompare(String(b.id));
        }
        return ai - bi;
      });
      paintActivity();
    }

    function renderBoard(view) {
      boardBody.replaceChildren();
      if (!view || !view.exists) return;
      const used = new Set();
      (view.pairs || []).forEach((pair) => {
        const row = document.createElement("div");
        row.className = "ct-pair-row";
        row.setAttribute("data-pair", pair.join("|"));
        pair.forEach((key) => {
          used.add(key);
          if (view.sections[key]) row.append(sectionNode(key, view.sections[key]));
        });
        boardBody.append(row);
      });
      Object.keys(view.sections || {}).forEach((key) => {
        if (used.has(key) || key === "uncategorized") return;
        boardBody.append(sectionNode(key, view.sections[key]));
      });
      if (view.sections.uncategorized && view.sections.uncategorized.comments.length) {
        boardBody.append(sectionNode("uncategorized", view.sections.uncategorized));
      }
      (view.suggestions || []).forEach((item) => {
        const aside = document.createElement("aside");
        aside.className = "ct-suggestion-card";
        aside.setAttribute("data-suggestion", item.key);
        const heading = document.createElement("h2");
        heading.textContent = "Suggested: " + item.key;
        const cite = document.createElement("p");
        cite.textContent = item.citation ? "Citation: " + item.citation : item.note || "";
        const note = document.createElement("p");
        note.textContent = "This is a suggestion, not a directory, until someone writes the first words there.";
        aside.append(heading, cite, note);
        boardBody.append(aside);
      });
    }

    function render(view, activityPayload) {
      currentView = view;
      if (!view || !view.exists) {
        empty.hidden = false;
      } else {
        empty.hidden = true;
      }
      const notice = (view && (view.batch_notice || (view.demo && view.demo.notice))) || "";
      if (notice) {
        batchNotice.hidden = false;
        batchNotice.textContent = notice;
      }
      paintSlots(view);
      renderBoard(view);
      if (activityPayload) mergeActivity(activityPayload);
      else if (view && view.activity) mergeActivity(view.activity);
    }

    async function refresh() {
      const view = await getView(el);
      render(view, view.activity);
      return view;
    }

    async function submitPost() {
      const body = post.value.trim();
      if (!body) throw new Error("Write a post before sending.");
      el.setAttribute("data-busy", "true");
      try {
        const filed = await call(el, {
          action: "submit",
          body,
          chosen,
          name: nameInput.value.trim() || "You",
        });
        status.textContent = "Posted. Waiting for the batch…";
        render(filed.view, filed.activity);
        await new Promise((resolve) => setTimeout(resolve, stepDelayMs()));
        const drained = await call(el, { action: "drain" });
        status.textContent = drained.batch_notice || drained.message || "Batch placed this post.";
        post.value = "";
        chosen = "";
        render(drained.view, drained.activity);
        return drained;
      } finally {
        el.removeAttribute("data-busy");
      }
    }

    let reconnectTimer = 0;
    function connectWs() {
      if (!useWs) {
        live.textContent = "HTTP only";
        live.setAttribute("data-state", "closed");
        return;
      }
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        return;
      }
      try {
        socket = new WebSocket(wsUrl(el));
      } catch (error) {
        live.textContent = "Socket failed";
        live.setAttribute("data-state", "closed");
        return;
      }
      socket.addEventListener("open", () => {
        live.textContent = "Live";
        live.setAttribute("data-state", "open");
      });
      socket.addEventListener("close", () => {
        live.textContent = "Reconnecting…";
        live.setAttribute("data-state", "closed");
        window.clearTimeout(reconnectTimer);
        reconnectTimer = window.setTimeout(connectWs, 1600);
      });
      socket.addEventListener("message", (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch (error) {
          return;
        }
        if (msg.type === "hello" || msg.type === "board.snapshot") {
          if (msg.view) render(msg.view, msg.activity || msg.view.activity);
        }
        if (msg.type === "post.live" && msg.comment) {
          const row = {
            ...msg.comment,
            mine: msg.comment.author_uuid === visitorId(),
            kind: "post",
          };
          mergeActivity([row]);
          if (msg.view) renderBoard(msg.view);
          if (msg.view) {
            currentView = msg.view;
            paintSlots(msg.view);
            empty.hidden = true;
          }
          status.textContent = row.mine
            ? "Your post is live."
            : (row.author || "Someone") + " posted.";
        }
        if (msg.type === "batch.notice") {
          if (msg.notice) {
            batchNotice.hidden = false;
            batchNotice.textContent = msg.notice;
            mergeActivity([
              {
                id: "batch-" + Date.now(),
                author: "Batch",
                body: msg.notice,
                keys: [],
                mine: false,
                kind: "batch",
              },
            ]);
          }
          if (msg.view) render(msg.view, msg.view.activity);
          status.textContent = msg.notice || "Batch updated the board.";
        }
      });
    }

    function isVisitorStep(step) {
      const name = (step.name || "").toLowerCase();
      return name === "maya" || name === "you" || name === "visitor";
    }

    function visitorSteps(table) {
      return (table.steps || []).filter(isVisitorStep);
    }

    function stepIndexAfterVisitorBeat(table, visitorBeatIndex) {
      let seen = 0;
      const steps = table.steps || [];
      for (let i = 0; i < steps.length; i++) {
        if (!isVisitorStep(steps[i])) continue;
        if (seen === visitorBeatIndex) {
          let j = i + 1;
          while (j < steps.length && !isVisitorStep(steps[j])) j += 1;
          return j;
        }
        seen += 1;
      }
      return steps.length;
    }

    async function waitUntilDemoStep(minStep) {
      const deadline = Date.now() + 25000;
      while (Date.now() < deadline) {
        const view = await getView(el);
        render(view, view.activity);
        const step = (view.demo && view.demo.step) || 0;
        if (step >= minStep || (view.demo && view.demo.complete)) return view;
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      throw new Error("Timed out waiting for the server peer to post.");
    }

    async function playVisitorBeats() {
      const table = stepTable || (await loadSteps(topicOf(el)));
      stepTable = table;
      await call(el, { action: "replay" });
      activityRows = [];
      openIds = new Set();
      paintActivity();
      await refresh();
      const beats = visitorSteps(table);
      visitorStepIndex = 0;
      for (const step of beats) {
        nameInput.value = nameInput.value.trim() || "You";
        post.value = step.body;
        chosen = step.chooseSlot || "";
        paintSlots(currentView);
        status.textContent = "Your turn…";
        await submitPost();
        const need = stepIndexAfterVisitorBeat(table, visitorStepIndex);
        await waitUntilDemoStep(need);
        visitorStepIndex += 1;
      }
      status.textContent = "Demo beats finished. You can keep posting.";
    }

    el.querySelector('[data-act="play"]').addEventListener("click", async () => {
      if (playing) return;
      playing = true;
      try {
        await playVisitorBeats();
      } catch (error) {
        status.textContent = error.message;
      } finally {
        playing = false;
      }
    });

    el.querySelector('[data-act="reset"]').addEventListener("click", async () => {
      try {
        await call(el, { action: "replay" });
        activityRows = [];
        openIds = new Set();
        paintActivity();
        batchNotice.hidden = true;
        batchNotice.textContent = "";
        status.textContent = "Demo reset.";
        chosen = "";
        await refresh();
      } catch (error) {
        status.textContent = error.message;
      }
    });

    let previewTimer = 0;
    post.addEventListener("input", () => {
      window.clearTimeout(previewTimer);
      previewTimer = window.setTimeout(async () => {
        suggestion.replaceChildren();
        if (!post.value.trim()) {
          suggestion.textContent = "The key appears here only when that category already exists.";
          return;
        }
        try {
          const preview = await call(el, { action: "preview", body: post.value });
          if (!preview.suggestion) {
            suggestion.textContent =
              "No existing category is suggested. Choosing nothing leaves the post uncategorized.";
            return;
          }
          suggestion.append("Suggested starting slot: " + preview.suggestion + ". ");
          const use = document.createElement("button");
          use.type = "button";
          use.className = "ct-text-button";
          use.textContent = "Use this starting slot";
          use.addEventListener("click", () => {
            chosen = preview.suggestion;
            paintSlots(currentView);
          });
          suggestion.append(use);
        } catch (error) {
          suggestion.textContent = error.message;
        }
      }, 240);
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (playing) return;
      status.textContent = "";
      try {
        await submitPost();
      } catch (error) {
        status.textContent = error.message;
      }
    });

    connectWs();
    refresh()
      .then(async () => {
        if (!autoplay || !guided) return;
        if (playing) return;
        playing = true;
        try {
          await playVisitorBeats();
        } catch (error) {
          status.textContent = error.message;
        } finally {
          playing = false;
        }
      })
      .catch((error) => {
        status.textContent = error.message;
      });
  }

  function boot() {
    document.querySelectorAll("[data-clevertree-chat]").forEach(mount);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.ClevertreeChat = { mount, boot, loadSteps };
})();
