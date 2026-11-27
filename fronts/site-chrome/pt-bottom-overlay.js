/**
 * <pt-bottom-overlay> — portable bottom chrome (UI only).
 * Order: Top → Chat → AI → Play → Settings.
 * Hosts wire backends via CustomEvents (pt-overlay:*).
 */
(function (global) {
  "use strict";

  var TAG = "pt-bottom-overlay";
  var CSS_HREF =
    (typeof document !== "undefined" &&
      document.currentScript &&
      document.currentScript.src &&
      document.currentScript.src.replace(/[^/]+$/, "pt-bottom-overlay.css")) ||
    "https://clevertree.chat/fronts/site-chrome/pt-bottom-overlay.css";

  var ICONS = {
    top:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="18 15 12 9 6 15"></polyline></svg>',
    chat:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
    close:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
    ai:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"></path><circle cx="5" cy="18" r="1"></circle><circle cx="19" cy="17" r="1"></circle></svg>',
    play:
      '<svg class="pt-bo-icon-play" viewBox="0 0 24 24" aria-hidden="true"><polygon points="8 5 19 12 8 19 8 5"></polygon></svg>',
    pause:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none"></rect><rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none"></rect></svg>',
    stop:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" fill="currentColor" stroke="none"></rect></svg>',
    settings:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>',
  };

  function ensureCss() {
    if (document.getElementById("pt-bottom-overlay-css")) return;
    var link = document.createElement("link");
    link.id = "pt-bottom-overlay-css";
    link.rel = "stylesheet";
    link.href = CSS_HREF;
    document.head.appendChild(link);
  }

  function boolAttr(el, name) {
    return el.hasAttribute(name);
  }

  function PtBottomOverlay() {
    return Reflect.construct(HTMLElement, [], PtBottomOverlay);
  }
  PtBottomOverlay.prototype = Object.create(HTMLElement.prototype);
  PtBottomOverlay.prototype.constructor = PtBottomOverlay;
  Object.setPrototypeOf(PtBottomOverlay, HTMLElement);

  PtBottomOverlay.observedAttributes = [
    "scrolled",
    "chat-open",
    "playing",
    "session",
    "show-ai",
    "show-settings",
    "settings-open",
    "seek-max",
    "seek-value",
    "error",
    "busy",
  ];

  PtBottomOverlay.prototype.connectedCallback = function () {
    ensureCss();
    if (this._built) {
      this._sync();
      return;
    }
    this._built = true;
    this._seekDragging = false;
    var root = document.createElement("div");
    root.className = "pt-bo";
    root.setAttribute("data-pt-bo-root", "1");
    root.innerHTML =
      '<div class="pt-bo-err" data-role="err" hidden>' +
      '<span class="pt-bo-err-msg" data-role="err-msg"></span>' +
      '<div class="pt-bo-err-actions">' +
      '<button type="button" data-action="retry">Retry</button>' +
      '<button type="button" class="pt-bo-err-dismiss" data-action="dismiss-error" aria-label="Dismiss">×</button>' +
      "</div></div>" +
      '<div class="pt-bo-panel">' +
      '<div class="pt-bo-row" data-role="row">' +
      '<button type="button" class="pt-bo-btn pt-bo-top" data-action="top" aria-label="Back to top" title="Back to top">' +
      ICONS.top +
      "</button>" +
      '<button type="button" class="pt-bo-btn pt-bo-chat" data-action="chat" aria-label="Open chat" title="Chat" aria-pressed="false">' +
      ICONS.chat +
      "</button>" +
      '<button type="button" class="pt-bo-btn pt-bo-ai" data-action="ai" aria-label="Ask site AI" title="Ask site AI">' +
      ICONS.ai +
      "</button>" +
      '<button type="button" class="pt-bo-btn pt-bo-play" data-action="play" aria-label="Play article" title="Play">' +
      ICONS.play +
      "</button>" +
      '<button type="button" class="pt-bo-btn pt-bo-stop" data-action="stop" aria-label="Stop" title="Stop" hidden>' +
      ICONS.stop +
      "</button>" +
      '<div class="pt-bo-seek" data-role="seek" hidden>' +
      '<input type="range" min="0" max="0" value="0" step="1" aria-label="Seek position in article" data-role="seek-input" />' +
      '<span class="pt-bo-count" data-role="count">1 / 1</span>' +
      "</div>" +
      '<button type="button" class="pt-bo-btn pt-bo-settings" data-action="settings" aria-label="TTS settings" title="Settings" aria-expanded="false">' +
      ICONS.settings +
      "</button>" +
      "</div>" +
      '<div class="pt-bo-settings-panel" data-role="settings-panel" hidden></div>' +
      "</div>";
    this.insertBefore(root, this.firstChild);
    this._root = root;
    this._adoptSettings();
    this.addEventListener("click", this._onClick.bind(this));
    var seek = root.querySelector('[data-role="seek-input"]');
    if (seek) {
      seek.addEventListener(
        "pointerdown",
        function () {
          this._seekDragging = true;
        }.bind(this)
      );
      seek.addEventListener(
        "input",
        function (ev) {
          this._updateCount(parseInt(ev.target.value, 10) || 0);
        }.bind(this)
      );
      seek.addEventListener(
        "change",
        function (ev) {
          this._seekDragging = false;
          this._emit("pt-overlay:seek", {
            index: parseInt(ev.target.value, 10) || 0,
          });
        }.bind(this)
      );
      seek.addEventListener(
        "pointerup",
        function (ev) {
          if (!this._seekDragging) return;
          this._seekDragging = false;
          this._emit("pt-overlay:seek", {
            index: parseInt(ev.target.value, 10) || 0,
          });
        }.bind(this)
      );
    }
    this._sync();
  };

  PtBottomOverlay.prototype._adoptSettings = function () {
    var panel = this._root && this._root.querySelector('[data-role="settings-panel"]');
    if (!panel) return;
    var kids = Array.prototype.slice.call(this.children);
    for (var i = 0; i < kids.length; i++) {
      var kid = kids[i];
      if (kid === this._root) continue;
      if (kid.getAttribute && kid.getAttribute("slot") === "settings") {
        panel.appendChild(kid);
      }
    }
  };

  PtBottomOverlay.prototype.attributeChangedCallback = function () {
    if (this._built) this._sync();
  };

  PtBottomOverlay.prototype._emit = function (type, detail) {
    this.dispatchEvent(
      new CustomEvent(type, {
        bubbles: true,
        composed: true,
        detail: detail || {},
      })
    );
  };

  PtBottomOverlay.prototype._onClick = function (ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest("[data-action]") : null;
    if (!btn || !this.contains(btn)) return;
    var action = btn.getAttribute("data-action");
    if (action === "top") this._emit("pt-overlay:top");
    else if (action === "chat") this._emit("pt-overlay:chat", { open: !boolAttr(this, "chat-open") });
    else if (action === "ai") this._emit("pt-overlay:ai");
    else if (action === "play") {
      if (boolAttr(this, "playing")) this._emit("pt-overlay:pause");
      else this._emit("pt-overlay:play");
    } else if (action === "stop") this._emit("pt-overlay:stop");
    else if (action === "settings") {
      if (boolAttr(this, "settings-open")) this.removeAttribute("settings-open");
      else this.setAttribute("settings-open", "");
      this._emit("pt-overlay:settings", { open: boolAttr(this, "settings-open") });
    } else if (action === "retry") this._emit("pt-overlay:retry");
    else if (action === "dismiss-error") this._emit("pt-overlay:dismiss-error");
  };

  PtBottomOverlay.prototype._updateCount = function (idx) {
    var max = parseInt(this.getAttribute("seek-max") || "0", 10) || 0;
    var root = this._root || this;
    var count = root.querySelector('[data-role="count"]');
    if (count) count.textContent = max > 0 ? idx + 1 + " / " + max : "";
  };

  PtBottomOverlay.prototype._sync = function () {
    var scrolled = boolAttr(this, "scrolled");
    var chatOpen = boolAttr(this, "chat-open");
    var playing = boolAttr(this, "playing");
    var session = boolAttr(this, "session");
    var showAi = this.getAttribute("show-ai") !== "false";
    var showSettings = this.getAttribute("show-settings") !== "false";
    var settingsOpen = boolAttr(this, "settings-open");
    var seekMax = parseInt(this.getAttribute("seek-max") || "0", 10) || 0;
    var seekValue = parseInt(this.getAttribute("seek-value") || "0", 10) || 0;
    var err = this.getAttribute("error") || "";
    var busy = boolAttr(this, "busy");

    var root = this._root || this;
    var top = root.querySelector(".pt-bo-top");
    var chat = root.querySelector(".pt-bo-chat");
    var ai = root.querySelector(".pt-bo-ai");
    var play = root.querySelector(".pt-bo-play");
    var stop = root.querySelector(".pt-bo-stop");
    var settings = root.querySelector(".pt-bo-settings");
    var seek = root.querySelector('[data-role="seek"]');
    var seekInput = root.querySelector('[data-role="seek-input"]');
    var errEl = root.querySelector('[data-role="err"]');
    var errMsg = root.querySelector('[data-role="err-msg"]');
    var settingsPanel = root.querySelector('[data-role="settings-panel"]');

    if (top) top.hidden = !scrolled;
    if (ai) ai.hidden = !showAi;
    if (settings) {
      settings.hidden = !showSettings;
      settings.setAttribute("aria-expanded", settingsOpen ? "true" : "false");
    }
    if (settingsPanel) settingsPanel.hidden = !settingsOpen;
    if (stop) stop.hidden = !session;
    if (seek) seek.hidden = !(session && seekMax > 0);
    if (seekInput && !this._seekDragging) {
      seekInput.max = String(Math.max(0, seekMax - 1));
      seekInput.value = String(Math.min(seekValue, Math.max(0, seekMax - 1)));
      this._updateCount(seekValue);
    }
    if (play) {
      play.disabled = !!busy;
      play.setAttribute("aria-busy", busy ? "true" : "false");
      play.setAttribute("aria-label", playing ? "Pause" : "Play article");
      play.title = playing ? "Pause" : "Play";
      play.innerHTML = playing ? ICONS.pause : ICONS.play;
    }
    if (chat) {
      chat.classList.toggle("is-open", chatOpen);
      chat.setAttribute("aria-pressed", chatOpen ? "true" : "false");
      chat.setAttribute("aria-label", chatOpen ? "Close chat" : "Open chat");
      chat.title = chatOpen ? "Close chat" : "Chat";
      chat.innerHTML = chatOpen ? ICONS.close : ICONS.chat;
    }
    if (errEl && errMsg) {
      if (err) {
        errEl.hidden = false;
        errMsg.textContent = err;
      } else {
        errEl.hidden = true;
        errMsg.textContent = "";
      }
    }
  };

  /* Public helpers for hosts */
  PtBottomOverlay.prototype.setChatOpen = function (open) {
    if (open) this.setAttribute("chat-open", "");
    else this.removeAttribute("chat-open");
  };
  PtBottomOverlay.prototype.setPlaying = function (playing) {
    if (playing) this.setAttribute("playing", "");
    else this.removeAttribute("playing");
  };
  PtBottomOverlay.prototype.setScrolled = function (scrolled) {
    if (scrolled) this.setAttribute("scrolled", "");
    else this.removeAttribute("scrolled");
  };

  if (!global.customElements.get(TAG)) {
    global.customElements.define(TAG, PtBottomOverlay);
  }
  global.PtBottomOverlay = PtBottomOverlay;
})(typeof window !== "undefined" ? window : globalThis);
