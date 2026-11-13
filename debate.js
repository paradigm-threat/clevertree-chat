const visitorKey = "clevertree.visitor";
const title = document.getElementById("topic-title");
const blurb = document.getElementById("topic-blurb");
const topicLabel = document.getElementById("topic-label");
const topicName = document.getElementById("topic-name");
const post = document.getElementById("post");
const suggestion = document.getElementById("suggestion");
const slots = document.getElementById("slots");
const nameInput = document.getElementById("visitor-name");
const status = document.getElementById("status");
const filing = document.getElementById("filing-line");
const notices = document.getElementById("notices");
const board = document.getElementById("board");
const form = document.getElementById("composer");
let chosen = "";
let currentView = null;

function visitorId() {
  let id = localStorage.getItem(visitorKey);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(visitorKey, id);
  }
  return id;
}

function route() {
  const parts = location.pathname.split("/").filter(Boolean);
  return { topic: decodeURIComponent(parts[1] || ""), subtopic: decodeURIComponent(parts[2] || "") };
}

function topic() {
  return route().topic || topicName.value.trim();
}

async function callApi(payload, method) {
  const path = route();
  const body = { visitor: visitorId(), topic: topic(), subtopic: path.subtopic, ...payload };
  const response = await fetch("/api/debate", {
    method: method || "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "The debate could not be saved.");
  }
  return data;
}

function debounce(fn, wait) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

function selectSlot(key) {
  chosen = chosen === key ? "" : key;
  paintSlots(currentView);
}

function paintSlots(view) {
  slots.replaceChildren();
  const existing = (view && view.existing) || [];
  if (!existing.length) {
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = "No category exists yet. The first post stays uncategorized until the batch.";
    slots.append(note);
    return;
  }
  existing.forEach((key) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "slot";
    button.textContent = key;
    button.setAttribute("aria-pressed", chosen === key ? "true" : "false");
    button.addEventListener("click", () => selectSlot(key));
    slots.append(button);
  });
}

function sectionNode(key, section, topicTally) {
  const article = document.createElement("article");
  article.className = "section";
  article.id = "slot-" + key;
  if (route().subtopic === key) article.classList.add("focused");
  const heading = document.createElement("h2");
  heading.textContent = section.uncategorized ? "Uncategorized" : key;
  article.append(heading);
  if (!section.uncategorized) {
    article.append(voteButton("subtopic", key, section.tally, section.mine, "Vote on this category"));
  }
  if (section.position_html) {
    const position = document.createElement("div");
    position.className = "position";
    position.innerHTML = section.position_html;
    article.append(position);
  }
  section.comments.forEach((comment) => {
    const block = document.createElement("div");
    block.className = "comment";
    const by = document.createElement("p");
    by.className = "byline";
    by.textContent = comment.author;
    const place = document.createElement("p");
    place.className = "placement";
    place.textContent = placementText(comment);
    const body = document.createElement("div");
    body.className = "comment-body";
    body.innerHTML = comment.html;
    block.append(by, place, body, voteButton("comment", comment.key || key, comment.tally, comment.mine, "Vote on this post", comment.id));
    article.append(block);
  });
  if (topicTally && !section.uncategorized) {
    article.dataset.topicTally = String(section.topic_tally || 0);
  }
  return article;
}

function voteButton(level, key, tally, mine, label, commentId) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "vote";
  button.textContent = (mine ? "Voted" : "Vote") + " " + tally;
  button.setAttribute("aria-pressed", mine ? "true" : "false");
  button.setAttribute("aria-label", label);
  button.addEventListener("click", async () => {
    try {
      const view = await callApi({
        action: "vote",
        level,
        key: level === "topic" ? undefined : key,
        comment: commentId,
      });
      render(view);
    } catch (error) {
      status.textContent = error.message;
    }
  });
  return button;
}

function render(view) {
  currentView = view;
  const path = route();
  if (path.topic) {
    title.textContent = path.topic;
    topicLabel.hidden = true;
    blurb.textContent = path.subtopic
      ? "This address is one argument. It stays empty until someone writes it."
      : "A post can sit in more than one argument, or in none.";
  } else {
    title.textContent = "Try it out";
    topicLabel.hidden = false;
    blurb.textContent = "Name a short topic, then write. Opening this page does not start the topic.";
  }
  if (view && view.visitor && view.visitor.name && !nameInput.value) {
    nameInput.value = view.visitor.chosen ? view.visitor.name : "";
    if (!view.visitor.chosen) nameInput.placeholder = view.visitor.name;
  }
  filing.hidden = !(view && view.filing_line);
  filing.textContent = view && view.filing_line ? view.filing_line : "";
  notices.replaceChildren();
  (view && view.notices ? view.notices : []).forEach((notice) => {
    const line = document.createElement("p");
    line.className = "notice";
    line.textContent = "This section was updated: " + notice.section + " (" + notice.kind + ").";
    notices.append(line);
  });
  paintSlots(view);
  board.replaceChildren();
  if (!view || !view.exists) {
    if (path.subtopic) {
      const missing = document.createElement("p");
      missing.textContent = path.subtopic + " is not a directory yet. A suggestion does not open it.";
      board.append(missing);
    }
    return;
  }
  const topicVote = document.createElement("p");
  const any = Object.values(view.sections)[0];
  if (any) topicVote.append(voteButton("topic", "", any.topic_tally, any.topic_mine, "Vote on this topic"));
  board.append(topicVote);
  const used = new Set();
  (view.pairs || []).forEach((pair) => {
    const row = document.createElement("div");
    row.className = "pair-row";
    pair.forEach((key) => {
      used.add(key);
      if (view.sections[key]) row.append(sectionNode(key, view.sections[key]));
    });
    board.append(row);
  });
  Object.keys(view.sections).forEach((key) => {
    if (used.has(key) || key === "uncategorized") return;
    board.append(sectionNode(key, view.sections[key]));
  });
  if (view.sections.uncategorized && view.sections.uncategorized.comments.length) {
    board.append(sectionNode("uncategorized", view.sections.uncategorized));
  }
  (view.suggestions || []).forEach((item) => {
    const aside = document.createElement("aside");
    aside.className = "suggestion-card";
    const heading = document.createElement("h2");
    heading.textContent = "Suggested: " + item.key;
    const cite = document.createElement("p");
    cite.textContent = item.citation ? "Citation: " + item.citation : "";
    const note = document.createElement("p");
    note.textContent = "This is a suggestion, not a directory, until someone writes the first words there.";
    aside.append(heading, cite, note);
    board.append(aside);
  });
  const focus = document.getElementById("slot-" + path.subtopic);
  if (focus) focus.scrollIntoView({ block: "nearest" });
}

async function refresh() {
  const path = route();
  if (!path.topic && !topic()) {
    render(null);
    return;
  }
  if (!path.topic) return;
  const params = new URLSearchParams({
    topic: path.topic,
    subtopic: path.subtopic,
    visitor: visitorId(),
  });
  const response = await fetch("/api/debate?" + params.toString(), { credentials: "same-origin" });
  const view = await response.json();
  if (!response.ok) throw new Error(view.error || "The debate could not be read.");
  render(view);
}

post.addEventListener("input", debounce(async () => {
  suggestion.replaceChildren();
  if (!topic() || !post.value.trim()) {
    suggestion.textContent = "The key appears here only when that category already exists.";
    return;
  }
  try {
    const preview = await callApi({ action: "preview", body: post.value });
    if (!preview.suggestion) {
      suggestion.textContent = "No existing category is suggested. Choosing nothing leaves the post uncategorized.";
      return;
    }
    suggestion.append("Suggested starting slot: " + preview.suggestion + ". ");
    const use = document.createElement("button");
    use.type = "button";
    use.id = "use-suggestion";
    use.className = "text-button";
    use.textContent = "Use this starting slot";
    use.addEventListener("click", () => selectSlot(preview.suggestion));
    suggestion.append(use);
  } catch (error) {
    suggestion.textContent = error.message;
  }
}, 240));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "";
  const body = post.value.trim();
  if (!topic() || !body) return;
  try {
    const filed = await callApi({
      action: "submit",
      body,
      chosen: chosen,
      name: nameInput.value.trim(),
    });
    status.textContent = "Starting slot: " + filed.starting + ".";
    if (!route().topic) {
      history.pushState({}, "", "/try/" + filed.topic);
    }
    const drained = await callApi({ action: "drain" });
    const match = findComment(drained.view, body);
    status.textContent = placementText(match || { starting: filed.starting, key: filed.starting, keys: [] });
    post.value = "";
    chosen = "";
    render(drained.view);
  } catch (error) {
    status.textContent = error.message;
  }
});

function placementText(comment) {
  const start = comment.starting || "uncategorized";
  const keys = (comment.keys && comment.keys.length ? comment.keys : [comment.key])
    .filter((key) => key && key !== "uncategorized");
  if (!keys.length) return "Starting slot: " + start + ". It is in no category.";
  if (keys.length === 1 && keys[0] === start) return "Starting slot: " + start + ".";
  return "Starting slot: " + start + ". Batch placed it in " + keys.join(" and ") + ".";
}

function findComment(view, body) {
  if (!view || !view.sections) return null;
  let found = null;
  Object.values(view.sections).forEach((section) => {
    section.comments.forEach((comment) => {
      if (comment.text === body) found = comment;
    });
  });
  return found;
}

document.getElementById("save-visitor").addEventListener("click", async () => {
  try {
    const offered = await callApi({ action: "passkey", op: "options" });
    if (!window.PublicKeyCredential || !navigator.credentials) {
      status.textContent = "Anonymous id is enough. This browser has no passkey prompt.";
      return;
    }
    const publicKey = offered.options;
    publicKey.challenge = crypto.getRandomValues(new Uint8Array(32));
    publicKey.user.id = new TextEncoder().encode(visitorId());
    const created = await navigator.credentials.create({ publicKey });
    const credentialId = btoa(String.fromCharCode(...new Uint8Array(created.rawId)));
    await callApi({
      action: "passkey",
      op: "register",
      credential_id: credentialId,
      public_key: "browser",
    });
    status.textContent = "This visitor is saved on this browser. Posting still works without it.";
  } catch (error) {
    status.textContent = "Anonymous id is enough. A passkey was not created.";
  }
});

window.addEventListener("popstate", () => {
  refresh().catch((error) => {
    status.textContent = error.message;
  });
});

refresh().catch((error) => {
  status.textContent = error.message;
});
