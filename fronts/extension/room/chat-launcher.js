/**
 * Header corner chat button + dockable in-page panel.
 * Prefers Chrome extension side panel when present.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      root.CleverTreeRoom,
      root.CleverTreeChannelRoute,
      root.CleverTreeContextTags
    );
  } else {
    root.ClevertreeChatLauncher = factory(
      root.CleverTreeRoom,
      root.CleverTreeChannelRoute,
      root.CleverTreeContextTags
    );
  }
})(typeof self !== "undefined" ? self : this, function (Room, Route, Tags) {
  "use strict";

  var EXT_IDS = [];
  var DOCK_KEY = "clevertree.chat.dock";
  var MSG_TYPE = "clevertree.chat.toggle";

  var state = {
    open: false,
    dock: "right",
    api: null,
    host: null,
    btn: null,
    opts: {},
    extId: "",
  };

  function rememberExtId(id) {
    if (!id) return;
    state.extId = id;
    if (EXT_IDS.indexOf(id) < 0) EXT_IDS.unshift(id);
    try {
      localStorage.setItem("clevertree.extension.id", id);
    } catch (e) {}
  }

  function knownExtIds() {
    var ids = EXT_IDS.slice();
    try {
      var stored = localStorage.getItem("clevertree.extension.id");
      if (stored && ids.indexOf(stored) < 0) ids.unshift(stored);
    } catch (e) {}
    try {
      var meta = document.querySelector('meta[name="clevertree-extension-id"]');
      if (meta && meta.content && ids.indexOf(meta.content) < 0) {
        ids.unshift(meta.content);
      }
    } catch (e2) {}
    return ids;
  }

  try {
    window.addEventListener("message", function (ev) {
      var d = ev && ev.data;
      if (!d || d.source !== "clevertree-chat-extension") return;
      if (d.type === "clevertree.extension.ready" && d.id) rememberExtId(d.id);
    });
  } catch (e) {}

  function readDock() {
    try {
      var d = localStorage.getItem(DOCK_KEY);
      if (d === "bottom" || d === "left" || d === "top" || d === "right") return d;
    } catch (e) {}
    return "right";
  }

  function writeDock(d) {
    try {
      localStorage.setItem(DOCK_KEY, d);
    } catch (e) {}
  }

  function probeExtension(payload, cb) {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
      cb(false);
      return;
    }
    var tried = 0;
    var ids = knownExtIds();
    if (!ids.length) {
      cb(false);
      return;
    }
    function next() {
      if (tried >= ids.length) {
        cb(false);
        return;
      }
      var id = ids[tried++];
      try {
        chrome.runtime.sendMessage(id, payload, function (res) {
          if (chrome.runtime.lastError || !res || !res.ok) {
            next();
            return;
          }
          rememberExtId(id);
          cb(true, res);
        });
      } catch (e) {
        next();
      }
    }
    next();
  }

  function ensureShell(opts) {
    if (state.host) return state.host;
    var host = document.createElement("div");
    host.className = "ct-chat-dock";
    host.setAttribute("data-dock", state.dock);
    host.hidden = true;
    host.innerHTML =
      '<div class="ct-chat-dock-bar">' +
      '<span class="ct-chat-dock-title">Clevertree Chat</span>' +
      '<div class="ct-chat-dock-actions">' +
      '<button type="button" data-dock-pos="left" title="Dock left">◂</button>' +
      '<button type="button" data-dock-pos="right" title="Dock right">▸</button>' +
      '<button type="button" data-dock-pos="bottom" title="Dock bottom">▾</button>' +
      '<button type="button" data-dock-pos="top" title="Dock top">▴</button>' +
      '<button type="button" data-role="close" aria-label="Close chat">×</button>' +
      "</div></div>" +
      '<div class="ct-chat-dock-body" data-role="room"></div>';
    document.body.appendChild(host);
    host.querySelector('[data-role="close"]').onclick = function () {
      close();
    };
    var btns = host.querySelectorAll("[data-dock-pos]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].onclick = function (ev) {
        var pos = ev.currentTarget.getAttribute("data-dock-pos");
        state.dock = pos;
        writeDock(pos);
        host.setAttribute("data-dock", pos);
      };
    }
    state.host = host;
    return host;
  }

  function mountRoom(opts) {
    if (!Room || !Room.mount) return;
    var host = ensureShell(opts);
    var root = host.querySelector('[data-role="room"]');
    root.innerHTML = "";
    var route =
      Route && Route.routeForUrl
        ? Route.routeForUrl(opts.url || location.href, {
            topicId: opts.topicId,
            channel: opts.channel,
            title: opts.title,
          })
        : {
            channel: opts.channel || "#web",
            title: opts.title || "Chat",
            topicId: opts.topicId != null ? opts.topicId : 0,
            domain: opts.domain || "",
          };
    var ctx = {};
    if (route.topicId !== null && route.topicId !== undefined) ctx.topicId = route.topicId;
    if (route.domain) ctx.domain = route.domain;
    if (state.api && state.api.destroy) {
      try {
        state.api.destroy();
      } catch (e) {}
    }
    state.api = Room.mount(root, {
      mode: "embed",
      channel: route.channel,
      title: route.title,
      context: ctx,
      topics: opts.topics || [],
      siteOrigin: opts.siteOrigin || location.origin,
      showNetworker: false,
      apiBase: opts.apiBase || "https://api.clevertree.chat",
      wsUrl:
        opts.wsUrl ||
        "wss://api.clevertree.chat/api/chat/ws?topic=" +
          encodeURIComponent(route.channel.replace(/^#/, "")),
      mirrors: opts.mirrors,
    });
  }

  function open(opts) {
    opts = opts || state.opts || {};
    state.opts = opts;
    var payload = {
      type: MSG_TYPE,
      action: "open",
      url: opts.url || location.href,
      topicId: opts.topicId,
      channel: opts.channel,
    };
    probeExtension(payload, function (ok) {
      if (ok) {
        state.open = true;
        syncBtn();
        return;
      }
      state.dock = readDock();
      var host = ensureShell(opts);
      host.setAttribute("data-dock", state.dock);
      host.hidden = false;
      mountRoom(opts);
      state.open = true;
      syncBtn();
    });
  }

  function close() {
    probeExtension({ type: MSG_TYPE, action: "close" }, function () {});
    if (state.host) state.host.hidden = true;
    state.open = false;
    syncBtn();
  }

  function toggle(opts) {
    if (state.open) close();
    else open(opts);
  }

  function syncBtn() {
    if (!state.btn) return;
    state.btn.setAttribute("aria-pressed", state.open ? "true" : "false");
    state.btn.classList.toggle("is-open", state.open);
  }

  function injectStyles() {
    if (document.getElementById("ct-chat-launcher-css")) return;
    var s = document.createElement("style");
    s.id = "ct-chat-launcher-css";
    s.textContent =
      ".ct-chat-fab{position:fixed;z-index:2147483000;right:1rem;bottom:1rem;width:3rem;height:3rem;border-radius:999px;border:1px solid #879c8b;background:#285c46;color:#fff;font:600 0.85rem/1 Source Sans 3,Lato,sans-serif;cursor:pointer;box-shadow:0 8px 24px #23352b33}" +
      ".ct-chat-fab.is-open{background:#23352b}" +
      ".ct-chat-dock{position:fixed;z-index:2147482990;display:flex;flex-direction:column;background:#f2f4ef;border:1px solid #c5d0c5;box-shadow:0 12px 40px #23352b33}" +
      '.ct-chat-dock[data-dock="right"]{top:0;right:0;bottom:0;width:min(420px,100vw)}' +
      '.ct-chat-dock[data-dock="left"]{top:0;left:0;bottom:0;width:min(420px,100vw)}' +
      '.ct-chat-dock[data-dock="bottom"]{left:0;right:0;bottom:0;height:min(48vh,520px)}' +
      '.ct-chat-dock[data-dock="top"]{left:0;right:0;top:0;height:min(48vh,520px)}' +
      ".ct-chat-dock-bar{display:flex;align-items:center;justify-content:space-between;gap:0.5rem;padding:0.4rem 0.6rem;border-bottom:1px solid #c5d0c5;background:#e5ece5;font:600 0.85rem Source Sans 3,Lato,sans-serif;color:#23352b}" +
      ".ct-chat-dock-actions button{border:0;background:transparent;cursor:pointer;font-size:1rem;padding:0.25rem 0.35rem}" +
      ".ct-chat-dock-body{flex:1;min-height:0;overflow:hidden}" +
      ".ct-chat-dock-body .room{height:100%}";
    document.head.appendChild(s);
  }

  function mountButton(selOrEl, opts) {
    injectStyles();
    state.opts = opts || {};
    state.dock = readDock();
    var el =
      typeof selOrEl === "string" ? document.querySelector(selOrEl) : selOrEl;
    if (!el) {
      el = document.createElement("button");
      el.type = "button";
      el.className = "ct-chat-fab";
      el.textContent = "Chat";
      el.setAttribute("aria-label", "Open Clevertree Chat");
      document.body.appendChild(el);
    }
    state.btn = el;
    el.addEventListener("click", function () {
      toggle(state.opts);
    });
    syncBtn();
    return {
      open: open,
      close: close,
      toggle: toggle,
      setOptions: function (o) {
        state.opts = o || {};
      },
    };
  }

  return {
    mountButton: mountButton,
    open: open,
    close: close,
    toggle: toggle,
    MSG_TYPE: MSG_TYPE,
  };
});
