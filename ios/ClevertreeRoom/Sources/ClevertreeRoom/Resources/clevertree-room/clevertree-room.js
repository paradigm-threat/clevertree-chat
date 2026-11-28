/**
 * CleverTree public IRC room component (shared by web, embed, Relay extension).
 *
 * Modes: "page" | "embed" | "sidepanel"
 * Gather/Refresh is NEVER part of this component — Relay wraps it.
 *
 * Mount:
 *   CleverTreeRoom.mount(el, {
 *     mode: "embed",
 *     channel: "#ga-savannah-cat-rescue",
 *     title: "Savannah Cat Rescue",
 *     collectionId: "savannah-cat-rescue",
 *     apiBase: "https://api.clevertree.chat",
 *     mirrors: ["wss://pub1.relaygateway.net/chat/ws", ...],
 *     context: { topic, collection, ndGroup, ndPost },
 *     showGather: false, // ignored / forced false
 *   });
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      typeof require !== "undefined" ? require("./context-tags.js") : null
    );
  } else {
    root.CleverTreeRoom = factory(root.CleverTreeContextTags || null);
  }
})(typeof self !== "undefined" ? self : this, function (Tags) {
  "use strict";

  Tags = Tags || {
    autoTag: function (b) {
      return b;
    },
    renderHtml: function (t) {
      return String(t || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    },
    stripTags: function (t) {
      return t;
    },
  };

  var BOT_NICKS = ["clevertree", "clevertree-si", "clevertree-ai", "relay-bot"];
  /** Separate from MyProblem site theme (`myproblem.theme`). */
  var THEME_KEY = "clevertree.room.theme";
  var COALESCE_KEY = "clevertree.room.coalesce";
  var COALESCE_DEFAULT_GAP_MIN = 15;
  /** Visual modes: normal | combined | paragraph (server log never rewritten). */
  var COALESCE_MODES = ["normal", "combined", "paragraph"];
  var VISITOR_KEY = "clevertree.visitor";

  function normalizeCoalesceMode(mode, enabledLegacy) {
    mode = String(mode || "").toLowerCase();
    if (COALESCE_MODES.indexOf(mode) >= 0) return mode;
    /* Migrate prior { enabled: bool } prefs. */
    if (enabledLegacy) return "combined";
    return "normal";
  }

  function readCoalescePrefs() {
    try {
      var raw = localStorage.getItem(COALESCE_KEY);
      if (!raw)
        return { mode: "normal", gapMinutes: COALESCE_DEFAULT_GAP_MIN };
      var parsed = JSON.parse(raw);
      var gap = Number(parsed && parsed.gapMinutes);
      if (!isFinite(gap) || gap < 1) gap = COALESCE_DEFAULT_GAP_MIN;
      if (gap > 120) gap = 120;
      return {
        mode: normalizeCoalesceMode(
          parsed && parsed.mode,
          parsed && parsed.enabled
        ),
        gapMinutes: Math.round(gap),
      };
    } catch (e) {
      return { mode: "normal", gapMinutes: COALESCE_DEFAULT_GAP_MIN };
    }
  }

  function persistCoalescePrefs(prefs) {
    prefs = prefs || readCoalescePrefs();
    var gap = Number(prefs.gapMinutes);
    if (!isFinite(gap) || gap < 1) gap = COALESCE_DEFAULT_GAP_MIN;
    if (gap > 120) gap = 120;
    var out = {
      mode: normalizeCoalesceMode(prefs.mode, prefs.enabled),
      gapMinutes: Math.round(gap),
    };
    try {
      localStorage.setItem(COALESCE_KEY, JSON.stringify(out));
    } catch (e) {}
    return out;
  }

  function messageTs(msg) {
    if (!msg) return null;
    if (typeof msg.sentAt === "number" && isFinite(msg.sentAt)) return msg.sentAt;
    if (typeof msg.ts === "number" && isFinite(msg.ts)) {
      return msg.ts < 1e12 ? msg.ts * 1000 : msg.ts;
    }
    var t = msg.time;
    if (t == null || t === "" || t === "…") return null;
    if (t === "now") return Date.now();
    if (typeof t === "number" && isFinite(t)) return t < 1e12 ? t * 1000 : t;
    var asNum = Number(t);
    if (isFinite(asNum) && asNum > 1e9) {
      return asNum < 1e12 ? asNum * 1000 : asNum;
    }
    var parsed = Date.parse(String(t));
    if (!isNaN(parsed)) return parsed;
    return null;
  }

  function nicksMatch(a, b) {
    var na = String(a || "")
      .trim()
      .toLowerCase();
    var nb = String(b || "")
      .trim()
      .toLowerCase();
    if (!na || !nb) return false;
    return na === nb;
  }

  function speakersMatch(a, b) {
    if (!a || !b) return false;
    if (nicksMatch(a.nick, b.nick)) return true;
    if (
      (a.self || nicksMatch(a.nick, "you")) &&
      (b.self || nicksMatch(b.nick, "you"))
    ) {
      return true;
    }
    return false;
  }

  /** Pure: should next follow prev in one visual section? */
  function canCoalesce(prev, next, prefs) {
    prefs = prefs || readCoalescePrefs();
    if (!prefs || prefs.mode === "normal" || !prev || !next) return false;
    if (prev.failed || next.failed) return false;
    if (!speakersMatch(prev, next)) return false;
    var prevTs = messageTs(prev);
    var nextTs = messageTs(next);
    if (prevTs == null || nextTs == null) return false;
    var gapMs = Math.max(1, prefs.gapMinutes || COALESCE_DEFAULT_GAP_MIN) * 60 * 1000;
    return nextTs - prevTs < gapMs;
  }

  /**
   * Pure visual grouping over an immutable row list (server log + pending outbox).
   * Does not mutate inputs.
   */
  function groupMessagesForDisplay(rows, prefs) {
    prefs = prefs || readCoalescePrefs();
    var list = Array.isArray(rows) ? rows : [];
    var groups = [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (!m || !m.text) continue;
      var last = groups.length ? groups[groups.length - 1] : null;
      if (
        last &&
        prefs.mode !== "normal" &&
        canCoalesce(last.tail, m, prefs)
      ) {
        last.lines.push(m);
        last.tail = m;
        if (m.pending) last.pending = true;
        if (m.failed) last.failed = true;
        if (m.self) last.self = true;
        if (m.clientId) last.clientId = m.clientId;
        if (m.sentAt) last.sentAt = m.sentAt;
      } else {
        groups.push({
          nick: m.nick || "anon",
          time: m.time || "",
          lines: [m],
          tail: m,
          pending: !!m.pending,
          failed: !!m.failed,
          self: !!m.self,
          clientId: m.clientId || "",
          sentAt: m.sentAt || null,
        });
      }
    }
    return groups;
  }

  function mintVisitorId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      try {
        return crypto.randomUUID();
      } catch (e) {}
    }
    // RFC4122-ish fallback for older WebViews without randomUUID.
    var bytes = new Array(16);
    for (var i = 0; i < 16; i++) bytes[i] = (Math.random() * 256) | 0;
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = bytes
      .map(function (b) {
        return (b + 0x100).toString(16).slice(1);
      })
      .join("");
    return (
      hex.slice(0, 8) +
      "-" +
      hex.slice(8, 12) +
      "-" +
      hex.slice(12, 16) +
      "-" +
      hex.slice(16, 20) +
      "-" +
      hex.slice(20)
    );
  }

  function ensureVisitor(opts) {
    if (opts && opts.visitor) return String(opts.visitor);
    try {
      var id = localStorage.getItem(VISITOR_KEY);
      if (!id) {
        id = mintVisitorId();
        localStorage.setItem(VISITOR_KEY, id);
      }
      return id || mintVisitorId();
    } catch (e) {
      return mintVisitorId();
    }
  }

  function withVisitorParam(url, visitor) {
    if (!url || !visitor) return url;
    try {
      var base =
        typeof location !== "undefined" && location.href
          ? location.href
          : "https://api.clevertree.chat/";
      var u = new URL(url, base);
      if (!u.searchParams.get("visitor")) {
        u.searchParams.set("visitor", visitor);
      }
      return u.toString();
    } catch (e) {
      return (
        url +
        (url.indexOf("?") >= 0 ? "&" : "?") +
        "visitor=" +
        encodeURIComponent(visitor)
      );
    }
  }
  var THEME_SUN =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.75"/><path d="M12 2v2.2M12 19.8V22M4.2 12H2M22 12h-2.2M5.05 5.05l1.56 1.56M17.39 17.39l1.56 1.56M5.05 18.95l1.56-1.56M17.39 6.61l1.56-1.56" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>';
  var THEME_MOON =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.5 14.2A8.2 8.2 0 0 1 9.8 3.5 7.4 7.4 0 1 0 20.5 14.2Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/></svg>';
  /* Kit icons (design/clevertree-chat-kit/icons/ui) — attach/send from kit; mic/video match stroke. */
  var ICON_ATTACH =
    '<svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m8 13 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 0" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_MIC =
    '<svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9" y="2" width="6" height="11" rx="3" stroke="currentColor" stroke-width="1.7"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M9 22h6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_VIDEO =
    '<svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2" y="6" width="13" height="12" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="m15 10 6-3v10l-6-3V10Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  var ICON_STOP =
    '<svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.7"/></svg>';
  var ICON_SEND =
    '<svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 20V4M5 11l7-7 7 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_CARET =
    '<svg class="icon channel-caret-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_MENU =
    '<svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  var ICON_CLOSE =
    '<svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';

  function $(root, sel) {
    return root.querySelector(sel);
  }

  function readThemePref() {
    try {
      var raw = localStorage.getItem(THEME_KEY);
      if (raw === "light" || raw === "dark" || raw === "system") return raw;
    } catch (e) {}
    return "system";
  }

  function systemTheme() {
    try {
      return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch (e) {
      return "light";
    }
  }

  function resolveRoomTheme(pref) {
    pref = pref || readThemePref();
    return pref === "light" || pref === "dark" ? pref : systemTheme();
  }

  function applyRoomTheme(el, resolved, pref) {
    if (!el) return;
    pref = pref || readThemePref();
    resolved = resolved === "dark" ? "dark" : "light";
    el.setAttribute("data-theme-pref", pref);
    el.setAttribute("data-theme", resolved);
    el.style.colorScheme = resolved;
    var btns = el.querySelectorAll('[data-role="theme-toggle"]');
    for (var i = 0; i < btns.length; i++) {
      var btn = btns[i];
      var next = resolved === "dark" ? "light" : "dark";
      btn.setAttribute(
        "aria-label",
        next === "light" ? "Switch room to light theme" : "Switch room to dark theme"
      );
      btn.title = btn.getAttribute("aria-label");
      btn.innerHTML = resolved === "dark" ? THEME_SUN : THEME_MOON;
    }
  }

  function persistRoomTheme(pref) {
    try {
      if (pref === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, pref);
    } catch (e) {}
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function nickInitials(nick) {
    var p = String(nick || "?").replace(/[^a-zA-Z0-9]/g, " ").trim().split(/\s+/);
    if (!p[0]) return "?";
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[0][0] + p[1][0]).toUpperCase();
  }

  function isBot(nick) {
    var n = String(nick || "").toLowerCase();
    return BOT_NICKS.indexOf(n) >= 0 || n.indexOf("clevertree") === 0;
  }

  var MEDIA_RE =
    /\[\[mp:media\s+([^\]]*)\]\]/gi;

  function parseMediaMarkers(text) {
    var out = [];
    var m;
    var re = new RegExp(MEDIA_RE.source, "gi");
    while ((m = re.exec(String(text || ""))) !== null) {
      var attrs = m[1] || "";
      var kind = (attrs.match(/\bkind=(\S+)/i) || [])[1] || "file";
      var url = (attrs.match(/\burl=(\S+)/i) || [])[1] || "";
      var review = (attrs.match(/\breview=(\S+)/i) || [])[1] || "pending";
      var sha = (attrs.match(/\bsha=(\S+)/i) || [])[1] || "";
      if (url) {
        out.push({
          kind: kind.toLowerCase(),
          url: url,
          review: String(review).toLowerCase(),
          sha: sha,
        });
      }
    }
    return out;
  }

  function stripMediaMarkers(text) {
    return String(text || "")
      .replace(MEDIA_RE, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function mediaKey(it) {
    return (it && (it.sha || it.url)) || "";
  }

  function effectiveReview(it, reviewMap) {
    var key = mediaKey(it);
    if (reviewMap && key && reviewMap[key]) return reviewMap[key];
    if (reviewMap && it && it.url && reviewMap[it.url]) return reviewMap[it.url];
    var r = (it && it.review) || "pending";
    return r === "clear" || r === "reject" ? r : "pending";
  }

  function mediaHtml(items, reviewMap) {
    if (!items || !items.length) return "";
    var html = "";
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var status = effectiveReview(it, reviewMap);
      var key = esc(mediaKey(it));
      var url = esc(it.url);
      if (it.kind === "image") {
        if (status === "clear") {
          html +=
            '<figure class="media media-image" data-media-key="' +
            key +
            '" data-review="clear"><img src="' +
            url +
            '" alt="Shared image" loading="lazy" decoding="async" /></figure>';
        } else {
          html +=
            '<figure class="media media-image media-covered" data-media-key="' +
            key +
            '" data-review="' +
            esc(status) +
            '">' +
            '<button type="button" class="shield" data-role="reveal-media" aria-label="Show image after AI review">' +
            (status === "reject"
              ? "Hidden — not cleared for this channel"
              : "Covered until AI review — click to peek") +
            "</button>" +
            '<img class="media-hidden" hidden src="' +
            url +
            '" alt="Shared image" loading="lazy" decoding="async" />' +
            "</figure>";
        }
      } else if (it.kind === "audio") {
        html +=
          '<div class="media media-audio" data-media-key="' +
          key +
          '" data-review="clear"><audio controls preload="none" src="' +
          url +
          '"></audio></div>';
      } else if (it.kind === "video") {
        if (status === "clear") {
          html +=
            '<div class="media media-video media-video-clear" data-media-key="' +
            key +
            '" data-review="clear">' +
            /* Chat media never autoplays — user presses play (single-active via MediaController). */
            '<video controls playsinline preload="metadata" data-role="room-video" src="' +
            url +
            '"></video>' +
            "</div>";
        } else {
          html +=
            '<div class="media media-video media-covered" data-media-key="' +
            key +
            '" data-review="' +
            esc(status) +
            '">' +
            '<button type="button" class="shield" data-role="reveal-media" aria-label="Show video after AI review">' +
            (status === "reject"
              ? "Hidden — not cleared for this channel"
              : "Covered until AI review — click to peek (muted)") +
            "</button>" +
            '<video class="media-hidden" hidden muted playsinline preload="metadata" data-role="room-video" src="' +
            url +
            '"></video>' +
            "</div>";
        }
      } else if (it.kind === "pdf" || it.kind === "text" || it.kind === "file") {
        var label =
          it.kind === "pdf" ? "PDF" : it.kind === "text" ? "Text file" : "File";
        html +=
          '<div class="media media-file" data-media-key="' +
          key +
          '"><a class="media-file-link" href="' +
          url +
          '" target="_blank" rel="noopener noreferrer">' +
          label +
          " — open / download</a></div>";
      }
    }
    return html;
  }

  function shouldClamp(text, bot) {
    var t = String(text || "");
    if (bot && t.length > 220) return true;
    if (t.length > 360) return true;
    if ((t.match(/\n/g) || []).length >= 3) return true;
    return false;
  }

  /** Turn #channel tokens into clickable switches (skips markup already inside tags). */
  function linkifyChannelRefs(html) {
    return String(html || "").replace(/(^|>)([^<]*)/g, function (_m, prefix, text) {
      var linked = String(text).replace(
        /(^|[\s([{'"“‘])(#[a-zA-Z][a-zA-Z0-9_-]{0,62})\b/g,
        function (_m2, lead, ch) {
          var norm = String(ch).toLowerCase();
          return (
            lead +
            '<button type="button" class="channel-link" data-role="channel-link" data-channel="' +
            esc(norm) +
            '" title="Switch to ' +
            esc(norm) +
            '">' +
            esc(ch) +
            "</button>"
          );
        }
      );
      return prefix + linked;
    });
  }

  function formatCopyHtml(text, cfg, reviewMap) {
    var plain = stripMediaMarkers(text);
    var media = mediaHtml(parseMediaMarkers(text), reviewMap);
    var bodyHtml = Tags.renderHtml(plain, cfg);
    var display = Tags.stripTags
      ? Tags.stripTags(plain)
      : plain;
    var html = bodyHtml || esc(display);
    return linkifyChannelRefs(html) + media;
  }

  function pickMirror(list, i) {
    if (!list || !list.length) return null;
    return list[Math.max(0, i || 0) % list.length];
  }

  function isWsUrl(url) {
    return /^wss?:\/\//i.test(String(url || "").trim());
  }

  /** Build WS mirrors from apiBase + channel when callers pass none (live.html / Android). */
  function defaultMirrors(apiBase, channel) {
    var topic = String(channel || "#web")
      .replace(/^#/, "")
      .trim() || "web";
    var base = String(apiBase || "https://api.clevertree.chat").replace(/\/$/, "");
    var wsHost = base.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
    var path = "/api/chat/ws?topic=" + encodeURIComponent(topic);
    var list = [wsHost + path];
    if (wsHost.indexOf("api.clevertree.chat") < 0) {
      list.push("wss://api.clevertree.chat" + path);
    }
    list.push("wss://pub1.relaygateway.net/chat/ws?topic=" + encodeURIComponent(topic));
    return list;
  }

  /**
   * Accept full wss URLs, or bare hosts (legacy sidepanel), and ensure ?topic=.
   * Drops junk so connect() never opens WebSocket("pub1.example").
   */
  function normalizeMirrors(list, apiBase, channel) {
    var topic = String(channel || "#web")
      .replace(/^#/, "")
      .trim() || "web";
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (raw) {
      var s = String(raw || "").trim();
      if (!s) return;
      if (!isWsUrl(s)) {
        if (/^[a-z0-9.-]+$/i.test(s)) {
          s =
            "wss://" +
            s +
            "/chat/ws?topic=" +
            encodeURIComponent(topic);
        } else {
          return;
        }
      }
      try {
        var u = new URL(s);
        if (!u.searchParams.get("topic")) {
          u.searchParams.set("topic", topic);
        }
        out.push(u.toString());
      } catch (e) {
        out.push(s);
      }
    });
    return out.length ? out : defaultMirrors(apiBase, channel);
  }

  /** Resolve room-sibling assets (channel-policy.json) from the script URL, not the page. */
  function roomAssetUrl(name) {
    try {
      var scripts = document.getElementsByTagName("script");
      for (var i = scripts.length - 1; i >= 0; i--) {
        var src = scripts[i].src || "";
        if (src.indexOf("clevertree-room.js") >= 0) {
          return new URL(name, src).toString();
        }
      }
    } catch (e) {}
    try {
      return new URL("/fronts/room/" + name, location.origin).toString();
    } catch (e2) {
      return name;
    }
  }

  var roomScriptLoads = {};

  /** Inject a room-sibling script once (resolved from roomAssetUrl). */
  function loadRoomScript(name, isReady) {
    if (isReady && isReady()) return Promise.resolve();
    if (roomScriptLoads[name]) return roomScriptLoads[name];
    roomScriptLoads[name] = new Promise(function (resolve) {
      try {
        var s = document.createElement("script");
        s.src = roomAssetUrl(name);
        s.async = false;
        s.onload = function () {
          resolve();
        };
        s.onerror = function () {
          delete roomScriptLoads[name];
          resolve();
        };
        (document.head || document.documentElement).appendChild(s);
      } catch (e) {
        resolve();
      }
    });
    return roomScriptLoads[name];
  }

  /** SI built-ins: media-controller.js then ct-builtins.js (skipped if already script-tagged). */
  function loadSiBuiltins() {
    return loadRoomScript("media-controller.js", function () {
      return !!window.ClevertreeMediaController;
    }).then(function () {
      return loadRoomScript("ct-builtins.js", function () {
        return !!window.ClevertreeSiMarkdown;
      });
    });
  }

  function shellHtml(opts) {
    var ch = esc(opts.channel || "#web");
    var title = esc(opts.title || "Public room");
    var mode = opts.mode || "page";
    var nw = !!opts.showNetworker;
    var sideLabel =
      mode === "sidepanel"
        ? '<div class="surface-label"><span>Chrome side panel · Clevertree</span><span>ROOM</span></div>'
        : "";
    var nwBar = nw
      ? '<div class="networker-bar" data-role="networker-bar" aria-label="Networker">' +
        '<button type="button" class="track" data-role="track" aria-pressed="false">Track group</button>' +
        '<button type="button" data-role="gather">Gather</button>' +
        '<button type="button" data-role="refresh">Refresh</button>' +
        "</div>"
      : "";
    return (
      sideLabel +
      nwBar +
      '<div class="menu-backdrop" data-role="menu-backdrop" hidden></div>' +
      '<nav class="menu-drawer" data-role="menu-drawer" id="ct-room-drawer" aria-label="Room menu" hidden>' +
      '<div class="menu-drawer-top">' +
      '<div class="menu-brand">Clevertree <small>Chat</small></div>' +
      '<button type="button" class="menu-close" data-role="menu-close" aria-label="Close menu">' +
      ICON_CLOSE +
      "</button></div>" +
      '<p class="menu-conn" data-role="status"><span class="dot" data-role="conn-dot"></span><strong data-role="conn">Connecting…</strong><span class="mirror" data-role="mirror"></span></p>' +
      '<h2 class="menu-room-title" data-role="menu-room-title">' +
      title +
      "</h2>" +
      '<div class="menu-section">' +
      '<label class="menu-label">Layout</label>' +
      '<div class="layout-switch-wrap" data-role="layout-switch-wrap">' +
      '<button type="button" class="layout-switch" data-role="layout-switch" aria-haspopup="listbox" aria-expanded="false" title="Layout mode" aria-label="Layout mode">' +
      '<span data-role="layout-label">Chat log</span>' +
      ICON_CARET +
      "</button>" +
      '<div class="layout-menu" data-role="layout-menu" role="listbox" aria-label="Layout modes" hidden>' +
      '<button type="button" class="layout-option" role="option" data-layout="chat">Chat log</button>' +
      '<button type="button" class="layout-option" role="option" data-layout="si">SI panel</button>' +
      '<button type="button" class="layout-option" role="option" data-layout="split">Split</button>' +
      "</div></div></div>" +
      '<div class="menu-section">' +
      '<label class="menu-label">Theme</label>' +
      '<button type="button" class="theme-toggle menu-theme" data-role="theme-toggle" aria-label="Toggle room theme"></button>' +
      "</div>" +
      '<div class="menu-section" data-role="coalesce-section">' +
      '<label class="menu-label">Posts</label>' +
      '<select class="menu-select" data-role="coalesce-mode" aria-label="How successive posts appear">' +
      '<option value="normal">Normal (each line separate)</option>' +
      '<option value="combined">Combined (one section, keep lines)</option>' +
      '<option value="paragraph">Combined paragraph</option>' +
      "</select>" +
      '<label class="menu-gap">' +
      "<span>Gap (minutes)</span>" +
      '<input type="number" data-role="coalesce-gap" min="1" max="120" step="1" value="15" />' +
      "</label>" +
      '<p class="menu-hint">Visual only — server history stays untouched. Gap applies when combining.</p>' +
      "</div>" +
      '<div class="menu-section">' +
      '<label class="menu-label">Orientation</label>' +
      '<div class="orient-toggle" role="group" aria-label="Board orientation">' +
      '<button type="button" class="orient-option" data-role="orient-left" data-orient="left" aria-pressed="true">Left</button>' +
      '<button type="button" class="orient-option" data-role="orient-right" data-orient="right" aria-pressed="false">Right</button>' +
      "</div>" +
      '<p class="menu-hint">Menu + SI share a side; chat log and draft stack on the opposite side.</p>' +
      "</div></nav>" +
      '<div class="body" data-role="body" aria-label="' +
      title +
      '">' +
      '<aside class="si-panel si-collapsed" data-role="si" aria-label="SI panel">' +
      '<header class="si-rail-head" data-role="si-head">' +
      '<button type="button" class="menu-fab" data-role="menu-fab" aria-label="Open menu" aria-expanded="false" aria-controls="ct-room-drawer">' +
      ICON_MENU +
      "</button>" +
      '<div class="si-tabs" data-role="si-tabs" role="tablist" aria-label="SI tabs" hidden></div>' +
      (nw
        ? '<p class="networker-mode-label" data-role="networker-mode-label">Networker</p>'
        : "") +
      '<button type="button" class="si-ext-open" data-role="ext-open" hidden aria-label="Open chat in Clevertree extension">' +
      "Open Chat" +
      "</button>" +
      "</header>" +
      '<div class="si-strip-body si-tab-panes" data-role="si-panes" hidden></div>' +
      '<div class="si-strip-body" data-role="ai-body"></div>' +
      "</aside>" +
      '<div class="panel-gutter" data-role="gutter-si" role="separator" aria-orientation="vertical" aria-label="Resize SI panel" hidden></div>' +
      '<div class="chat-stack" data-role="chat-stack">' +
      '<main class="chat" data-role="chat">' +
      '<header class="chat-log-head" data-role="chat-log-head">' +
      '<div class="chat-log-titles">' +
      '<h2 class="chat-log-title" data-role="chat-log-title">' +
      title +
      "</h2>" +
      '<p class="chat-log-sub" data-role="chat-log-sub">' +
      ch +
      "</p>" +
      '<p class="chat-log-pin" data-role="chat-log-pin" hidden></p>' +
      "</div>" +
      '<div class="channel-switch-wrap" data-role="channel-switch-wrap">' +
      '<button type="button" class="channel-switch" data-role="channel-switch" aria-haspopup="listbox" aria-expanded="false" title="List channels" aria-label="List channels">' +
      '<code class="channel-tag" data-role="channel-tag">' +
      ch +
      "</code>" +
      ICON_CARET +
      "</button>" +
      '<div class="channel-menu" data-role="channel-menu" role="listbox" aria-label="IRC channels" hidden></div>' +
      "</div></header>" +
      '<div class="history" data-role="history" role="log" aria-label="Public IRC channel messages">' +
      '<div class="stream" data-role="stream"></div></div></main>' +
      '<footer class="composer" data-role="composer">' +
      '<div class="compose-inner">' +
      '<div class="composebox" data-role="composebox">' +
      '<textarea data-role="draft" aria-label="Message to public room" inputmode="text" enterkeyhint="send" autocomplete="off" autocorrect="on" placeholder="Help me with a problem… · Help me find something… · What\'s the latest news on something… · What\'s going on in town…"></textarea>' +
      '<div class="pending-media" data-role="pending-media" hidden></div>' +
      '<div class="tools">' +
      '<input type="file" data-role="file-input" hidden accept="image/*,video/*,audio/*,.pdf,text/*,.txt,.md,.json,.csv,.xml,.yaml,.yml" />' +
      '<button type="button" class="tool" data-role="attach" title="Attach file" aria-label="Attach file">' +
      ICON_ATTACH +
      "</button>" +
      '<button type="button" class="tool" data-role="record-audio" title="Record audio" aria-label="Record audio">' +
      ICON_MIC +
      "</button>" +
      '<button type="button" class="tool" data-role="record-video" title="Record video" aria-label="Record video">' +
      ICON_VIDEO +
      "</button>" +
      '<button type="button" class="tool recording-stop" data-role="stop-record" hidden title="Stop recording" aria-label="Stop recording">' +
      ICON_STOP +
      "</button>" +
      '<span class="upload-status" data-role="upload-status" hidden></span>' +
      '<button type="button" class="send" data-role="send" title="Send">' +
      ICON_SEND +
      "<span>Send</span></button>" +
      "</div></div>" +
      "</div></footer></div></div>" +
      '<div class="overlay" data-role="overlay" hidden><div class="modal" data-role="modal"></div></div>'
    );
  }

  function wireMediaControls(root) {
    if (!root) return;
    var shields = root.querySelectorAll('[data-role="reveal-media"]');
    for (var i = 0; i < shields.length; i++) {
      (function (btn) {
        if (btn._ctWired) return;
        btn._ctWired = true;
        btn.onclick = function () {
          var wrap = btn.closest(".media");
          if (!wrap) return;
          if (wrap.getAttribute("data-review") === "reject") return;
          var hidden = wrap.querySelector(".media-hidden");
          if (hidden) {
            hidden.hidden = false;
            hidden.classList.remove("media-hidden");
          }
          btn.hidden = true;
          var vid = wrap.querySelector("video");
          if (vid) {
            try {
              vid.muted = true;
              vid.play();
            } catch (e) {}
          }
        };
      })(shields[i]);
    }
    var unmutes = root.querySelectorAll('[data-role="unmute-video"]');
    for (var j = 0; j < unmutes.length; j++) {
      (function (btn) {
        if (btn._ctWired) return;
        btn._ctWired = true;
        btn.onclick = function () {
          var wrap = btn.closest(".media");
          var vid = wrap && wrap.querySelector("video");
          if (!vid) return;
          vid.muted = false;
          try {
            vid.play();
          } catch (e2) {}
          btn.textContent = "Sound on";
          btn.disabled = true;
        };
      })(unmutes[j]);
    }
  }

  var PENDING_TIMEOUT_MS = 45000;
  var DELIVERED_CUE_MS = 2500;

  function makeClientId() {
    try {
      if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return "ct-" + crypto.randomUUID();
      }
    } catch (e) {}
    return (
      "ct-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 10)
    );
  }

  function normalizePendingText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function findPendingByClientId(stream, clientId) {
    if (!stream || !clientId) return null;
    var nodes = stream.querySelectorAll("article.msg-pending[data-client-id]");
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute("data-client-id") === clientId) return nodes[i];
    }
    var lines = stream.querySelectorAll(".msg-line[data-client-id]");
    for (var j = 0; j < lines.length; j++) {
      if (lines[j].getAttribute("data-client-id") === clientId) {
        return lines[j].closest("article.msg");
      }
    }
    return null;
  }

  function findPendingByText(stream, text, nick) {
    if (!stream) return null;
    var want = normalizePendingText(text);
    if (!want) return null;
    var nodes = stream.querySelectorAll("article.msg-pending");
    var nickWant = nick ? String(nick).toLowerCase() : "";
    for (var i = 0; i < nodes.length; i++) {
      var art = nodes[i];
      var copy = art.querySelector('[data-role="copy"]');
      var raw = art.getAttribute("data-pending-text") || "";
      if (!raw && copy) raw = copy.textContent || "";
      if (normalizePendingText(raw) !== want) continue;
      if (nickWant) {
        var artNick = String(art.dataset.nick || "").toLowerCase();
        if (
          artNick &&
          artNick !== nickWant &&
          artNick !== "you" &&
          nickWant !== "you"
        ) {
          continue;
        }
      }
      return art;
    }
    return null;
  }

  function clearPendingTimer(art) {
    if (!art) return;
    var tid = art._pendingTimer;
    if (tid) {
      try {
        clearTimeout(tid);
      } catch (e) {}
      art._pendingTimer = null;
    }
  }

  function markPendingFailed(art, reason) {
    if (!art || !art.classList.contains("msg-pending")) return;
    clearPendingTimer(art);
    art.classList.remove("msg-pending");
    art.classList.add("msg-failed");
    art.removeAttribute("data-pending");
    art.removeAttribute("aria-busy");
    var mark = art.querySelector(".pending-mark");
    if (mark) {
      mark.className = "pending-mark failed-mark";
      mark.title = reason || "Not delivered";
      mark.setAttribute("aria-label", reason || "Not delivered");
      mark.innerHTML =
        '<span class="failed-label">' + esc(reason || "Not delivered") + "</span>";
    }
  }

  function showDeliveredCue(art, latencyMs) {
    if (!art) return;
    var meta = art.querySelector(".meta");
    if (!meta) return;
    var existing = meta.querySelector(".msg-delivered-cue");
    if (existing) existing.remove();
    var sec =
      latencyMs >= 1000
        ? (latencyMs / 1000).toFixed(latencyMs >= 10000 ? 0 : 1) + "s"
        : Math.max(1, Math.round(latencyMs)) + "ms";
    var cue = document.createElement("span");
    cue.className = "msg-delivered-cue";
    cue.textContent = "Delivered in " + sec;
    meta.appendChild(cue);
    var reduce =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(
      function () {
        if (!cue.parentNode) return;
        if (reduce) {
          cue.remove();
          return;
        }
        cue.classList.add("fade-out");
        setTimeout(function () {
          if (cue.parentNode) cue.remove();
        }, 400);
      },
      DELIVERED_CUE_MS
    );
  }

  function settlePendingArticle(art, serverMsg, cfg, roomRoot, reviewMap) {
    if (!art) return false;
    clearPendingTimer(art);
    var nick = (serverMsg && serverMsg.nick) || art.dataset.nick || "anon";
    var raw = (serverMsg && serverMsg.text) || art.getAttribute("data-pending-text") || "";
    var time = (serverMsg && serverMsg.time) || "";
    var sentAt = Number(art.getAttribute("data-sent-at") || 0);
    var latencyMs = sentAt ? Math.max(0, Date.now() - sentAt) : 0;

    art.classList.remove("msg-pending", "msg-failed");
    art.removeAttribute("data-pending");
    art.removeAttribute("aria-busy");
    art.removeAttribute("data-pending-text");
    art.dataset.nick = nick;

    var bot = isBot(nick);
    /* Keep data-client-id for debugging; rebuild class for bot/normal. */
    art.className = "msg" + (bot ? " botmsg" : "");

    var av = art.querySelector(".av");
    if (av) {
      av.className = "av" + (bot ? " bot" : "");
      av.textContent = nickInitials(nick);
    }
    var nickEl = art.querySelector(".meta .nick");
    if (nickEl) nickEl.textContent = nick || "anon";
    var tag = art.querySelector(".meta .tag");
    if (bot && !tag) {
      var meta = art.querySelector(".meta");
      if (meta) {
        var t = document.createElement("span");
        t.className = "tag";
        t.textContent = "ROOM AI";
        var timeEl0 = meta.querySelector(".time");
        if (timeEl0) meta.insertBefore(t, timeEl0);
        else meta.appendChild(t);
      }
    } else if (!bot && tag) {
      tag.remove();
    }
    var timeEl = art.querySelector(".meta .time");
    if (timeEl) {
      timeEl.textContent =
        time && time !== "null"
          ? String(time)
          : new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });
    }
    var mark = art.querySelector(".pending-mark");
    if (mark) mark.remove();

    var copy = art.querySelector('[data-role="copy"]');
    var pendingLine =
      (serverMsg &&
        serverMsg.clientId &&
        art.querySelector(
          '.msg-line[data-client-id="' +
            String(serverMsg.clientId).replace(/"/g, "") +
            '"]'
        )) ||
      art.querySelector(".msg-line[data-pending='1']") ||
      art.querySelector(".msg-line:last-of-type");
    if (copy && raw) {
      var copyInner = formatCopyHtml(raw, cfg, reviewMap);
      var clamp = shouldClamp(stripMediaMarkers(raw), bot);
      if (pendingLine) {
        pendingLine.removeAttribute("data-pending");
        pendingLine.removeAttribute("aria-busy");
        pendingLine.innerHTML = copyInner;
        wireMediaControls(pendingLine);
      } else {
        copy.className = "copy";
        copy.innerHTML =
          '<div class="msg-line" data-role="msg-line">' + copyInner + "</div>";
        wireMediaControls(art);
      }
      var oldExpand = art.querySelector('[data-role="expand-msg"]');
      if (oldExpand) oldExpand.remove();
      if (clamp && roomRoot) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "expand-msg";
        btn.setAttribute("data-role", "expand-msg");
        btn.textContent = "Expand full reply";
        var fullText = "";
        var lines = art.querySelectorAll(".msg-line");
        for (var li = 0; li < lines.length; li++) {
          if (li) fullText += "\n";
          fullText += lines[li].textContent || "";
        }
        btn.onclick = function () {
          openMessageFullscreen(
            roomRoot,
            nick || "SI",
            fullText || stripMediaMarkers(raw)
          );
        };
        copy.parentNode.appendChild(btn);
      }
    }
    var settledTs =
      messageTs(serverMsg || { sentAt: sentAt || undefined, time: time }) ||
      sentAt ||
      Date.now();
    art.setAttribute("data-last-ts", String(settledTs));
    if (latencyMs) showDeliveredCue(art, latencyMs);
    return true;
  }

  function settlePending(stream, match, serverMsg, cfg, roomRoot, reviewMap) {
    if (!stream) return false;
    var art = null;
    if (match && match.clientId) {
      art = findPendingByClientId(stream, match.clientId);
    }
    if (!art && match && match.text) {
      art = findPendingByText(stream, match.text, match.nick);
    }
    if (!art) return false;
    if (match && match.clientId && serverMsg) {
      serverMsg.clientId = match.clientId;
    }
    return settlePendingArticle(art, serverMsg, cfg, roomRoot, reviewMap);
  }

  function enhanceStreamAnchors(root) {
    try {
      var SP =
        typeof ClevertreeStreamPlayback !== "undefined"
          ? ClevertreeStreamPlayback
          : null;
      if (SP && typeof SP.enhanceAnchor === "function") {
        var anchors = root.querySelectorAll("a[href]");
        for (var ai = 0; ai < anchors.length; ai++) {
          SP.enhanceAnchor(anchors[ai], null);
        }
      }
    } catch (eStream) {}
  }

  function lastMessageArticle(stream) {
    if (!stream) return null;
    var nodes = stream.querySelectorAll("article.msg");
    return nodes.length ? nodes[nodes.length - 1] : null;
  }

  function lastLineRaw(art) {
    if (!art) return "";
    var lines = art.querySelectorAll(".msg-line");
    if (!lines.length) return "";
    var last = lines[lines.length - 1];
    return normalizePendingText(
      last.getAttribute("data-raw") || last.textContent || ""
    );
  }

  /** Skip echo of a line we already showed (optimistic settle + IRC fanout). */
  function isDuplicateLiveLine(stream, msg) {
    var last = lastMessageArticle(stream);
    if (!last || !msg) return false;
    if (!nicksMatch(last.dataset.nick, msg.nick) && !nicksMatch("you", msg.nick)) {
      /* Optimistic rows use nick "you"; server may use Visitor — still dedupe on text. */
      if (!nicksMatch(last.dataset.nick, "you")) return false;
    }
    return lastLineRaw(last) === normalizePendingText(msg.text);
  }

  function appendLineToMessage(art, msg, cfg, roomRoot, reviewMap) {
    if (!art || !msg) return art;
    var copy = art.querySelector('[data-role="copy"]');
    if (!copy) return art;
    var raw = msg.text || "";
    var line = document.createElement("div");
    line.className = "msg-line";
    line.setAttribute("data-role", "msg-line");
    line.setAttribute("data-raw", raw);
    line.innerHTML = formatCopyHtml(raw, cfg, reviewMap);
    if (msg.pending) {
      line.setAttribute("data-pending", "1");
      line.setAttribute("aria-busy", "true");
      if (msg.clientId) line.setAttribute("data-client-id", msg.clientId);
      art.classList.add("msg-pending");
      art.dataset.pending = "1";
      art.setAttribute("aria-busy", "true");
      if (msg.clientId) art.setAttribute("data-client-id", msg.clientId);
      if (msg.sentAt) art.setAttribute("data-sent-at", String(msg.sentAt));
      art.setAttribute("data-pending-text", raw);
      var meta = art.querySelector(".meta");
      if (meta && !meta.querySelector(".pending-mark")) {
        var mark = document.createElement("span");
        mark.className = "pending-mark";
        mark.title = "Sending";
        mark.setAttribute("aria-label", "Sending");
        mark.innerHTML =
          '<span class="pending-dot" aria-hidden="true"></span>';
        var timeEl = meta.querySelector(".time");
        if (timeEl) meta.insertBefore(mark, timeEl);
        else meta.appendChild(mark);
      }
    }
    copy.appendChild(line);
    wireMediaControls(line);
    enhanceStreamAnchors(line);
    var ts = messageTs(msg);
    if (ts == null && (msg.pending || msg.self)) ts = Date.now();
    if (ts != null) art.setAttribute("data-last-ts", String(ts));
    if (msg.self || nicksMatch(msg.nick, "you")) {
      art.setAttribute("data-self", "1");
    }
    return art;
  }

  function appendMessage(stream, msg, cfg, roomRoot, reviewMap) {
    var bot = isBot(msg.nick);
    var art = document.createElement("article");
    var pending = !!msg.pending;
    var failed = !!msg.failed;
    var ts = messageTs(msg);
    if (ts == null && (pending || msg.self)) ts = Date.now();
    art.className =
      "msg" +
      (bot ? " botmsg" : "") +
      (pending ? " msg-pending" : "") +
      (failed ? " msg-failed" : "");
    art.dataset.nick = msg.nick || "";
    if (ts != null) art.setAttribute("data-last-ts", String(ts));
    if (msg.self || nicksMatch(msg.nick, "you")) {
      art.setAttribute("data-self", "1");
    }
    if (pending) {
      art.dataset.pending = "1";
      art.setAttribute("aria-busy", "true");
      if (msg.clientId) art.setAttribute("data-client-id", msg.clientId);
      if (msg.sentAt) art.setAttribute("data-sent-at", String(msg.sentAt));
      art.setAttribute("data-pending-text", msg.text || "");
    }
    var raw = msg.text || "";
    var copyInner = formatCopyHtml(raw, cfg, reviewMap);
    art.innerHTML =
      '<div class="av' +
      (bot ? " bot" : "") +
      '">' +
      esc(nickInitials(msg.nick)) +
      "</div><div" +
      (bot ? ' class="content"' : "") +
      ">" +
      '<div class="meta"><span class="nick">' +
      esc(msg.nick || "anon") +
      "</span>" +
      (bot ? '<span class="tag">ROOM AI</span>' : "") +
      (pending
        ? '<span class="pending-mark" title="Sending" aria-label="Sending"><span class="pending-dot" aria-hidden="true"></span></span>'
        : failed
          ? '<span class="pending-mark failed-mark" title="Not delivered" aria-label="Not delivered"><span class="failed-label">Not delivered</span></span>'
          : "") +
      '<time class="time">' +
      esc(msg.time || "") +
      "</time></div>" +
      '<div class="copy" data-role="copy">' +
      '<div class="msg-line" data-role="msg-line" data-raw="' +
      esc(raw) +
      '"' +
      (pending ? ' data-pending="1"' : "") +
      (msg.clientId
        ? ' data-client-id="' + esc(msg.clientId) + '"'
        : "") +
      ">" +
      copyInner +
      "</div></div>" +
      (shouldClamp(stripMediaMarkers(raw), bot)
        ? '<button type="button" class="expand-msg" data-role="expand-msg">Expand full reply</button>'
        : "") +
      "</div>";
    stream.appendChild(art);
    wireMediaControls(art);
    enhanceStreamAnchors(art);
    if (shouldClamp(stripMediaMarkers(raw), bot) && roomRoot) {
      var btn = art.querySelector('[data-role="expand-msg"]');
      if (btn) {
        btn.onclick = function () {
          openMessageFullscreen(roomRoot, msg.nick || "SI", stripMediaMarkers(raw));
        };
      }
    }
    return art;
  }

  function openMessageFullscreen(roomRoot, nick, text) {
    var overlay = $(roomRoot, '[data-role="overlay"]');
    var modal = $(roomRoot, '[data-role="modal"]');
    if (!overlay || !modal) return;
    var safe = linkifyChannelRefs(esc(text).replace(/\n/g, "<br>"));
    modal.innerHTML =
      '<div class="modal-full-si">' +
      '<div class="aicap">Full reply</div>' +
      '<div class="aititle"><h2>' +
      esc(nick) +
      '</h2><button type="button" class="close" data-role="full-close" aria-label="Close">×</button></div>' +
      '<div class="full-si-body">' +
      safe +
      "</div></div>";
    overlay.hidden = false;
    overlay.classList.add("open");
    var closer = modal.querySelector('[data-role="full-close"]');
    function close() {
      overlay.classList.remove("open");
      overlay.hidden = true;
      modal.innerHTML = "";
    }
    if (closer) closer.onclick = close;
    overlay.onclick = function (ev) {
      if (ev.target === overlay) close();
    };
  }

  function mount(el, opts) {
    opts = opts || {};
    var visitor = ensureVisitor(opts);
    opts.visitor = visitor;
    if (!el) throw new Error("CleverTreeRoom.mount: element required");

    var mode = opts.mode || "page";
    if (opts.showGather) {
      // Explicitly ignored — gather belongs only on Relay chrome.
      opts.showGather = false;
    }

    el.classList.add("room", "ct-room");
    if (mode === "sidepanel") el.classList.add("sidepanel");
    // Scope embed/sidepanel on the host only — never decorate document.body
    // (host pages like myproblem.app own body tokens/layout).
    if (mode === "page") document.body.classList.add("ct-room-page");
    else el.classList.add("ct-room-host", "embedded");

    if (!opts.apiBase) opts.apiBase = "https://api.clevertree.chat";
    if (!opts.channel) opts.channel = "#web";
    opts.mirrors = normalizeMirrors(opts.mirrors, opts.apiBase, opts.channel);
    if (!opts.wsUrl || !isWsUrl(opts.wsUrl)) opts.wsUrl = opts.mirrors[0];

    el.innerHTML = shellHtml(opts);

    var state = {
      tracked: !!opts.tracked,
      aiOpen: !!opts.aiOpen,
      connected: false,
      mirrorIndex: 0,
      mirrors: opts.mirrors || [],
      ws: null,
      /** Immutable wire/history log — never rewritten for visual coalesce. */
      messages: opts.seedMessages || [],
      /** Optimistic sends awaiting server echo; separate from messages. */
      pendingOutbox: [],
      historyHydrated: false,
      view: null,
      trackedCatalog: null,
      trackedCatalogPromise: null,
      opts: opts,
      destroyed: false,
      themePref: readThemePref(),
      theme: resolveRoomTheme(),
      coalescePrefs: readCoalescePrefs(),
      mediaReviews: {},
      recording: false,
      mediaRecorder: null,
      mediaStream: null,
      pendingMedia: [],
      channelCatalog: [],
      layoutMode: "chat",
      orient: "left",
      menuOpen: false,
      menuCloseTimer: null,
      chromeAnimTimer: null,
      composerExpanded: null,
      siExpanded: false,
      holdComposerOpen: false,
      holdComposerTimer: null,
      panelResize: null,
      topicText: "",
      ircChannel: opts.channel || "#web",
      pin: null,
      /* Flashback: live "N movies now showing" from index.json (not IRC pin names). */
      catalogSubtitle: "",
      /* Extension owns chat: SI stays; in-page WS skipped. */
      extHandoff: false,
    };
    applyRoomTheme(el, state.theme, state.themePref);

    var trackBtn = $(el, '[data-role="track"]');
    var aiBtn = $(el, '[data-role="ai-toggle"]');
    var aiPanel = $(el, '[data-role="si"]');
    var aiBody = $(el, '[data-role="ai-body"]');
    var stream = $(el, '[data-role="stream"]');
    var history = $(el, '[data-role="history"]');
    var draft = $(el, '[data-role="draft"]');
    var sendBtn = $(el, '[data-role="send"]');
    var composerEl = $(el, '[data-role="composer"]');
    var composeBox = $(el, '[data-role="composebox"]');
    var investigateBtn = $(el, '[data-role="investigate"]');
    var channelTag = $(el, '[data-role="channel-tag"]');
    var channelSwitchBtn = $(el, '[data-role="channel-switch"]');
    var channelMenu = $(el, '[data-role="channel-menu"]');
    var layoutSwitchBtn = $(el, '[data-role="layout-switch"]');
    var layoutMenu = $(el, '[data-role="layout-menu"]');
    var layoutLabel = $(el, '[data-role="layout-label"]');
    var bodyEl = $(el, '[data-role="body"]');
    var menuFab = $(el, '[data-role="menu-fab"]');
    var menuDrawer = $(el, '[data-role="menu-drawer"]');
    var menuBackdrop = $(el, '[data-role="menu-backdrop"]');
    var menuCloseBtn = $(el, '[data-role="menu-close"]');
    var orientLeftBtn = $(el, '[data-role="orient-left"]');
    var orientRightBtn = $(el, '[data-role="orient-right"]');
    var chatLogTitle = $(el, '[data-role="chat-log-title"]');
    var chatLogSub = $(el, '[data-role="chat-log-sub"]');
    var chatLogPin = $(el, '[data-role="chat-log-pin"]');
    var extOpenBtn = $(el, '[data-role="ext-open"]');
    /* Menu button lives in the SI rail header (not floating). */
    var FLASHBACK_PLACEHOLDER =
      "Where can I find a movie… · What do you recommend to watch… · I'd like to request a fan edit of a movie…";
    var isFlashbackChannel =
      String((opts && opts.channel) || "")
        .trim()
        .toLowerCase() === "#flashback";
    var PLACEHOLDER_EXPANDED =
      (opts && opts.placeholder) ||
      (isFlashbackChannel
        ? FLASHBACK_PLACEHOLDER
        : "Help me with a problem… · Help me find something… · What's the latest news on something… · What's going on in town…");
    var PLACEHOLDER_COLLAPSED =
      (opts && opts.placeholderCollapsed) ||
      (isFlashbackChannel
        ? "Ask for a film…"
        : opts && opts.placeholder
          ? String(opts.placeholder).replace(/…$/, "…")
          : "Ask something…");
    if (draft) {
      var startExpanded =
        !composerEl || composerEl.classList.contains("composer-expanded");
      draft.placeholder = startExpanded
        ? PLACEHOLDER_EXPANDED
        : PLACEHOLDER_COLLAPSED;
    }

    var CHROME_MS = 340;
    var CHROME_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
    var PANEL_W_KEY = "clevertree.room.panelWidths";
    var DESKTOP_MQ = "(min-width: 900px)";
    /* Narrow portrait WebViews can flip to "landscape" when the keyboard opens. */
    var ROW_MQ =
      "(orientation: landscape) and (min-width: 600px), (min-width: 900px)";

    function prefersReducedMotion() {
      return (
        typeof matchMedia === "function" &&
        matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    }

    /** True desktop / wide tablet — resizable columns, snappy chrome. */
    function isDesktopChrome() {
      return typeof matchMedia === "function" && matchMedia(DESKTOP_MQ).matches;
    }

    /** Phone landscape or desktop row layout (SI | chat | draft). */
    function isLandscapeChrome() {
      return typeof matchMedia === "function" && matchMedia(ROW_MQ).matches;
    }

    function clearChromeInlineSize(node) {
      if (!node) return;
      node.style.height = "";
      node.style.width = "";
      node.style.transition = "";
    }

    function holdComposer(ms) {
      state.holdComposerOpen = true;
      if (state.holdComposerTimer) clearTimeout(state.holdComposerTimer);
      var wait = typeof ms === "number" && ms >= 0 ? ms : CHROME_MS + 500;
      state.holdComposerTimer = setTimeout(function () {
        state.holdComposerOpen = false;
        state.holdComposerTimer = null;
      }, wait);
    }

    function applySiClass(on) {
      if (!aiPanel) return;
      state.siExpanded = !!on;
      aiPanel.classList.toggle("si-expanded", !!on);
      aiPanel.classList.toggle("si-collapsed", !on);
      aiPanel.setAttribute("data-expanded", on ? "true" : "false");
    }

    function applyComposerClass(on) {
      if (!composerEl) return;
      var wasExpanded = composerEl.classList.contains("composer-expanded");
      state.composerExpanded = !!on;
      composerEl.classList.toggle("composer-expanded", !!on);
      composerEl.classList.toggle("composer-collapsed", !on);
      composerEl.setAttribute("data-expanded", on ? "true" : "false");
      if (draft) {
        draft.placeholder = on ? PLACEHOLDER_EXPANDED : PLACEHOLDER_COLLAPSED;
        try {
          /* Expanding: focus only on collapsed→expanded so soft keyboards open.
           * Never re-focus when already expanded (blocks SI open via hold). */
          if (on && !wasExpanded) {
            if (document.activeElement !== draft) draft.focus();
          } else if (
            !on &&
            document.activeElement === draft &&
            !state.holdComposerOpen
          ) {
            draft.blur();
          }
        } catch (e) {}
      }
    }

    /**
     * Expanding/collapsing chrome reflows .history (flex sibling). Browsers
     * clamp scrollTop and fire scroll — that must not call collapseChrome()
     * or focus→expand immediately undoes itself. Same for keepComposerInView.
     */
    function suppressHistoryCollapse(ms) {
      state.suppressHistoryScrollCollapse = true;
      if (state.historyScrollUnlockTimer) clearTimeout(state.historyScrollUnlockTimer);
      var wait = typeof ms === "number" && ms >= 0 ? ms : 160;
      state.historyScrollUnlockTimer = setTimeout(function () {
        state.suppressHistoryScrollCollapse = false;
        state.historyScrollUnlockTimer = null;
      }, wait);
    }

    /**
     * Mobile (portrait + phone landscape): smooth push/expand tween.
     * Desktop (≥900px): instant class swap — columns stay user-sized.
     */
    function setChromeState(nextSi, nextComposer) {
      nextSi = !!nextSi;
      nextComposer = !!nextComposer;
      /* Desktop / phone-landscape row: SI body stays open (resizable column).
       * Portrait stack may still collapse SI to the header rail. */
      if (isLandscapeChrome()) nextSi = true;
      var siSame = !aiPanel || state.siExpanded === nextSi;
      var coSame =
        !composerEl ||
        (state.composerExpanded == null
          ? composerEl.classList.contains("composer-expanded") === nextComposer
          : state.composerExpanded === nextComposer);
      if (siSame && coSame) {
        /* Already in the requested state — do not re-apply (re-focusing the
         * draft here would set holdComposerOpen and block focusSi). */
        return;
      }

      var desktop = isDesktopChrome();
      var reduce = prefersReducedMotion();
      /* Desktop / reduced-motion: snap — no measure/tween (keeps focus + IME). */
      if (desktop || reduce) {
        suppressHistoryCollapse(180);
        if (state.chromeAnimTimer) {
          clearTimeout(state.chromeAnimTimer);
          state.chromeAnimTimer = null;
        }
        clearChromeInlineSize(aiPanel);
        clearChromeInlineSize(composerEl);
        applySiClass(nextSi);
        applyComposerClass(nextComposer);
        if (typeof scheduleKeyboardViewport === "function") {
          scheduleKeyboardViewport();
        }
        return;
      }

      /* Cover measure/tween reflow + post-anim keyboard viewport sync. */
      suppressHistoryCollapse(CHROME_MS + 280);

      var landscape = isLandscapeChrome();
      var siStart = aiPanel ? aiPanel.getBoundingClientRect() : null;
      var coStart = composerEl ? composerEl.getBoundingClientRect() : null;

      if (aiPanel) {
        clearChromeInlineSize(aiPanel);
        aiPanel.style.transition = "none";
        if (siStart) {
          aiPanel.style.height = siStart.height + "px";
          if (landscape) aiPanel.style.width = siStart.width + "px";
        }
      }
      if (composerEl) {
        clearChromeInlineSize(composerEl);
        composerEl.style.transition = "none";
        if (coStart) {
          /* Composer sits in the chat-stack column — tween height only. */
          composerEl.style.height = coStart.height + "px";
        }
      }

      applySiClass(nextSi);
      applyComposerClass(nextComposer);

      // Natural end sizes with new classes (inline sizes cleared briefly).
      if (aiPanel) {
        aiPanel.style.height = "";
        aiPanel.style.width = "";
      }
      if (composerEl) {
        composerEl.style.height = "";
        composerEl.style.width = "";
      }
      var siEnd = aiPanel ? aiPanel.getBoundingClientRect() : null;
      var coEnd = composerEl ? composerEl.getBoundingClientRect() : null;

      if (aiPanel && siStart) {
        aiPanel.style.height = siStart.height + "px";
        if (landscape) aiPanel.style.width = siStart.width + "px";
      }
      if (composerEl && coStart) {
        composerEl.style.height = coStart.height + "px";
      }
      void el.offsetWidth;

      var tween =
        "height " +
        CHROME_MS +
        "ms " +
        CHROME_EASE +
        (landscape ? ", width " + CHROME_MS + "ms " + CHROME_EASE : "");
      if (aiPanel && siEnd) {
        aiPanel.style.transition = tween;
        aiPanel.style.height = Math.max(0, siEnd.height) + "px";
        if (landscape) aiPanel.style.width = Math.max(0, siEnd.width) + "px";
      }
      if (composerEl && coEnd) {
        composerEl.style.transition =
          "height " + CHROME_MS + "ms " + CHROME_EASE;
        composerEl.style.height = Math.max(0, coEnd.height) + "px";
      }

      if (state.chromeAnimTimer) clearTimeout(state.chromeAnimTimer);
      state.chromeAnimTimer = setTimeout(function () {
        state.chromeAnimTimer = null;
        clearChromeInlineSize(aiPanel);
        clearChromeInlineSize(composerEl);
        /* Clearing inline sizes + keyboard sync can scroll history again. */
        suppressHistoryCollapse(240);
        if (typeof scheduleKeyboardViewport === "function") {
          scheduleKeyboardViewport();
        } else if (typeof syncKeyboardViewport === "function") {
          syncKeyboardViewport();
        }
      }, CHROME_MS + 80);
    }

    function setSiExpanded(on) {
      setChromeState(on, state.composerExpanded != null
        ? state.composerExpanded
        : !!(composerEl && composerEl.classList.contains("composer-expanded")));
    }

    function setComposerExpanded(on) {
      setChromeState(
        state.siExpanded != null
          ? state.siExpanded
          : !!(aiPanel && aiPanel.classList.contains("si-expanded")),
        on
      );
    }

    /** Row chrome (landscape phone + desktop): composer stays full-size. */
    function keepComposerOpenInRow() {
      return isLandscapeChrome() || isDesktopChrome();
    }

    function focusComposer() {
      /* Focus in the user gesture first (IME), then expand chrome. */
      holdComposer(CHROME_MS + 600);
      suppressHistoryCollapse(CHROME_MS + 280);
      try {
        if (draft && document.activeElement !== draft) draft.focus();
      } catch (e) {}
      if (keepComposerOpenInRow()) {
        var siOn =
          state.siExpanded != null
            ? !!state.siExpanded
            : !!(aiPanel && aiPanel.classList.contains("si-expanded"));
        setChromeState(siOn, true);
      } else {
        setChromeState(false, true);
      }
    }

    function focusSi() {
      if (state.holdComposerOpen) return;
      /* Landscape/desktop: open SI without shrinking the composer column. */
      if (keepComposerOpenInRow()) {
        setChromeState(true, true);
      } else {
        setChromeState(true, false);
      }
    }

    function releaseComposerHold() {
      state.holdComposerOpen = false;
      if (state.holdComposerTimer) {
        clearTimeout(state.holdComposerTimer);
        state.holdComposerTimer = null;
      }
    }

    function collapseChrome(opts) {
      var force = !!(opts && opts.force);
      /* Keep draft open while focused (hold covers pre-focus IME race). */
      if (!force && draft && document.activeElement === draft) {
        return;
      }
      if (force && draft && document.activeElement === draft) {
        try {
          draft.blur();
        } catch (e) {}
      }
      releaseComposerHold();
      /* Landscape/desktop: blur is fine; never minimize the composer column. */
      if (keepComposerOpenInRow()) {
        setChromeState(false, true);
        return;
      }
      setChromeState(false, false);
    }

    /**
     * Swipe open chrome on the panel/composer shells only (not the scrolling
     * transcript). Portrait + landscape: drag down on SI → expand SI; drag up
     * on composer → expand chat.
     */
    function wireChromeSwipe(target, direction) {
      if (!target) return;
      var SWIPE_MIN = 48;
      var AXIS_RATIO = 1.2;
      var startX = 0;
      var startY = 0;
      var pointerId = null;
      var tracking = false;
      var openDown = direction === "down";

      function resetSwipe() {
        tracking = false;
        pointerId = null;
      }

      target.addEventListener("pointerdown", function (ev) {
        if (ev.isPrimary === false) return;
        if (ev.pointerType === "mouse" && ev.button !== 0) return;
        if (state.menuOpen || el.classList.contains("is-resizing")) return;
        if (
          ev.target &&
          ev.target.closest &&
          ev.target.closest(
            'a,button,input,textarea,select,[data-role="menu-fab"],[data-role="menu-drawer"],.menu-drawer'
          )
        ) {
          return;
        }
        tracking = true;
        pointerId = ev.pointerId;
        startX = ev.clientX;
        startY = ev.clientY;
        try {
          target.setPointerCapture(ev.pointerId);
        } catch (e) {}
      });

      function onPointerEnd(ev) {
        if (!tracking || (pointerId != null && ev.pointerId !== pointerId)) {
          return;
        }
        var dx = ev.clientX - startX;
        var dy = ev.clientY - startY;
        try {
          if (pointerId != null && target.hasPointerCapture(pointerId)) {
            target.releasePointerCapture(pointerId);
          }
        } catch (e) {}
        resetSwipe();
        if (Math.abs(dy) < SWIPE_MIN) return;
        if (Math.abs(dy) < Math.abs(dx) * AXIS_RATIO) return;
        if (openDown) {
          if (dy <= 0) return;
          focusSi();
        } else {
          if (dy >= 0) return;
          focusComposer();
        }
      }

      target.addEventListener("pointerup", onPointerEnd);
      target.addEventListener("pointercancel", function (ev) {
        if (pointerId != null && ev.pointerId !== pointerId) return;
        try {
          if (pointerId != null && target.hasPointerCapture(pointerId)) {
            target.releasePointerCapture(pointerId);
          }
        } catch (e) {}
        resetSwipe();
      });
    }

    function readPanelWidths() {
      try {
        var raw = localStorage.getItem(PANEL_W_KEY);
        if (!raw) return { si: 60 };
        var j = JSON.parse(raw);
        var si = Number(j && j.si);
        /* Migrate old three-column 33/33 prefs → 60/40 two-column. */
        if (j && j.co != null && (si === 33 || !(si >= 40 && si <= 72))) {
          si = 60;
        }
        if (!(si >= 40 && si <= 72)) si = 60;
        return { si: si };
      } catch (e) {
        return { si: 60 };
      }
    }

    function writePanelWidths(si) {
      try {
        localStorage.setItem(PANEL_W_KEY, JSON.stringify({ si: si }));
      } catch (e) {}
    }

    function applyPanelWidths(siPct) {
      el.style.setProperty("--ct-si-w", siPct + "%");
    }

    function syncChromeMode() {
      /* Row chrome = phone landscape (≥600) + desktop (≥900): SI ~60% |
       * chat-stack ~40% (log + draft stacked). Portrait stays stacked. */
      var row = isLandscapeChrome();
      el.setAttribute("data-chrome", row ? "row" : "stack");
      var gSi = $(el, '[data-role="gutter-si"]');
      if (gSi) {
        gSi.hidden = !row;
        gSi.setAttribute("aria-hidden", row ? "false" : "true");
      }
      if (row) {
        var w = readPanelWidths();
        applyPanelWidths(w.si);
        /* Entering or staying in row: keep SI fully visible (not header-only). */
        if (!state.siExpanded) {
          setChromeState(
            true,
            state.composerExpanded != null
              ? state.composerExpanded
              : !!(composerEl && composerEl.classList.contains("composer-expanded"))
          );
        }
      } else {
        el.style.removeProperty("--ct-si-w");
      }
    }

    function wirePanelResize() {
      var gSi = $(el, '[data-role="gutter-si"]');
      if (!gSi || !bodyEl) return;

      function startDrag(ev) {
        if (!isLandscapeChrome()) return;
        ev.preventDefault();
        try {
          if (ev.pointerId != null && gSi.setPointerCapture) {
            gSi.setPointerCapture(ev.pointerId);
          }
        } catch (capErr) {}
        var startX =
          ev.clientX != null
            ? ev.clientX
            : ev.touches && ev.touches[0]
              ? ev.touches[0].clientX
              : 0;
        var bodyR = bodyEl.getBoundingClientRect();
        var bodyW = Math.max(1, bodyR.width);
        var startSi = readPanelWidths().si;
        var orientRight = state.orient === "right";
        el.classList.add("is-resizing");

        function onMove(e) {
          var x =
            e.clientX != null
              ? e.clientX
              : e.touches && e.touches[0]
                ? e.touches[0].clientX
                : startX;
          var dxPct = ((x - startX) / bodyW) * 100;
          if (orientRight) dxPct = -dxPct;
          var si = Math.round(startSi + dxPct);
          si = Math.max(40, Math.min(72, si));
          applyPanelWidths(si);
          state.panelResize = { si: si };
        }

        function onUp() {
          el.classList.remove("is-resizing");
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
          document.removeEventListener("pointercancel", onUp);
          document.removeEventListener("touchmove", onMove);
          document.removeEventListener("touchend", onUp);
          if (state.panelResize) {
            writePanelWidths(state.panelResize.si);
            state.panelResize = null;
          }
        }

        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
        document.addEventListener("pointercancel", onUp);
        document.addEventListener("touchmove", onMove, { passive: false });
        document.addEventListener("touchend", onUp);
      }

      gSi.addEventListener("pointerdown", function (ev) {
        startDrag(ev);
      });
    }

    syncChromeMode();
    wirePanelResize();
    if (typeof matchMedia === "function") {
      var rowMq = matchMedia(ROW_MQ);
      var onRowMq = function () {
        syncChromeMode();
      };
      if (rowMq.addEventListener) rowMq.addEventListener("change", onRowMq);
      else if (rowMq.addListener) rowMq.addListener(onRowMq);
      state._rowMq = rowMq;
      state._onRowMq = onRowMq;
    }

    function scrollHistoryToBottom() {
      if (!history) return;
      suppressHistoryCollapse(120);
      history.scrollTop = history.scrollHeight;
    }

    /* Start with draft open. Portrait: SI header-only until tapped.
     * Row chrome (desktop / landscape) forces SI open via setChromeState. */
    try {
      localStorage.removeItem("clevertree.room.composerExpanded");
    } catch (e) {}
    setComposerExpanded(true);
    setSiExpanded(isLandscapeChrome());

    var LAYOUT_KEY = "clevertree.room.layoutMode";
    var ORIENT_KEY = "clevertree.room.orient";
    var LAYOUT_LABELS = {
      chat: "Chat log",
      si: "SI panel",
      split: "Split",
    };

    function normalizeLayoutMode(mode) {
      var m = String(mode || "").toLowerCase();
      if (m === "si" || m === "split" || m === "chat") return m;
      return "chat";
    }

    function normalizeOrient(o) {
      return String(o || "").toLowerCase() === "right" ? "right" : "left";
    }

    function setMenuOpen(open) {
      open = !!open;
      if (state.menuCloseTimer) {
        clearTimeout(state.menuCloseTimer);
        state.menuCloseTimer = null;
      }
      state.menuOpen = open;
      if (menuFab) {
        menuFab.setAttribute("aria-expanded", open ? "true" : "false");
        menuFab.setAttribute("aria-label", open ? "Close menu" : "Open menu");
        menuFab.classList.toggle("open", open);
        menuFab.innerHTML = open ? ICON_CLOSE : ICON_MENU;
      }
      if (open) {
        setChannelMenuOpen(false);
        setLayoutMenuOpen(false);
        if (menuDrawer) {
          menuDrawer.hidden = false;
          menuDrawer.setAttribute("aria-hidden", "false");
        }
        if (menuBackdrop) {
          menuBackdrop.hidden = false;
          menuBackdrop.setAttribute("aria-hidden", "false");
        }
        // Measure drawer width so the body push matches the panel exactly.
        if (menuDrawer) {
          var mw = menuDrawer.getBoundingClientRect().width;
          if (mw > 0) el.style.setProperty("--ct-menu-w", Math.round(mw) + "px");
        }
        // Two frames: paint off-screen, then add .menu-open so transform transitions.
        el.classList.remove("menu-open");
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            if (!state.menuOpen) return;
            el.classList.add("menu-open");
          });
        });
        return;
      }
      el.classList.remove("menu-open");
      var finishClose = function () {
        if (state.menuOpen) return;
        if (menuDrawer) {
          menuDrawer.hidden = true;
          menuDrawer.setAttribute("aria-hidden", "true");
        }
        if (menuBackdrop) {
          menuBackdrop.hidden = true;
          menuBackdrop.setAttribute("aria-hidden", "true");
        }
      };
      var reduce =
        typeof matchMedia === "function" &&
        matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce || !menuDrawer) {
        finishClose();
        return;
      }
      state.menuCloseTimer = setTimeout(finishClose, 380);
      var onEnd = function (ev) {
        if (ev.target !== menuDrawer || ev.propertyName !== "transform") return;
        menuDrawer.removeEventListener("transitionend", onEnd);
        if (state.menuCloseTimer) {
          clearTimeout(state.menuCloseTimer);
          state.menuCloseTimer = null;
        }
        finishClose();
      };
      menuDrawer.addEventListener("transitionend", onEnd);
    }

    function setLayoutMenuOpen(open) {
      if (!layoutMenu || !layoutSwitchBtn) return;
      layoutMenu.hidden = !open;
      layoutSwitchBtn.setAttribute("aria-expanded", open ? "true" : "false");
      layoutSwitchBtn.classList.toggle("open", !!open);
    }

    function setLayoutMode(mode) {
      var next = normalizeLayoutMode(mode);
      state.layoutMode = next;
      el.setAttribute("data-layout", next);
      if (bodyEl) bodyEl.setAttribute("data-layout", next);
      if (layoutLabel) layoutLabel.textContent = LAYOUT_LABELS[next] || "Chat log";
      if (layoutMenu) {
        var opts = layoutMenu.querySelectorAll("[data-layout]");
        for (var i = 0; i < opts.length; i++) {
          var active = opts[i].getAttribute("data-layout") === next;
          opts[i].classList.toggle("active", active);
          opts[i].setAttribute("aria-selected", active ? "true" : "false");
        }
      }
      if (next === "chat") {
        setSiExpanded(false);
      } else {
        setSiExpanded(true);
        if (next === "si") setComposerExpanded(false);
      }
      try {
        localStorage.setItem(LAYOUT_KEY, next);
      } catch (e) {}
      setLayoutMenuOpen(false);
    }

    function setOrient(orient) {
      var next = normalizeOrient(orient);
      state.orient = next;
      el.setAttribute("data-orient", next);
      if (bodyEl) bodyEl.setAttribute("data-orient", next);
      if (orientLeftBtn) {
        orientLeftBtn.classList.toggle("active", next === "left");
        orientLeftBtn.setAttribute("aria-pressed", next === "left" ? "true" : "false");
      }
      if (orientRightBtn) {
        orientRightBtn.classList.toggle("active", next === "right");
        orientRightBtn.setAttribute(
          "aria-pressed",
          next === "right" ? "true" : "false"
        );
      }
      try {
        localStorage.setItem(ORIENT_KEY, next);
      } catch (e) {}
    }

    function readLayoutMode() {
      try {
        var stored = localStorage.getItem(LAYOUT_KEY);
        if (stored) return normalizeLayoutMode(stored);
      } catch (e) {}
      /* Flashback lobby / ai=1: show SI (movie carousel) beside chat by default. */
      if (
        opts.aiOpen ||
        normalizeChannelName(opts.channel || "") === "#flashback"
      ) {
        return "split";
      }
      return "chat";
    }

    function readOrient() {
      try {
        return normalizeOrient(localStorage.getItem(ORIENT_KEY));
      } catch (e) {
        return "left";
      }
    }

    setLayoutMode(readLayoutMode());
    setOrient(readOrient());

    if (menuFab) {
      menuFab.onclick = function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        setMenuOpen(!state.menuOpen);
      };
    }
    if (menuCloseBtn) {
      menuCloseBtn.onclick = function () {
        setMenuOpen(false);
      };
    }
    if (menuBackdrop) {
      menuBackdrop.onclick = function () {
        setMenuOpen(false);
      };
    }
    if (orientLeftBtn) {
      orientLeftBtn.onclick = function () {
        setOrient("left");
      };
    }
    if (orientRightBtn) {
      orientRightBtn.onclick = function () {
        setOrient("right");
      };
    }

    if (layoutSwitchBtn) {
      layoutSwitchBtn.onclick = function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        setChannelMenuOpen(false);
        setLayoutMenuOpen(layoutMenu && layoutMenu.hidden);
      };
    }
    if (layoutMenu) {
      var layoutOpts = layoutMenu.querySelectorAll("[data-layout]");
      for (var li = 0; li < layoutOpts.length; li++) {
        layoutOpts[li].onclick = function (ev) {
          var btn = ev.currentTarget;
          setLayoutMode(btn.getAttribute("data-layout"));
        };
      }
    }

    if (channelSwitchBtn) {
      channelSwitchBtn.onclick = function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        setLayoutMenuOpen(false);
        var open = channelMenu && channelMenu.hidden;
        if (open) {
          loadChannelCatalog().then(function () {
            setChannelMenuOpen(true);
          });
        } else {
          setChannelMenuOpen(false);
        }
      };
    }
    if (el) {
      el.addEventListener("click", function (ev) {
        var link =
          ev.target && ev.target.closest
            ? ev.target.closest('[data-role="channel-link"]')
            : null;
        if (link && el.contains(link)) {
          ev.preventDefault();
          ev.stopPropagation();
          /* Silent — drafts are already persisted per channel. */
          switchChannel(link.getAttribute("data-channel") || "", { force: true });
          return;
        }
        var chWrap = $(el, '[data-role="channel-switch-wrap"]');
        var layWrap = $(el, '[data-role="layout-switch-wrap"]');
        if (channelMenu && !channelMenu.hidden) {
          if (!(chWrap && chWrap.contains(ev.target))) setChannelMenuOpen(false);
        }
        if (layoutMenu && !layoutMenu.hidden) {
          if (!(layWrap && layWrap.contains(ev.target))) setLayoutMenuOpen(false);
        }
      });
    }
    loadChannelCatalog().catch(function () {});

    // Starter chips removed — per-repo examples live only in the placeholder text.

    if (history) {
      var historyScrollHideTimer = null;
      history.addEventListener(
        "scroll",
        function () {
          history.classList.add("is-scrolling");
          if (historyScrollHideTimer) clearTimeout(historyScrollHideTimer);
          historyScrollHideTimer = setTimeout(function () {
            history.classList.remove("is-scrolling");
            historyScrollHideTimer = null;
          }, 900);
          /* Layout reflow during chrome anim / viewport sync is not a user scroll. */
          if (state.suppressHistoryScrollCollapse || state.chromeAnimTimer) return;
          collapseChrome();
        },
        { passive: true }
      );
      history.addEventListener("click", function (ev) {
        if (
          ev.target &&
          ev.target.closest &&
          ev.target.closest('[data-role="channel-link"]')
        ) {
          return;
        }
        collapseChrome({ force: true });
      });
    }
    if (aiPanel) {
      /* Drag down on the SI shell opens it (history scroll stays untouched). */
      wireChromeSwipe(aiPanel, "down");
      aiPanel.addEventListener("click", function (ev) {
        if (
          ev.target &&
          ev.target.closest &&
          (ev.target.closest('[data-role="menu-fab"]') ||
            ev.target.closest(".menu-drawer"))
        ) {
          return;
        }
        focusSi();
      });
    }
    if (composerEl) {
      /* Drag up on the composer shell opens chat. */
      wireChromeSwipe(composerEl, "up");
    }
    if (composeBox) {
      composeBox.addEventListener("pointerdown", function (ev) {
        /* Same-gesture focus so soft keyboards open on mobile WebViews. */
        if (ev.target !== draft) focusComposer();
      });
      composeBox.addEventListener("click", function () {
        focusComposer();
      });
    }
    if (draft) {
      draft.addEventListener("focus", function () {
        focusComposer();
      });
      /* Pointer down expands + focuses before focus races on some WebViews. */
      draft.addEventListener(
        "pointerdown",
        function () {
          focusComposer();
        },
        { passive: true }
      );
      draft.addEventListener("blur", function () {
        /* Release hold shortly after blur so chrome can collapse again. */
        if (state.holdComposerTimer) clearTimeout(state.holdComposerTimer);
        state.holdComposerTimer = setTimeout(function () {
          if (document.activeElement === draft) return;
          state.holdComposerOpen = false;
          state.holdComposerTimer = null;
        }, 180);
      });
    }
    var connEl = $(el, '[data-role="conn"]');
    var mirrorEl = $(el, '[data-role="mirror"]');
    var overlay = $(el, '[data-role="overlay"]');
    var modal = $(el, '[data-role="modal"]');
    var fileInput = $(el, '[data-role="file-input"]');
    var attachBtn = $(el, '[data-role="attach"]');
    var recordAudioBtn = $(el, '[data-role="record-audio"]');
    var recordVideoBtn = $(el, '[data-role="record-video"]');
    var stopRecordBtn = $(el, '[data-role="stop-record"]');
    var uploadStatus = $(el, '[data-role="upload-status"]');
    var pendingMediaEl = $(el, '[data-role="pending-media"]');

    function apiBase() {
      var base =
        opts.apiBase ||
        "https://api.clevertree.chat";
      return String(base).replace(/\/$/, "");
    }

    function channelSlug() {
      return String(opts.channel || "#web")
        .replace(/^#/, "")
        .trim() || "web";
    }

    function normalizeChannelName(ch) {
      var s = String(ch || "").trim();
      if (!s) return "#web";
      return s.charAt(0) === "#" ? s : "#" + s;
    }

    function setChannelMenuOpen(open) {
      if (!channelMenu || !channelSwitchBtn) return;
      channelMenu.hidden = !open;
      channelSwitchBtn.setAttribute("aria-expanded", open ? "true" : "false");
      channelSwitchBtn.classList.toggle("open", !!open);
    }

    function isWebsiteDefaultChannel(ch) {
      var n = normalizeChannelName(ch);
      for (var i = 0; i < WEBSITE_DEFAULT_CHANNELS.length; i++) {
        if (WEBSITE_DEFAULT_CHANNELS[i] === n) return true;
      }
      return false;
    }

    function partitionChannelRows(rows) {
      var top = [];
      var bottom = [];
      var seen = {};
      (rows || []).forEach(function (row) {
        var ch = normalizeChannelName(row.channel || row.name || row);
        if (seen[ch]) return;
        seen[ch] = 1;
        var item =
          typeof row === "string"
            ? { channel: ch, title: ch }
            : {
                channel: ch,
                title: row.title || row.label || ch,
                websiteDefault: !!row.websiteDefault || isWebsiteDefaultChannel(ch),
              };
        if (item.websiteDefault) top.push(item);
        else bottom.push(item);
      });
      top.sort(function (a, b) {
        return (
          WEBSITE_DEFAULT_CHANNELS.indexOf(a.channel) -
          WEBSITE_DEFAULT_CHANNELS.indexOf(b.channel)
        );
      });
      return { top: top, bottom: bottom };
    }

    function channelOptionHtml(row, current) {
      var ch = normalizeChannelName(row.channel || row.name || row);
      var title = row.title || row.label || "";
      var active = ch === current ? " active" : "";
      return (
        '<button type="button" class="channel-option' +
        active +
        (row.websiteDefault ? " channel-option-site" : "") +
        '" role="option" data-channel="' +
        esc(ch) +
        '" aria-selected="' +
        (ch === current ? "true" : "false") +
        '"><code>' +
        esc(ch) +
        "</code>" +
        (title
          ? '<span class="channel-option-title">' + esc(title) + "</span>"
          : "") +
        "</button>"
      );
    }

    var channelMenuFilter = "";

    function renderChannelMenu(list) {
      if (!channelMenu) return;
      var rows = Array.isArray(list) ? list : [];
      state._channelCatalog = rows;
      if (!rows.length) {
        channelMenu.innerHTML =
          '<div class="channel-menu-empty">No channels listed</div>';
        return;
      }
      var q = String(channelMenuFilter || "")
        .trim()
        .toLowerCase();
      var filtered = rows;
      if (q) {
        filtered = rows.filter(function (row) {
          var ch = normalizeChannelName(row.channel || row.name || row);
          var title = String(row.title || row.label || "").toLowerCase();
          return ch.toLowerCase().indexOf(q) >= 0 || title.indexOf(q) >= 0;
        });
      }
      var parts = partitionChannelRows(filtered);
      var current = normalizeChannelName(opts.channel);
      var html =
        '<div class="channel-menu-search-wrap">' +
        '<input type="search" class="channel-menu-search" data-role="channel-search" placeholder="Search channels…" aria-label="Search channels" value="' +
        esc(channelMenuFilter) +
        '" />' +
        "</div>";
      if (!parts.top.length && !parts.bottom.length) {
        html += '<div class="channel-menu-empty">No matching channels</div>';
      } else {
        if (parts.top.length) {
          html +=
            '<div class="channel-menu-section-label">Website channels</div>';
          html += parts.top
            .map(function (row) {
              return channelOptionHtml(row, current);
            })
            .join("");
        }
        if (parts.top.length && parts.bottom.length) {
          html += '<div class="channel-menu-sep" role="separator"></div>';
        }
        if (parts.bottom.length) {
          html +=
            '<div class="channel-menu-section-label">Other channels</div>';
          html += parts.bottom
            .map(function (row) {
              return channelOptionHtml(row, current);
            })
            .join("");
        }
      }
      channelMenu.innerHTML = html;
      var search = channelMenu.querySelector('[data-role="channel-search"]');
      if (search) {
        search.oninput = function () {
          channelMenuFilter = search.value || "";
          renderChannelMenu(state._channelCatalog || rows);
          var again = channelMenu.querySelector('[data-role="channel-search"]');
          if (again) {
            again.focus();
            try {
              var len = again.value.length;
              again.setSelectionRange(len, len);
            } catch (e) {}
          }
        };
        search.onclick = function (ev) {
          ev.stopPropagation();
        };
      }
      var btns = channelMenu.querySelectorAll("[data-channel]");
      for (var i = 0; i < btns.length; i++) {
        btns[i].onclick = function (ev) {
          var btn = ev.currentTarget;
          var next = btn.getAttribute("data-channel");
          setChannelMenuOpen(false);
          switchChannel(next);
        };
      }
    }

    /** Catalog website defaults — appear above separator in channel picker. */
    var WEBSITE_DEFAULT_CHANNELS = [
      "#web",
      "#flashback",
      "#pt",
      "#mp-general",
      "#songwalker",
      "#snesology",
    ];

    function fallbackChannelCatalog() {
      return [
        {
          channel: "#web",
          topic: "web",
          title: "Universal Web",
          websiteDefault: true,
        },
        {
          channel: "#flashback",
          topic: "flashback",
          title: "Flashback Repository",
          websiteDefault: true,
        },
        {
          channel: "#pt",
          topic: "general",
          title: "Paradigm Threat",
          websiteDefault: true,
        },
        {
          channel: "#mp-general",
          topic: "mp-general",
          title: "MyProblem general",
          websiteDefault: true,
        },
        {
          channel: "#songwalker",
          topic: "songwalker",
          title: "SongWalker",
          websiteDefault: true,
        },
        {
          channel: "#snesology",
          topic: "snesology",
          title: "SNESology",
          websiteDefault: true,
        },
        {
          channel: "#ga-savannah-cat-rescue",
          topic: "ga-savannah-cat-rescue",
          title: "Savannah Cat Rescue",
        },
        { channel: "#logs", topic: "logs", title: "Fleet logs" },
        { channel: "#relay", topic: "relay", title: "Relay ops" },
      ];
    }

    async function loadChannelCatalog() {
      var merged = fallbackChannelCatalog().slice();
      var seen = {};
      merged.forEach(function (r) {
        seen[normalizeChannelName(r.channel)] = 1;
      });
      function absorb(list) {
        (list || []).forEach(function (row) {
          var ch = normalizeChannelName(
            (row && (row.channel || row.name)) || row
          );
          if (seen[ch]) {
            if (row && row.title) {
              for (var i = 0; i < merged.length; i++) {
                if (normalizeChannelName(merged[i].channel) === ch) {
                  merged[i].title = row.title;
                  break;
                }
              }
            }
            return;
          }
          seen[ch] = 1;
          merged.push(
            typeof row === "string"
              ? { channel: ch, title: ch }
              : {
                  channel: ch,
                  topic: row.topic || ch.replace(/^#/, ""),
                  title: row.title || ch,
                }
          );
        });
      }
      try {
        var policyUrl = roomAssetUrl("channel-policy.json");
        var polRes = await fetch(policyUrl, { cache: "no-store" });
        if (polRes.ok) {
          var policy = await polRes.json();
          var wdc = policy && policy.website_default_channels;
          if (Array.isArray(wdc) && wdc.length) {
            WEBSITE_DEFAULT_CHANNELS = wdc.map(normalizeChannelName);
          }
          var repos = (policy && policy.repos) || {};
          Object.keys(repos).forEach(function (rk) {
            var repo = repos[rk] || {};
            if (repo.default_channel) {
              absorb([
                {
                  channel: repo.default_channel,
                  title: repo.title || repo.default_channel,
                  websiteDefault: true,
                },
              ]);
            }
            var channels = repo.channels;
            if (Array.isArray(channels)) absorb(channels);
            else if (channels && typeof channels === "object") {
              Object.keys(channels).forEach(function (key) {
                var meta = channels[key];
                if (meta && typeof meta === "object") {
                  absorb([
                    {
                      channel: meta.irc_channel || "#" + key,
                      topic: key,
                      title: meta.title || key,
                    },
                  ]);
                } else if (typeof meta === "string") {
                  absorb([{ channel: meta, topic: key }]);
                }
              });
            }
          });
          // Mark catalog defaults after absorb
          merged.forEach(function (row) {
            if (isWebsiteDefaultChannel(row.channel)) row.websiteDefault = true;
          });
        }
      } catch (e) {}
      try {
        var res = await fetch(apiBase() + "/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "channels" }),
        });
        if (res.ok) {
          var data = await res.json();
          absorb(data.channels || data.list || []);
        }
      } catch (e2) {}
      state.channelCatalog = merged;
      renderChannelMenu(merged);
      return merged;
    }

    var DRAFTS_KEY = "clevertree.room.channelDrafts";

    function readDraftMap() {
      try {
        var raw = localStorage.getItem(DRAFTS_KEY);
        if (!raw) return {};
        var parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch (e) {
        return {};
      }
    }

    function writeDraftMap(map) {
      try {
        localStorage.setItem(DRAFTS_KEY, JSON.stringify(map || {}));
      } catch (e) {}
    }

    function saveChannelDraft(channel) {
      var ch = normalizeChannelName(channel || opts.channel);
      var map = readDraftMap();
      map[ch] = {
        text: draft ? String(draft.value || "") : "",
        pendingMedia: (state.pendingMedia || []).map(function (it) {
          return {
            kind: it.kind || "file",
            url: it.url || "",
            sha256: it.sha256 || "",
            name: it.name || "",
            marker: it.marker || "",
          };
        }),
        updatedAt: Date.now(),
      };
      writeDraftMap(map);
    }

    function restoreChannelDraft(channel) {
      var ch = normalizeChannelName(channel || opts.channel);
      var row = readDraftMap()[ch] || {};
      if (draft) draft.value = row.text || "";
      state.pendingMedia = Array.isArray(row.pendingMedia)
        ? row.pendingMedia.filter(function (it) {
            return it && it.marker;
          })
        : [];
      renderPendingMedia();
    }

    function clearChannelDraft(channel) {
      var ch = normalizeChannelName(channel || opts.channel);
      var map = readDraftMap();
      if (map[ch]) {
        delete map[ch];
        writeDraftMap(map);
      }
    }

    function switchChannel(nextChannel, optsSwitch) {
      var ch = normalizeChannelName(nextChannel);
      var force = optsSwitch && optsSwitch.force;
      if (!ch || ch === normalizeChannelName(opts.channel)) return;
      saveChannelDraft(opts.channel);
      opts.channel = ch;
      if (channelTag) channelTag.textContent = ch;
      updateSiRailChrome();
      if (bodyEl) bodyEl.setAttribute("aria-label", ch);
      state.mirrors = defaultMirrors(apiBase(), ch);
      opts.mirrors = state.mirrors;
      opts.wsUrl = state.mirrors[0];
      state.mirrorIndex = 0;
      state.messages = [];
      state.pendingOutbox = [];
      state.historyHydrated = false;
      state.mediaReviews = {};
      state.connected = false;
      restoreChannelDraft(ch);
      clearSiPanel();
      siInitForChannel();
      renderStream();
      setConnUi("Switching…", ch);
      setComposerExpanded(true);
      disconnectWs();
      if (typeof opts.onChannelChange === "function") {
        try {
          opts.onChannelChange(ch);
        } catch (e2) {}
      }
      maybeConnect();
      if (force && draft && !state.extHandoff) {
        try {
          draft.focus();
        } catch (e3) {}
      }
    }

    function disconnectWs() {
      if (state.ws) {
        try {
          state.ws.onclose = null;
          state.ws.onmessage = null;
          state.ws.close();
        } catch (e) {}
        state.ws = null;
      }
      state.connected = false;
    }

    function maybeConnect() {
      if (state.destroyed || state.extHandoff) return;
      connect();
    }

    function syncExtOpenBtn() {
      if (!extOpenBtn) return;
      /* Shown whenever the extension is installed (panel open/close is unreliable). */
      extOpenBtn.hidden = !state.extHandoff;
    }

    function setExtHandoff(on) {
      var next = !!on;
      var was = !!state.extHandoff;
      if (was === next) {
        if (!next && !state.ws && !state.destroyed) maybeConnect();
        syncExtOpenBtn();
        return;
      }
      state.extHandoff = next;
      if (next) {
        el.setAttribute("data-ext", "handoff");
        setSiExpanded(true);
        setComposerExpanded(false);
        disconnectWs();
        setConnUi("Extension chat", "handoff");
      } else {
        el.removeAttribute("data-ext");
        maybeConnect();
      }
      syncExtOpenBtn();
    }

    function extKnownIds() {
      var ids = [];
      try {
        var stored = localStorage.getItem("clevertree.extension.id");
        if (stored) ids.push(stored);
      } catch (e) {}
      try {
        var meta = document.querySelector(
          'meta[name="clevertree-extension-id"]'
        );
        if (meta && meta.content && ids.indexOf(meta.content) < 0) {
          ids.unshift(meta.content);
        }
      } catch (e2) {}
      return ids;
    }

    function probeExtMessage(payload, cb) {
      if (
        typeof chrome === "undefined" ||
        !chrome.runtime ||
        !chrome.runtime.sendMessage
      ) {
        cb(false);
        return;
      }
      var ids = extKnownIds();
      if (!ids.length) {
        cb(false);
        return;
      }
      var tried = 0;
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
            try {
              localStorage.setItem("clevertree.extension.id", id);
            } catch (e3) {}
            cb(true, res);
          });
        } catch (e4) {
          next();
        }
      }
      next();
    }

    function openExtensionChat() {
      var titleText =
        (chatLogTitle && chatLogTitle.textContent) || opts.title || "";
      var openOpts = {
        url: typeof location !== "undefined" ? location.href : "",
        channel: opts.channel,
        title: titleText,
        extensionOnly: true,
      };
      var launcher = window.ClevertreeChatLauncher;
      if (launcher && typeof launcher.open === "function") {
        launcher.open(openOpts);
        return;
      }
      probeExtMessage(
        {
          type: "clevertree.chat.toggle",
          action: "open",
          url: openOpts.url,
          channel: openOpts.channel,
          title: openOpts.title,
        },
        function () {}
      );
    }

    function probeExtHandoff() {
      if (mode === "sidepanel" || state.destroyed) return;
      function apply(present) {
        if (state.destroyed) return;
        setExtHandoff(!!present);
      }
      var launcher = window.ClevertreeChatLauncher;
      if (launcher && typeof launcher.isExtensionPresent === "function") {
        launcher.isExtensionPresent(apply);
        return;
      }
      probeExtMessage(
        { type: "clevertree.chat.toggle", action: "ping" },
        function (ok) {
          apply(!!ok);
        }
      );
    }

    function wireExtPresence() {
      if (mode === "sidepanel") return;
      if (extOpenBtn) {
        extOpenBtn.onclick = function () {
          openExtensionChat();
        };
      }
      function onExtMsg(ev) {
        var d = ev && ev.data;
        if (!d || d.source !== "clevertree-chat-extension") return;
        if (d.type === "clevertree.extension.ready") probeExtHandoff();
      }
      function onVis() {
        if (document.visibilityState === "visible") probeExtHandoff();
      }
      window.addEventListener("message", onExtMsg);
      document.addEventListener("visibilitychange", onVis);
      state._onExtReady = onExtMsg;
      state._onExtVis = onVis;
    }

    function confirmSwitchChannel(nextChannel) {
      /* Kept for API compat — always silent; drafts persist per channel. */
      switchChannel(nextChannel, { force: true });
    }

    function renderPendingMedia() {
      if (!pendingMediaEl) return;
      var items = state.pendingMedia || [];
      if (!items.length) {
        pendingMediaEl.hidden = true;
        pendingMediaEl.innerHTML = "";
        return;
      }
      pendingMediaEl.hidden = false;
      pendingMediaEl.innerHTML = items
        .map(function (it, idx) {
          var kind = esc(it.kind || "file");
          var name = esc(it.name || it.kind || "attachment");
          var preview = "";
          if (it.kind === "image" && it.url) {
            preview =
              '<img class="pending-thumb" src="' +
              esc(it.url) +
              '" alt="" />';
          } else if (it.kind === "audio" && it.url) {
            preview =
              '<audio class="pending-player" controls preload="metadata" src="' +
              esc(it.url) +
              '"></audio>';
          } else if (it.kind === "video" && it.url) {
            preview =
              '<video class="pending-player" controls muted playsinline preload="metadata" src="' +
              esc(it.url) +
              '"></video>';
          }
          return (
            '<div class="pending-item" data-pending-idx="' +
            idx +
            '">' +
            preview +
            '<div class="pending-meta"><strong>' +
            kind +
            "</strong><span>" +
            name +
            '</span></div><button type="button" class="pending-clear" data-role="clear-pending" data-pending-idx="' +
            idx +
            '" aria-label="Remove ' +
            kind +
            ' attachment">Remove</button></div>'
          );
        })
        .join("");
      var clears = pendingMediaEl.querySelectorAll('[data-role="clear-pending"]');
      for (var ci = 0; ci < clears.length; ci++) {
        clears[ci].onclick = function (ev) {
          var btn = ev.currentTarget;
          var i = parseInt(btn.getAttribute("data-pending-idx") || "-1", 10);
          if (i < 0) return;
          state.pendingMedia.splice(i, 1);
          renderPendingMedia();
          saveChannelDraft(opts.channel);
        };
      }
    }

    function setUploadStatus(text) {
      if (!uploadStatus) return;
      if (!text) {
        uploadStatus.hidden = true;
        uploadStatus.textContent = "";
        return;
      }
      uploadStatus.hidden = false;
      uploadStatus.textContent = text;
    }

    function setReview(sha, url, status) {
      if (sha) state.mediaReviews[sha] = status;
      if (url) state.mediaReviews[url] = status;
    }

    function applyMediaReviewEvent(data) {
      var status = String((data && data.status) || "").toLowerCase();
      if (status !== "clear" && status !== "reject" && status !== "pending") return;
      setReview(data.sha, data.url, status);
      // Re-render stream so covers / muted autoplay update
      renderSeed();
    }

    function setTrackUi() {
      if (!trackBtn) return;
      var noun = String(opts.trackNoun || "group").trim() || "group";
      trackBtn.textContent = state.tracked
        ? "Tracking " + noun
        : "Track " + noun;
      trackBtn.classList.toggle("tracked", state.tracked);
      trackBtn.setAttribute("aria-pressed", state.tracked ? "true" : "false");
      trackBtn.setAttribute(
        "aria-label",
        state.tracked ? "Stop tracking " + noun : "Track " + noun
      );
    }

    var tagCfg = Object.assign(
      {},
      opts.tagConfig || {},
      {
        topics: opts.topics || (opts.tagConfig && opts.tagConfig.topics) || [],
        siteOrigin: opts.siteOrigin || "",
      }
    );

    /* ---- SI tab strip: Browse + detail tabs (Flashback chat-first browsing) ----
     * Enabled when the channel is #flashback or channel-policy sets
     * si_markdown_path for the repo. Browse = <siteOrigin>/<si_markdown_path>
     * rendered with ClevertreeSiMarkdown; ct-carousel-open spawns a detail tab. */
    var siTabsEl = $(el, '[data-role="si-tabs"]');
    var siPanesEl = $(el, '[data-role="si-panes"]');
    var si = { on: false, token: 0, origin: "", tabs: [], active: "", unsubMedia: null };
    var siPolicyPromise = null;

    function siLoadPolicy() {
      if (!siPolicyPromise) {
        siPolicyPromise = fetch(roomAssetUrl("channel-policy.json"), { cache: "no-store" })
          .then(function (r) {
            return r.ok ? r.json() : {};
          })
          .catch(function () {
            return {};
          });
      }
      return siPolicyPromise;
    }

    function siRepoForChannel(policy, ch) {
      var repos = (policy && policy.repos) || {};
      var keys = Object.keys(repos);
      for (var i = 0; i < keys.length; i++) {
        var repo = repos[keys[i]] || {};
        if (repo.default_channel && normalizeChannelName(repo.default_channel) === ch) {
          return repo;
        }
        if (Array.isArray(repo.channels)) {
          for (var j = 0; j < repo.channels.length; j++) {
            if (normalizeChannelName(repo.channels[j]) === ch) return repo;
          }
        }
        // Object-style craft channels (myproblem): { "ga-savannah-cat-rescue": { irc_channel, si_markdown_path } }
        if (repo.channels && !Array.isArray(repo.channels) && typeof repo.channels === "object") {
          var ckeys = Object.keys(repo.channels);
          for (var k = 0; k < ckeys.length; k++) {
            var meta = repo.channels[ckeys[k]] || {};
            var irc = normalizeChannelName(meta.irc_channel || ckeys[k]);
            if (irc === ch) {
              var merged = {};
              for (var rk in repo) {
                if (Object.prototype.hasOwnProperty.call(repo, rk) && rk !== "channels") {
                  merged[rk] = repo[rk];
                }
              }
              if (meta.si_markdown_path) merged.si_markdown_path = meta.si_markdown_path;
              if (meta.si_tickets_json) merged.si_tickets_json = meta.si_tickets_json;
              if (meta.si_default_poster) merged.si_default_poster = meta.si_default_poster;
              if (meta.collection_id) merged.collection_id = meta.collection_id;
              if (meta.title) merged.seed_topic = meta.title;
              merged.channel_meta = meta;
              return merged;
            }
          }
        }
      }
      return null;
    }

    /** opts.siteOrigin, else page origin when hosted on a repo host, else repo host. */
    function siSiteOrigin(repo, ch) {
      if (opts.siteOrigin) return String(opts.siteOrigin).replace(/\/+$/, "");
      var hosts = (repo && repo.hosts) || [];
      try {
        if (hosts.indexOf(location.hostname) >= 0) return location.origin;
      } catch (e) {}
      if (hosts.length) return "https://" + hosts[0];
      if (ch === "#flashback") return "https://flashbackrepository.org";
      if (ch === "#ga-savannah-cat-rescue" || ch === "#mp-general") {
        return "https://myproblem.app";
      }
      return "";
    }

    function siFindTab(id) {
      for (var i = 0; i < si.tabs.length; i++) {
        if (si.tabs[i].id === id) return si.tabs[i];
      }
      return null;
    }

    function siStopMediaIn(rootEl) {
      var mc = window.ClevertreeMediaController;
      if (mc && rootEl && typeof mc.stopWithin === "function") mc.stopWithin(rootEl);
    }

    function siReset() {
      si.token++;
      if (si.unsubMedia) {
        try {
          si.unsubMedia();
        } catch (e) {}
        si.unsubMedia = null;
      }
      if (siPanesEl) {
        siStopMediaIn(siPanesEl);
        siPanesEl.innerHTML = "";
        siPanesEl.hidden = true;
      }
      if (siTabsEl) {
        siTabsEl.innerHTML = "";
        siTabsEl.hidden = true;
      }
      si.tabs = [];
      si.active = "";
      si.on = false;
      siIndexCache = null;
      state.catalogSubtitle = "";
      if (aiBody) aiBody.hidden = false;
    }

    function formatShowingSubtitle(n) {
      var count = Math.max(0, Number(n) || 0);
      if (count === 1) return "1 movie now showing";
      return count + " movies now showing";
    }

    function showingCountFromIndex(data) {
      if (!data || typeof data !== "object") return 0;
      if (Array.isArray(data.nowShowing)) return data.nowShowing.length;
      if (data.showing && Array.isArray(data.showing.items)) {
        return data.showing.items.length;
      }
      var projects = data.projects;
      if (!Array.isArray(projects)) return 0;
      var n = 0;
      for (var i = 0; i < projects.length; i++) {
        if (String((projects[i] && projects[i].status) || "") === "showing") n++;
      }
      return n;
    }

    function applyCatalogSubtitleCount(n) {
      var count = Math.max(0, Number(n) || 0);
      state.catalogSubtitle = count > 0 ? formatShowingSubtitle(count) : "";
      updateSiRailChrome();
    }

    function siRefreshCatalogSubtitle(origin) {
      var ch = normalizeChannelName(opts.channel);
      if (ch !== "#flashback" || !origin) return;
      var token = si.token;
      /* Always re-fetch so a tip publish updates the count on next SI init. */
      siIndexCache = null;
      siLoadIndex(origin).then(function (data) {
        if (token !== si.token || state.destroyed) return;
        var n = showingCountFromIndex(data);
        if (n > 0) {
          applyCatalogSubtitleCount(n);
          return;
        }
        /* Fall back to curated carousel list if index has no nowShowing yet. */
        return fetch(
          String(origin).replace(/\/+$/, "") + "/hooks/client/si/showing.json",
          { credentials: "omit", cache: "no-cache" }
        )
          .then(function (r) {
            return r.ok ? r.json() : null;
          })
          .then(function (showing) {
            if (token !== si.token || state.destroyed) return;
            var items = showing && Array.isArray(showing.items) ? showing.items : [];
            applyCatalogSubtitleCount(items.length);
          })
          .catch(function () {});
      });
    }

    function siActivate(id) {
      var target = siFindTab(id) || siFindTab("browse");
      if (!target) return;
      si.active = target.id;
      for (var i = 0; i < si.tabs.length; i++) {
        var t = si.tabs[i];
        var on = t === target;
        t.pane.hidden = !on;
        t.wrap.classList.toggle("active", on);
        t.btn.setAttribute("aria-selected", on ? "true" : "false");
        t.btn.tabIndex = on ? 0 : -1;
      }
      try {
        target.wrap.scrollIntoView({ block: "nearest", inline: "nearest" });
      } catch (e) {}
    }

    function siAddTab(id, title, closable) {
      var pane = document.createElement("div");
      pane.className = "si-pane";
      pane.setAttribute("role", "tabpanel");
      pane.setAttribute("data-si-tab", id);
      pane.setAttribute("data-ct-site-origin", si.origin);
      pane.hidden = true;
      var wrap = document.createElement("span");
      wrap.className = "si-tab";
      wrap.setAttribute("role", "presentation");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "si-tab-btn";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", "false");
      btn.title = title;
      btn.textContent = title;
      wrap.appendChild(btn);
      var tab = { id: id, title: title, pane: pane, wrap: wrap, btn: btn };
      btn.onclick = function (ev) {
        ev.stopPropagation();
        siActivate(id);
      };
      if (closable) {
        var close = document.createElement("button");
        close.type = "button";
        close.className = "si-tab-close";
        close.setAttribute("aria-label", "Close " + title);
        close.textContent = "×";
        close.onclick = function (ev) {
          ev.stopPropagation();
          siCloseTab(id);
        };
        wrap.appendChild(close);
      }
      si.tabs.push(tab);
      siTabsEl.appendChild(wrap);
      siPanesEl.appendChild(pane);
      return tab;
    }

    /** Close a detail tab: stop its media, fall back to Browse. */
    function siCloseTab(id) {
      if (id === "browse") return;
      var tab = siFindTab(id);
      if (!tab) return;
      siStopMediaIn(tab.pane);
      si.tabs.splice(si.tabs.indexOf(tab), 1);
      if (tab.wrap.parentNode) tab.wrap.parentNode.removeChild(tab.wrap);
      if (tab.pane.parentNode) tab.pane.parentNode.removeChild(tab.pane);
      if (si.active === id) siActivate("browse");
    }

    /** Resolve relative img/a URLs in rendered README against the README URL. */
    function siRebaseUrls(rootEl, base) {
      var nodes = rootEl.querySelectorAll("img[src], a[href]");
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var attr = n.tagName === "IMG" ? "src" : "href";
        var raw = n.getAttribute(attr) || "";
        if (!raw || /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(raw)) continue;
        try {
          n.setAttribute(attr, new URL(raw, base).toString());
          if (attr === "href") {
            n.setAttribute("target", "_blank");
            n.setAttribute("rel", "noopener noreferrer");
          }
        } catch (e) {}
      }
    }

    function siUpgrade(rootEl) {
      var b = window.ClevertreeBuiltins;
      if (b && typeof b.upgrade === "function") b.upgrade(rootEl);
    }

    function siSlugFromDetail(d) {
      if (!d) return "";
      if (d.slug) return String(d.slug).trim();
      if (d.topic) return String(d.topic).trim();
      var rm = String(d.readme || "").replace(/\\/g, "/");
      var m = rm.match(/\/FanMixes\/([^\/]+)\//i);
      return m ? m[1] : "";
    }

    var siIndexCache = null;
    function siLoadIndex(origin) {
      if (siIndexCache && siIndexCache.origin === origin) {
        return Promise.resolve(siIndexCache.data);
      }
      return fetch(String(origin).replace(/\/+$/, "") + "/index.json", {
        credentials: "omit",
        cache: "no-cache",
      })
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .then(function (data) {
          siIndexCache = { origin: origin, data: data };
          return data;
        })
        .catch(function () {
          return null;
        });
    }

    function siTracksForSlug(indexData, slug, origin) {
      if (!indexData || !slug) return null;
      var projects = indexData.projects || indexData;
      if (!Array.isArray(projects)) return null;
      var hit = null;
      for (var i = 0; i < projects.length; i++) {
        var p = projects[i] || {};
        var folder =
          p.slug || p.folder || p.id || String(p.path || "").split("/").pop();
        if (String(folder) === String(slug)) {
          hit = p;
          break;
        }
      }
      if (!hit || !hit.subtitlesJson || hit.subtitlesJson === "[]") return null;
      try {
        var tracks = JSON.parse(hit.subtitlesJson);
        if (!Array.isArray(tracks) || !tracks.length) return null;
        var base = String(origin || "").replace(/\/+$/, "");
        return tracks
          .map(function (t) {
            if (!t || !t.src) return null;
            var src = String(t.src);
            if (src.charAt(0) === "/") src = base + src;
            return {
              src: src,
              label: t.label || "Subtitles",
              lang: t.lang || "en",
              default: !!t.default,
            };
          })
          .filter(Boolean);
      } catch (e) {
        return null;
      }
    }

    function siWireVideoTracks(rootEl, tracks) {
      if (!rootEl || !tracks || !tracks.length) return;
      var vids = rootEl.querySelectorAll("ct-video");
      var json = JSON.stringify(tracks);
      for (var i = 0; i < vids.length; i++) {
        var v = vids[i];
        if (v.getAttribute("tracks") || v.getAttribute("subtitles")) continue;
        v.setAttribute("tracks", json);
      }
    }

    function siOpenDetail(d) {
      d = d || {};
      var title = String(d.title || "Details");
      var slug = siSlugFromDetail(d);
      var id = String(slug ? "movie:" + slug : d.readme || "t:" + title);
      var existing = siFindTab(id);
      if (existing) {
        siActivate(id);
        return;
      }
      var tab = siAddTab(id, title, true);
      if (tab && slug) tab.topic = slug;
      var head = document.createElement("div");
      head.className = "si-detail-head";
      if (d.poster) {
        var img = document.createElement("img");
        img.alt = "";
        img.src = d.poster;
        head.appendChild(img);
      }
      var cap = document.createElement("div");
      var h = document.createElement("h2");
      h.textContent = title;
      cap.appendChild(h);
      if (d.year) {
        var yr = document.createElement("p");
        yr.className = "si-detail-year";
        yr.textContent = String(d.year);
        cap.appendChild(yr);
      }
      head.appendChild(cap);
      var body = document.createElement("div");
      body.className = "si-detail-body";
      body.textContent = d.readme ? "Loading…" : "";
      tab.pane.appendChild(head);
      tab.pane.appendChild(body);
      siActivate(id);
      if (!d.readme) return;
      var token = si.token;
      var origin = si.origin || "";
      Promise.all([
        fetch(d.readme, { credentials: "omit", cache: "no-cache" }).then(
          function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.text();
          }
        ),
        slug && origin ? siLoadIndex(origin) : Promise.resolve(null),
      ])
        .then(function (pair) {
          if (token !== si.token || !tab.pane.parentNode) return;
          var md = pair[0];
          var indexData = pair[1];
          body.innerHTML = window.ClevertreeSiMarkdown.render(md);
          siRebaseUrls(body, d.readme);
          var tracks = siTracksForSlug(indexData, slug, origin);
          if (tracks && tracks.length) siWireVideoTracks(body, tracks);
          siUpgrade(body);
        })
        .catch(function () {
          if (token !== si.token || !tab.pane.parentNode) return;
          body.textContent = "Couldn't load details.";
        });
    }

    function siEnable(origin, md) {
      si.on = true;
      si.origin = origin;
      siTabsEl.hidden = false;
      siPanesEl.hidden = false;
      if (aiBody) aiBody.hidden = true;
      var browse = siAddTab("browse", "Browse", false);
      browse.pane.className += " si-pane-browse";
      browse.pane.innerHTML = window.ClevertreeSiMarkdown.render(md);
      siRebaseUrls(browse.pane, origin + "/");
      siActivate("browse");
      siUpgrade(browse.pane);
      siRefreshCatalogSubtitle(origin);
      var mc = window.ClevertreeMediaController;
      if (mc && typeof mc.subscribe === "function") {
        si.unsubMedia = mc.subscribe(function (ev) {
          if (ev.type !== "load") return;
          /* Chat media yields to SI media (one active at a time). */
          var vids = stream ? stream.querySelectorAll("audio,video") : [];
          for (var i = 0; i < vids.length; i++) {
            try {
              vids[i].pause();
            } catch (e) {}
          }
          if (ev.owner && ev.owner.scrollIntoView) {
            try {
              ev.owner.scrollIntoView({ block: "nearest" });
            } catch (e2) {}
          }
        });
      }
    }

    /** Re-evaluate SI Browse for the current channel (boot + channel switch). */
    function siInitForChannel() {
      siReset();
      if (!siPanesEl || !siTabsEl) return;
      var token = si.token;
      var ch = normalizeChannelName(opts.channel);
      siLoadPolicy().then(function (policy) {
        if (token !== si.token || state.destroyed) return;
        var repo = siRepoForChannel(policy, ch);
        var path =
          opts.siMarkdownPath ||
          (repo && repo.si_markdown_path) ||
          (ch === "#flashback" ? "hooks/client/si/panel.md" : "");
        if (!path) return;
        var origin = siSiteOrigin(repo, ch);
        if (!origin) return;
        var url = origin + "/" + String(path).replace(/^\/+/, "");
        return Promise.all([
          loadSiBuiltins(),
          fetch(url, { credentials: "omit", cache: "no-cache" }).then(function (r) {
            return r.ok ? r.text() : null;
          }),
        ]).then(function (res) {
          var md = res[1];
          if (token !== si.token || state.destroyed) return;
          if (md == null || !window.ClevertreeSiMarkdown) return;
          siEnable(origin, md);
        });
      }).catch(function () {});
    }

    if (siPanesEl) {
      siPanesEl.addEventListener("ct-carousel-open", function (ev) {
        siOpenDetail(ev.detail);
      });
    }
    state.siCleanup = siReset;

    function clearSiPanel() {
      state.view = null;
      if (!aiBody) return;
      renderSiBodyFallback();
      updateSiRailChrome();
    }

    function applyIrcChrome(data) {
      if (!data || typeof data !== "object") return;
      if (data.topic_text != null) state.topicText = String(data.topic_text || "");
      if (data.channel) state.ircChannel = String(data.channel || "");
      if (Object.prototype.hasOwnProperty.call(data, "pin")) {
        state.pin =
          data.pin && typeof data.pin === "object" ? data.pin : null;
      }
      updateSiRailChrome();
      var hasKeys =
        state.view &&
        (state.view.sections || state.view.pairs || state.view.exists);
      var hasTracked =
        state.view &&
        Array.isArray(state.view.tracked_problems) &&
        state.view.tracked_problems.length;
      if (!hasKeys && !hasTracked && !demoTrackedForChannel().length) {
        renderSiBodyFallback();
      }
    }

    function pinBodyText() {
      var pin = state.pin;
      if (!pin || typeof pin !== "object") return "";
      return String(pin.body || pin.text || "").trim();
    }

    function topicKeyFromChannel(ch) {
      return String(ch || "")
        .trim()
        .replace(/^#/, "");
    }

    function sortTrackedProblems(list) {
      var open = [];
      var solved = [];
      (list || []).forEach(function (row) {
        if (!row || !row.title) return;
        if (String(row.status || "") === "solved") solved.push(row);
        else open.push(row);
      });
      function byUpdated(a, b) {
        return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
      }
      open.sort(byUpdated);
      solved.sort(byUpdated);
      return open.concat(solved);
    }

    function loadTrackedProblemsCatalog() {
      if (state.trackedCatalogPromise) return state.trackedCatalogPromise;
      state.trackedCatalogPromise = fetch(
        roomAssetUrl("tracked-problems.demo.json"),
        { cache: "no-store" },
      )
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .then(function (data) {
          state.trackedCatalog =
            data && data.by_topic && typeof data.by_topic === "object"
              ? data.by_topic
              : {};
          return state.trackedCatalog;
        })
        .catch(function () {
          state.trackedCatalog = {};
          return state.trackedCatalog;
        });
      return state.trackedCatalogPromise;
    }

    function demoTrackedForChannel() {
      var topic = topicKeyFromChannel(state.ircChannel || opts.channel || "");
      var cat = state.trackedCatalog || {};
      return sortTrackedProblems(cat[topic] || []);
    }

    function resolveTrackedProblems(view) {
      var fromView =
        view && Array.isArray(view.tracked_problems) ? view.tracked_problems : null;
      if (fromView && fromView.length) return sortTrackedProblems(fromView);
      return demoTrackedForChannel();
    }

    /** Status display only — batch owns solved; no client flip. */
    function renderTrackedProblemsHtml(list) {
      if (!list || !list.length) return "";
      var html =
        '<div class="si-tracked" role="list" aria-label="Tracked problems">' +
        '<p class="si-tracked-label">Problems</p>';
      list.forEach(function (row) {
        var solved = String(row.status || "") === "solved";
        var check = solved
          ? '<span class="si-tracked-check is-solved" aria-hidden="true">✓</span>'
          : '<span class="si-tracked-check" aria-hidden="true"></span>';
        html +=
          '<div class="si-tracked-row" role="listitem" data-status="' +
          (solved ? "solved" : "open") +
          '" aria-label="' +
          esc(String(row.title || "")) +
          (solved ? " — solved" : " — open") +
          '">' +
          check +
          '<div class="si-tracked-main">' +
          '<p class="si-tracked-title">' +
          esc(String(row.title || "")) +
          "</p>" +
          (row.summary
            ? '<p class="si-tracked-summary">' + esc(String(row.summary)) + "</p>"
            : "") +
          '<p class="si-tracked-meta"><span class="si-tracked-status">' +
          (solved ? "Solved" : "Open") +
          "</span>" +
          (row.updated_at
            ? ' · <time datetime="' +
              esc(String(row.updated_at)) +
              '">' +
              esc(String(row.updated_at).slice(0, 10)) +
              "</time>"
            : "") +
          "</p></div></div>";
      });
      html += "</div>";
      return html;
    }

    function updateSiRailChrome() {
      /* Chat-log head: IRC TOPIC left; catalog/pin/#channel subtitle; optional pin line. */
      var title =
        String(state.topicText || "").trim() ||
        String(opts.title || "").trim() ||
        "Public IRC room";
      var pinText = pinBodyText();
      var catalogSub = String(state.catalogSubtitle || "").trim();
      var channelLabel =
        String(state.ircChannel || opts.channel || "").trim() || "#web";
      var sub = catalogSub || pinText || channelLabel;
      if (chatLogTitle) chatLogTitle.textContent = title;
      if (chatLogSub) chatLogSub.textContent = sub;
      if (chatLogPin) {
        var showPin = !!(pinText && pinText !== sub);
        chatLogPin.hidden = !showPin;
        chatLogPin.textContent = showPin ? "Pinned · " + pinText : "";
      }
      if (channelTag) channelTag.textContent = channelLabel;
      var menuTitle = $(el, '[data-role="menu-room-title"]');
      if (menuTitle) menuTitle.textContent = title;
    }

    function renderSiBodyFallback() {
      if (!aiBody) return;
      var pinText = pinBodyText();
      if (!pinText) {
        aiBody.innerHTML = "";
        return;
      }
      var nick = state.pin && state.pin.nick ? String(state.pin.nick) : "";
      aiBody.innerHTML =
        '<article class="ai-section si-pin-fallback">' +
        "<h3>Pinned</h3>" +
        (nick
          ? '<p class="si-pin-nick"><code>' + esc(nick) + "</code></p>"
          : "") +
        '<div class="ai-position">' +
        esc(pinText) +
        "</div></article>";
    }

    function renderAiFindings(view) {
      if (!aiBody) return;
      /* Always replace — never keep the previous channel's SI markup. */
      state.view = view || null;
      var v = state.view || {};
      updateSiRailChrome();
      var tracked = resolveTrackedProblems(v);
      var sections = v.sections || {};
      var keys = Object.keys(sections).filter(function (k) {
        return k !== "uncategorized";
      });
      var hasKeys = !!(keys.length || (v.pairs && v.pairs.length) || v.exists);
      if (!tracked.length && !hasKeys) {
        renderSiBodyFallback();
        return;
      }
      var html = renderTrackedProblemsHtml(tracked);
      if (v.pairs && v.pairs.length) {
        html += '<div class="ai-pairs"><strong>Paired</strong><ul>';
        v.pairs.forEach(function (pair) {
          var a = (pair && (pair[0] || pair.a || pair.left)) || "";
          var b = (pair && (pair[1] || pair.b || pair.right)) || "";
          html +=
            "<li><code>" +
            esc(String(a)) +
            "</code> ↔ <code>" +
            esc(String(b)) +
            "</code></li>";
        });
        html += "</ul></div>";
      }
      keys.forEach(function (key) {
        var section = sections[key] || {};
        var title = section.title || key;
        var pos = section.position_html
          ? String(section.position_html)
          : section.position
            ? esc(String(section.position))
            : "";
        html +=
          '<article class="ai-section"><h3>' +
          esc(String(title)) +
          "</h3>" +
          (pos ? '<div class="ai-position">' + pos + "</div>" : "") +
          "</article>";
      });
      var uncat = sections.uncategorized;
      if (uncat && uncat.comments && uncat.comments.length) {
        html +=
          '<article class="ai-section"><h3>Unfiled</h3><p>' +
          uncat.comments.length +
          " comment(s) waiting for batch filing.</p></article>";
      }
      if (!html) {
        renderSiBodyFallback();
        return;
      }
      aiBody.innerHTML = linkifyChannelRefs(html);
      if (aiPanel) aiPanel.hidden = false;
    }

    function setAiUi() {
      /* SI strip is always present for the active channel; legacy toggle is a no-op. */
      if (aiBtn) {
        aiBtn.hidden = true;
      }
      state.aiOpen = true;
      if (state.view) renderAiFindings(state.view);
    }

    function normalizeHistoryLines(raw) {
      var lines = raw;
      if (!lines) return [];
      if (!Array.isArray(lines) && Array.isArray(lines.lines)) lines = lines.lines;
      if (!Array.isArray(lines)) return [];
      return lines
        .map(function (row) {
          if (typeof row === "string") {
            return { nick: "anon", text: row, time: "" };
          }
          var tsRaw = row.sentAt != null ? row.sentAt : row.ts;
          var out = {
            nick: row.nick || row.from || row.author || "anon",
            text: row.text || row.body || row.message || "",
            time: row.time || row.ts || "",
            pinned: !!row.pinned,
          };
          if (typeof tsRaw === "number" && isFinite(tsRaw)) out.sentAt = tsRaw;
          return out;
        })
        .filter(function (m) {
          return m.text;
        });
    }

    function hydrateHistory(raw, replace) {
      var incoming = normalizeHistoryLines(raw);
      if (!incoming.length) return;
      if (replace || !state.historyHydrated) {
        state.messages = incoming;
        state.historyHydrated = true;
      } else {
        incoming.forEach(function (m) {
          if (!serverLogHas(m)) state.messages.push(m);
        });
      }
      renderStream();
      updateSiRailChrome();
    }

    function setConnUi(label, mirrorNote) {
      if (connEl) connEl.textContent = label;
      if (mirrorEl) mirrorEl.textContent = mirrorNote ? " · " + mirrorNote : "";
      var connected =
        /connected/i.test(String(label || "")) &&
        !/reconnecting|offline|switching|connecting/i.test(String(label || ""));
      el.classList.toggle("is-connected", connected);
      var status = $(el, '[data-role="status"]');
      if (status) status.classList.toggle("is-connected", connected);
    }

    function serverLogHas(msg) {
      if (!msg || !msg.text) return false;
      var want = normalizePendingText(msg.text);
      var list = state.messages || [];
      for (var i = list.length - 1; i >= 0 && i >= list.length - 40; i--) {
        if (normalizePendingText(list[i].text) === want) {
          if (
            !msg.nick ||
            nicksMatch(list[i].nick, msg.nick) ||
            speakersMatch(list[i], msg)
          ) {
            return true;
          }
        }
      }
      return false;
    }

    function removePendingFromOutbox(match) {
      var box = state.pendingOutbox || [];
      if (!box.length) return null;
      var clientId = match && match.clientId;
      var want = match && match.text ? normalizePendingText(match.text) : "";
      for (var i = 0; i < box.length; i++) {
        var p = box[i];
        if (clientId && p.clientId === clientId) {
          return box.splice(i, 1)[0];
        }
      }
      if (want) {
        for (var j = 0; j < box.length; j++) {
          if (normalizePendingText(box[j].text) === want) {
            return box.splice(j, 1)[0];
          }
        }
      }
      return null;
    }

    /** Display rows = immutable server log + pending outbox (visual only). */
    function displayRows() {
      return (state.messages || []).concat(state.pendingOutbox || []);
    }

    function paintGroup(group, prefs) {
      prefs = prefs || state.coalescePrefs;
      if (!group || !group.lines || !group.lines.length) return;
      var mode = (prefs && prefs.mode) || "normal";
      var first = group.lines[0];
      var pending = !!group.pending;
      var failed = !!group.failed;
      if (mode === "paragraph" && group.lines.length > 1) {
        var para = group.lines
          .map(function (ln) {
            return String(ln.text || "").replace(/\s+/g, " ").trim();
          })
          .filter(Boolean)
          .join(" ");
        appendMessage(
          stream,
          {
            nick: group.nick,
            text: para,
            time: first.time || group.time || "",
            pending: pending,
            failed: failed,
            self: group.self,
            clientId: group.clientId,
            sentAt: group.sentAt || first.sentAt,
          },
          tagCfg,
          el,
          state.mediaReviews
        );
        return;
      }
      var art = appendMessage(
        stream,
        {
          nick: group.nick,
          text: first.text,
          time: first.time || group.time || "",
          pending: pending && group.lines.length === 1,
          failed: failed,
          self: group.self || first.self,
          clientId: first.clientId || group.clientId,
          sentAt: first.sentAt || group.sentAt,
        },
        tagCfg,
        el,
        state.mediaReviews
      );
      for (var i = 1; i < group.lines.length; i++) {
        appendLineToMessage(
          art,
          group.lines[i],
          tagCfg,
          el,
          state.mediaReviews
        );
      }
      if (pending && group.lines.length > 1 && art) {
        art.classList.add("msg-pending");
        art.setAttribute("aria-busy", "true");
      }
      if (failed && art) {
        art.classList.remove("msg-pending");
        art.classList.add("msg-failed");
      }
    }

    function renderStream() {
      stream.innerHTML = "";
      var rows = displayRows();
      if (!rows.length) {
        stream.innerHTML =
          '<div class="empty"><h2>Start the conversation.</h2><p>Ask a question or share what you know. Posts are public.</p></div>';
        return;
      }
      var groups = groupMessagesForDisplay(rows, state.coalescePrefs);
      for (var g = 0; g < groups.length; g++) {
        paintGroup(groups[g], state.coalescePrefs);
      }
      scrollHistoryToBottom();
    }

    function renderSeed() {
      renderStream();
    }

    function applyCoalescePrefs(prefs) {
      state.coalescePrefs = persistCoalescePrefs(prefs || state.coalescePrefs);
      syncCoalesceUi();
      /* Re-paint only — server log and pending outbox stay intact. */
      renderStream();
    }

    function syncCoalesceUi() {
      var prefs = state.coalescePrefs || readCoalescePrefs();
      var modeEl = $(el, '[data-role="coalesce-mode"]');
      var gap = $(el, '[data-role="coalesce-gap"]');
      if (modeEl) modeEl.value = prefs.mode || "normal";
      if (gap) {
        gap.value = String(prefs.gapMinutes || COALESCE_DEFAULT_GAP_MIN);
        gap.disabled = (prefs.mode || "normal") === "normal";
      }
    }

    async function uploadBlob(file, kindHint) {
      setUploadStatus("Uploading…");
      var fd = new FormData();
      fd.append("file", file, file.name || "upload.bin");
      fd.append("channel", channelSlug());
      if (kindHint) fd.append("kind", kindHint);
      if (visitor) fd.append("visitor", visitor);
      var headers = {};
      if (visitor) headers["X-Visitor-Id"] = visitor;
      var res = await fetch(apiBase() + "/api/inbox/upload", {
        method: "POST",
        body: fd,
        headers: headers,
      });
      var data = {};
      try {
        data = await res.json();
      } catch (e) {
        data = {};
      }
      /* Fallback to legacy media upload when inbox endpoint is unavailable. */
      if (!res.ok || !data.url) {
        var fd2 = new FormData();
        fd2.append("file", file, file.name || "upload.bin");
        fd2.append("channel", channelSlug());
        if (kindHint) fd2.append("kind", kindHint);
        if (visitor) fd2.append("visitor", visitor);
        res = await fetch(apiBase() + "/api/chat/media/upload", {
          method: "POST",
          body: fd2,
          headers: headers,
        });
        try {
          data = await res.json();
        } catch (e2) {
          data = {};
        }
      }
      if (!res.ok || !data.url) {
        throw new Error(data.error || "upload_" + res.status);
      }
      setReview(data.sha256, data.url, data.review || "pending");
      var kind = data.kind || data.classified_kind || kindHint || "file";
      var marker =
        data.marker ||
        data.marker_inbox ||
        "[[mp:media kind=" +
          kind +
          " url=" +
          data.url +
          " channel=#" +
          channelSlug() +
          " review=" +
          (data.review || "pending") +
          " sha=" +
          (data.sha256 || "") +
          "]]";
      state.pendingMedia.push({
        kind: kind,
        url: data.url,
        sha256: data.sha256 || "",
        object_id: data.object_id || "",
        name: file.name || kind,
        marker: marker,
      });
      renderPendingMedia();
      saveChannelDraft(opts.channel);
      setUploadStatus("");
      setComposerExpanded(true);
    }

    function takePendingMarkers() {
      var markers = (state.pendingMedia || [])
        .map(function (it) {
          return it.marker;
        })
        .filter(Boolean);
      state.pendingMedia = [];
      renderPendingMedia();
      saveChannelDraft(opts.channel);
      return markers;
    }

    function ingestDroppedFiles(fileList) {
      var files = [];
      if (!fileList || !fileList.length) return;
      for (var i = 0; i < fileList.length; i++) files.push(fileList[i]);
      files.forEach(function (f) {
        var hint = "";
        if (/^audio\//i.test(f.type || "")) hint = "audio";
        else if (/^video\//i.test(f.type || "")) hint = "video";
        else if (/^image\//i.test(f.type || "")) hint = "image";
        uploadBlob(f, hint).catch(function (err) {
          setUploadStatus(err && err.message ? err.message : "Upload failed");
        });
      });
    }

    function stopMediaTracks() {
      if (state.mediaStream) {
        try {
          state.mediaStream.getTracks().forEach(function (t) {
            t.stop();
          });
        } catch (e) {}
      }
      state.mediaStream = null;
    }

    function setRecordingUi(on) {
      state.recording = !!on;
      if (stopRecordBtn) stopRecordBtn.hidden = !on;
      if (recordAudioBtn) recordAudioBtn.disabled = !!on;
      if (recordVideoBtn) recordVideoBtn.disabled = !!on;
      if (attachBtn) attachBtn.disabled = !!on;
    }

    function startCapture(video) {
      if (
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function" ||
        typeof MediaRecorder === "undefined"
      ) {
        setUploadStatus("Recording not supported. You can attach a file instead.");
        return;
      }

      var kind = video ? "video" : "audio";
      var candidates = video
        ? ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
        : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      var mime =
        typeof MediaRecorder.isTypeSupported === "function"
          ? candidates.find(function (type) {
              return MediaRecorder.isTypeSupported(type);
            })
          : "";
      setUploadStatus(video ? "Starting camera…" : "Starting mic…");
      if (recordAudioBtn) recordAudioBtn.disabled = true;
      if (recordVideoBtn) recordVideoBtn.disabled = true;

      function finishCapture() {
        state.mediaRecorder = null;
        setRecordingUi(false);
        stopMediaTracks();
      }

      navigator.mediaDevices
        .getUserMedia({
          audio: true,
          video: video ? { facingMode: "user" } : false,
        })
        .then(function (mediaStream) {
          state.mediaStream = mediaStream;
          if (state.destroyed) {
            finishCapture();
            return;
          }
          var chunks = [];
          var rec = mime
            ? new MediaRecorder(mediaStream, { mimeType: mime })
            : new MediaRecorder(mediaStream);
          state.mediaRecorder = rec;
          rec.ondataavailable = function (ev) {
            if (ev.data && ev.data.size) chunks.push(ev.data);
          };
          rec.onerror = function () {
            rec.onstop = null;
            finishCapture();
            setUploadStatus("Recording failed. You can attach a file instead.");
          };
          rec.onstop = function () {
            finishCapture();
            if (state.destroyed) return;
            if (!chunks.length) {
              setUploadStatus(
                "No recording captured. You can attach a file instead."
              );
              return;
            }
            var type = (chunks[0].type || rec.mimeType || mime || "")
              .split(";")[0]
              .toLowerCase();
            var extensions = {
              "audio/mp4": "m4a",
              "video/mp4": "mp4",
              "audio/webm": "webm",
              "video/webm": "webm",
              "audio/ogg": "ogg",
              "video/ogg": "ogv",
            };
            var extension = extensions[type];
            if (!extension) {
              setUploadStatus(
                "Recording format unavailable. You can attach a file instead."
              );
              return;
            }
            var name =
              (video ? "clip-" : "voice-") + Date.now() + "." + extension;
            var file = new File(chunks, name, { type: type });
            uploadBlob(file, kind).catch(function (err) {
              setUploadStatus(
                err && err.message ? err.message : "Upload failed"
              );
            });
          };
          rec.start();
          setRecordingUi(true);
          setUploadStatus(
            video
              ? "Recording video… tap Stop when done"
              : "Recording audio… tap Stop when done"
          );
        }, function () {
          finishCapture();
          setUploadStatus(
            "Mic/camera unavailable. Check permissions or attach a file instead."
          );
        })
        .catch(function () {
          finishCapture();
          setUploadStatus(
            "Recording failed to start. You can attach a file instead."
          );
        });
    }

    function stopCapture() {
      if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
        try {
          state.mediaRecorder.stop();
        } catch (e) {}
      } else {
        setRecordingUi(false);
        stopMediaTracks();
        setUploadStatus("");
      }
    }

    if (attachBtn && fileInput) {
      attachBtn.onclick = function () {
        fileInput.click();
      };
      fileInput.onchange = function () {
        var f = fileInput.files && fileInput.files[0];
        fileInput.value = "";
        if (!f) return;
        uploadBlob(f, "").catch(function (err) {
          setUploadStatus(err && err.message ? err.message : "Upload failed");
        });
      };
    }
    if (composerEl) {
      ;["dragenter", "dragover"].forEach(function (evName) {
        composerEl.addEventListener(evName, function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          composerEl.classList.add("drop-hover");
        });
      });
      ;["dragleave", "dragend"].forEach(function (evName) {
        composerEl.addEventListener(evName, function (ev) {
          ev.preventDefault();
          composerEl.classList.remove("drop-hover");
        });
      });
      composerEl.addEventListener("drop", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        composerEl.classList.remove("drop-hover");
        var dt = ev.dataTransfer;
        if (!dt || !dt.files || !dt.files.length) return;
        ingestDroppedFiles(dt.files);
      });
    }
    if (draft) {
      draft.addEventListener("paste", function (ev) {
        var items = ev.clipboardData && ev.clipboardData.items;
        if (!items || !items.length) return;
        var files = [];
        for (var pi = 0; pi < items.length; pi++) {
          var item = items[pi];
          if (item.kind === "file") {
            var pf = item.getAsFile();
            if (pf) files.push(pf);
          }
        }
        if (!files.length) return;
        ev.preventDefault();
        ingestDroppedFiles(files);
      });
    }
    if (recordAudioBtn) {
      recordAudioBtn.onclick = function () {
        startCapture(false);
      };
    }
    if (recordVideoBtn) {
      recordVideoBtn.onclick = function () {
        startCapture(true);
      };
    }
    if (stopRecordBtn) {
      stopRecordBtn.onclick = function () {
        stopCapture();
      };
    }

    function confirmPublic(onOk) {
      modal.innerHTML =
        '<div class="eyebrow">PUBLIC IRC ROOM</div>' +
        "<h2>Send to the public room?</h2>" +
        "<p>Your message will appear in " +
        esc(opts.channel || "this channel") +
        ". Anyone may see or save it. There is no private mode.</p>" +
        '<div class="notice"><strong>Public, not private.</strong> AI may preserve useful findings in the collection repository.</div>' +
        '<div class="modal-actions">' +
        '<button type="button" class="cancel" data-role="cancel">Cancel</button>' +
        '<button type="button" class="send" data-role="confirm">Post publicly</button></div>';
      overlay.hidden = false;
      overlay.classList.add("open");
      $(modal, '[data-role="cancel"]').onclick = function () {
        overlay.hidden = true;
        overlay.classList.remove("open");
      };
      $(modal, '[data-role="confirm"]').onclick = function () {
        overlay.hidden = true;
        overlay.classList.remove("open");
        onOk();
      };
    }

    function postLocal(text) {
      var tagged = Tags.autoTag(text, opts.context || {});
      var clientId = makeClientId();
      var sentAt = Date.now();
      var msg = {
        nick: opts.nick || "you",
        text: tagged,
        time: "…",
        pending: true,
        self: true,
        clientId: clientId,
        sentAt: sentAt,
      };
      if (typeof opts.onSend === "function") {
        opts.onSend(tagged, msg);
      }
      /* Pending outbox only — never write optimistic rows into the server log. */
      state.pendingOutbox.push(msg);
      renderStream();

      var offline = !state.ws || state.ws.readyState !== 1;
      function settleLocalOffline() {
        removePendingFromOutbox({ clientId: clientId });
        state.pendingOutbox.push({
          nick: msg.nick,
          text: tagged,
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          self: true,
          clientId: clientId,
          sentAt: sentAt,
          pending: false,
          localOnly: true,
        });
        renderStream();
      }
      if (offline) {
        settleLocalOffline();
        return;
      }
      try {
        state.ws.send(
          JSON.stringify({
            type: "privmsg",
            channel: opts.channel,
            text: tagged,
            visitor: visitor,
            nick: opts.nick || "you",
            client_id: clientId,
          })
        );
        /* Fail stuck pending after timeout (outbox row, then re-paint). */
        setTimeout(function () {
          var box = state.pendingOutbox || [];
          for (var i = 0; i < box.length; i++) {
            if (box[i].clientId === clientId && box[i].pending) {
              box[i].pending = false;
              box[i].failed = true;
              renderStream();
              break;
            }
          }
        }, PENDING_TIMEOUT_MS);
      } catch (e) {
        settleLocalOffline();
      }
    }

    function onThemeClick() {
      /* Explicit light/dark override; Options can restore system. */
      state.themePref = state.theme === "dark" ? "light" : "dark";
      state.theme = state.themePref;
      persistRoomTheme(state.themePref);
      applyRoomTheme(el, state.theme, state.themePref);
    }
    var themeBtns = el.querySelectorAll('[data-role="theme-toggle"]');
    for (var ti = 0; ti < themeBtns.length; ti++) {
      themeBtns[ti].onclick = onThemeClick;
    }
    var coalesceModeEl = $(el, '[data-role="coalesce-mode"]');
    var coalesceGapEl = $(el, '[data-role="coalesce-gap"]');
    if (coalesceModeEl) {
      coalesceModeEl.onchange = function () {
        applyCoalescePrefs({
          mode: coalesceModeEl.value || "normal",
          gapMinutes:
            (state.coalescePrefs && state.coalescePrefs.gapMinutes) ||
            COALESCE_DEFAULT_GAP_MIN,
        });
      };
    }
    if (coalesceGapEl) {
      coalesceGapEl.onchange = function () {
        applyCoalescePrefs({
          mode: (state.coalescePrefs && state.coalescePrefs.mode) || "normal",
          gapMinutes: Number(coalesceGapEl.value) || COALESCE_DEFAULT_GAP_MIN,
        });
      };
    }
    var mq =
      typeof matchMedia === "function"
        ? matchMedia("(prefers-color-scheme: dark)")
        : null;
    function onSchemeChange() {
      if (state.destroyed) return;
      state.themePref = readThemePref();
      if (state.themePref !== "system") return;
      state.theme = resolveRoomTheme("system");
      applyRoomTheme(el, state.theme, state.themePref);
    }
    if (mq && mq.addEventListener) mq.addEventListener("change", onSchemeChange);

    if (trackBtn) {
      trackBtn.onclick = function () {
        state.tracked = !state.tracked;
        setTrackUi();
        if (typeof opts.onTrack === "function") opts.onTrack(state.tracked);
      };
    }
    var gatherBtn = $(el, '[data-role="gather"]');
    var refreshNwBtn = $(el, '[data-role="refresh"]');
    if (gatherBtn) {
      gatherBtn.onclick = function () {
        if (typeof opts.onGather === "function") opts.onGather();
      };
    }
    if (refreshNwBtn) {
      refreshNwBtn.onclick = function () {
        if (typeof opts.onRefresh === "function") opts.onRefresh();
        else if (typeof opts.onGather === "function") opts.onGather();
      };
    }

    /**
     * Networker consent: new batch vs last local hash.
     * Resolves { postPublic, autoFuture, confirmed }.
     */
    function showBatchConsent(info) {
      info = info || {};
      return new Promise(function (resolve) {
        if (!overlay || !modal) {
          resolve({
            confirmed: false,
            postPublic: false,
            autoFuture: false,
          });
          return;
        }
        var hashShort = String(info.contentHash || "").slice(0, 12) || "new";
        var posts = info.posts != null ? info.posts : "?";
        modal.innerHTML =
          '<div class="batch-consent" role="dialog" aria-labelledby="ct-batch-consent-title">' +
          '<div class="aicap">Networker</div>' +
          '<div class="aititle"><h2 id="ct-batch-consent-title">New gather batch</h2>' +
          '<button type="button" class="close" data-role="consent-close" aria-label="Close">×</button></div>' +
          '<p class="batch-consent-lead">This batch looks new (hash ' +
          esc(hashShort) +
          " · " +
          esc(String(posts)) +
          " posts). Is it okay to upload and post the link in the public chat?</p>" +
          '<label class="batch-consent-check"><input type="checkbox" data-role="consent-post" checked /> ' +
          "Post the inbox link in the public chat</label>" +
          '<label class="batch-consent-check"><input type="checkbox" data-role="consent-auto" /> ' +
          "Auto upload / post new batches in the future</label>" +
          '<div class="batch-consent-actions">' +
          '<button type="button" class="batch-consent-yes" data-role="consent-yes">Yes, upload</button>' +
          '<button type="button" class="batch-consent-no" data-role="consent-no">Not now</button>' +
          "</div></div>";
        overlay.hidden = false;
        overlay.classList.add("open");
        function finish(confirmed) {
          var postEl = modal.querySelector('[data-role="consent-post"]');
          var autoEl = modal.querySelector('[data-role="consent-auto"]');
          var postPublic = !!(postEl && postEl.checked);
          var autoFuture = !!(autoEl && autoEl.checked);
          overlay.classList.remove("open");
          overlay.hidden = true;
          modal.innerHTML = "";
          resolve({ confirmed: !!confirmed, postPublic: postPublic, autoFuture: autoFuture });
        }
        var yes = modal.querySelector('[data-role="consent-yes"]');
        var no = modal.querySelector('[data-role="consent-no"]');
        var closer = modal.querySelector('[data-role="consent-close"]');
        if (yes) yes.onclick = function () { finish(true); };
        if (no) no.onclick = function () { finish(false); };
        if (closer) closer.onclick = function () { finish(false); };
        overlay.onclick = function (ev) {
          if (ev.target === overlay) finish(false);
        };
      });
    }
    if (aiBtn) {
      aiBtn.onclick = function () {
        state.aiOpen = !state.aiOpen;
        setAiUi();
        if (state.aiOpen && !state.view && typeof opts.onNeedView === "function") {
          opts.onNeedView();
        }
      };
    }
    var aiHide = $(el, '[data-role="ai-hide"]');
    if (aiHide) {
      aiHide.onclick = function () {
        state.aiOpen = false;
        setAiUi();
        if (aiBtn) aiBtn.focus();
      };
    }

    sendBtn.onclick = function () {
      var text = draft.value.trim();
      var markers = (state.pendingMedia || [])
        .map(function (it) {
          return it.marker;
        })
        .filter(Boolean);
      if (!text && !markers.length) {
        setComposerExpanded(true);
        draft.focus();
        return;
      }
      confirmPublic(function () {
        var attached = takePendingMarkers();
        var body = text;
        if (attached.length) {
          body = body ? body + "\n" + attached.join("\n") : attached.join("\n");
        }
        postLocal(body);
        draft.value = "";
        clearChannelDraft(opts.channel);
      });
    };

    if (investigateBtn) {
      investigateBtn.onclick = function () {
        var focus = draft.value.trim();
        var cmd = focus ? "!investigate " + focus : "!investigate";
        confirmPublic(function () {
          postLocal(cmd);
          draft.value = "";
        });
      };
    }

    function connect() {
      var url = pickMirror(state.mirrors, state.mirrorIndex);
      if (!isWsUrl(url) && isWsUrl(opts.wsUrl)) url = opts.wsUrl;
      url = withVisitorParam(url, visitor);
      if (!isWsUrl(url)) {
        setConnUi("Offline (demo)", "no mirror");
        return;
      }
      setConnUi("Connecting…", "mirror " + (state.mirrorIndex + 1));
      try {
        var ws = new WebSocket(url);
        state.ws = ws;
        ws.onopen = function () {
          state.connected = true;
          setConnUi("IRC connected", "Mirror current");
          if (typeof opts.onOpen === "function") opts.onOpen(ws);
        };
        ws.onclose = function () {
          state.connected = false;
          if (state.extHandoff) {
            setConnUi("Extension chat", "handoff");
            return;
          }
          setConnUi("Reconnecting…", "");
          state.mirrorIndex += 1;
          if (
            !state.destroyed &&
            !state.extHandoff &&
            (state.mirrors.length || opts.wsUrl)
          ) {
            setTimeout(connect, 800);
          } else if (!state.destroyed) {
            setConnUi("Offline", "no mirror");
          }
        };
        ws.onmessage = function (ev) {
          var data;
          try {
            data = JSON.parse(ev.data);
          } catch (e) {
            return;
          }
          var typ = data.type || "";
          if (typ === "hello") {
            state.mediaReviews = {};
            if (data.media_reviews && typeof data.media_reviews === "object") {
              Object.keys(data.media_reviews).forEach(function (k) {
                state.mediaReviews[k] = data.media_reviews[k];
              });
            }
            applyIrcChrome(data);
            if (data.view) applyIrcChrome(data.view);
            /* Fresh SI for this channel — never keep the previous room's panel. */
            if (data.view) renderAiFindings(data.view);
            else clearSiPanel();
            hydrateHistory(
              data.chat_history || data.history || data.lines || [],
              true
            );
            if (typeof opts.onHello === "function") opts.onHello(data);
            return;
          }
          if (typ === "topic.update" || typ === "pin.update") {
            applyIrcChrome(data);
            return;
          }
          if (typ === "board.snapshot" || typ === "batch.notice") {
            if (data.view) {
              applyIrcChrome(data.view);
              renderAiFindings(data.view);
            }
            return;
          }
          if (typ === "chat.history" || typ === "chat_history") {
            hydrateHistory(data.lines || data.chat_history || data, true);
            return;
          }
          if (typ === "media.review") {
            applyMediaReviewEvent(data);
            return;
          }
          if (typ === "chat.error") {
            var errClient =
              data.client_id ||
              (data.chat_line && data.chat_line.client_id) ||
              "";
            var box = state.pendingOutbox || [];
            var marked = false;
            for (var ei = 0; ei < box.length; ei++) {
              if (
                (errClient && box[ei].clientId === errClient) ||
                (!errClient && box[ei].pending)
              ) {
                box[ei].pending = false;
                box[ei].failed = true;
                marked = true;
                if (errClient) break;
              }
            }
            if (marked) renderStream();
            return;
          }
          if (
            typ === "privmsg" ||
            typ === "message" ||
            typ === "post.live" ||
            data.text ||
            data.body ||
            (data.comment && data.comment.body)
          ) {
            var comment = data.comment || {};
            var line = data.chat_line || {};
            var nick =
              data.nick ||
              line.nick ||
              comment.author ||
              data.from ||
              data.author ||
              "anon";
            var msg = {
              nick: nick,
              text:
                data.text ||
                data.body ||
                line.body ||
                comment.body ||
                "",
              time: data.time || line.ts || "",
              sentAt: Date.now(),
            };
            if (!msg.text) return;
            var clientId =
              data.client_id ||
              line.client_id ||
              comment.client_id ||
              "";
            removePendingFromOutbox({
              clientId: clientId,
              text: msg.text,
            });
            /* Drop matching localOnly offline echoes once the wire has it. */
            removePendingFromOutbox({ text: msg.text });
            if (!serverLogHas(msg)) {
              state.messages.push(msg);
            }
            renderStream();
          }
        };
      } catch (e) {
        setConnUi("Offline", "ws error");
      }
    }

    if (draft) {
      draft.addEventListener("input", function () {
        saveChannelDraft(opts.channel);
      });
    }
    restoreChannelDraft(opts.channel);

    setTrackUi();
    setAiUi();
    syncCoalesceUi();
    renderSeed();
    siInitForChannel();
    loadTrackedProblemsCatalog().then(function () {
      if (state.destroyed) return;
      if (state.view) {
        renderAiFindings(state.view);
        return;
      }
      var demo = demoTrackedForChannel();
      if (demo.length) {
        renderAiFindings({ tracked_problems: demo, exists: false });
      }
    });
    if (mode === "sidepanel") {
      connect();
    } else {
      wireExtPresence();
      probeExtHandoff();
    }

    /* Chat media never autoplays; when the user plays it, SI media yields. */
    el.addEventListener(
      "play",
      function (ev) {
        var t = ev.target;
        var mc = window.ClevertreeMediaController;
        if (mc && t && t.closest && t.closest('[data-role="stream"]')) mc.stop();
      },
      true
    );

    /* Keep composer above the soft keyboard; follow visualViewport when the
     * host overlays IME without resizing (and when interactive-widget helps). */
    function keepComposerInView() {
      if (!draft || document.activeElement !== draft) return;
      try {
        var len = (draft.value || "").length;
        if (typeof draft.setSelectionRange === "function") {
          draft.setSelectionRange(len, len);
        }
        draft.scrollTop = draft.scrollHeight;
      } catch (e) {}
      if (!composerEl) return;
      var vv = window.visualViewport;
      var limit = vv ? vv.offsetTop + vv.height : window.innerHeight;
      var box = composerEl.getBoundingClientRect();
      if (box.bottom > limit - 6 && history) {
        suppressHistoryCollapse(160);
        history.scrollTop = Math.min(
          history.scrollHeight,
          history.scrollTop + (box.bottom - limit + 12)
        );
      }
      try {
        if (typeof draft.scrollIntoView === "function") {
          draft.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
      } catch (e2) {}
    }

    function syncKeyboardViewport() {
      if (state.destroyed) return;
      var vv = window.visualViewport;
      var layoutH =
        window.innerHeight ||
        (document.documentElement && document.documentElement.clientHeight) ||
        0;
      var visibleH = vv ? vv.height : layoutH;
      var offsetTop = vv ? vv.offsetTop : 0;
      var inset = Math.max(0, Math.round(layoutH - visibleH - offsetTop));
      var kbOpen = inset > 64 || (layoutH > 0 && layoutH - visibleH > 64);
      el.classList.toggle("kb-open", kbOpen);
      el.style.setProperty("--vv-height", Math.round(visibleH) + "px");
      el.style.setProperty("--vv-offset-top", Math.round(offsetTop) + "px");
      el.style.setProperty("--kb-inset", inset + "px");
      /* Overlay keyboards: pin the room to the visible viewport. When the
       * Android host already resized us (ime padding), inset≈0 and we clear. */
      if (kbOpen && (inset > 40 || offsetTop > 0)) {
        el.style.height = Math.round(visibleH) + "px";
        el.style.maxHeight = Math.round(visibleH) + "px";
        el.style.transform = offsetTop
          ? "translateY(" + Math.round(offsetTop) + "px)"
          : "";
      } else if (!el.classList.contains("menu-open")) {
        el.style.height = "";
        el.style.maxHeight = "";
        el.style.transform = "";
      }
      keepComposerInView();
    }

    function scheduleKeyboardViewport() {
      if (state.kbViewportRaf) return;
      state.kbViewportRaf = requestAnimationFrame(function () {
        state.kbViewportRaf = 0;
        syncKeyboardViewport();
      });
    }

    state._onKbViewport = scheduleKeyboardViewport;
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", scheduleKeyboardViewport);
      window.visualViewport.addEventListener("scroll", scheduleKeyboardViewport);
    }
    window.addEventListener("resize", scheduleKeyboardViewport);
    window.addEventListener("orientationchange", scheduleKeyboardViewport);
    if (draft) {
      draft.addEventListener("focus", scheduleKeyboardViewport);
      draft.addEventListener("blur", function () {
        setTimeout(scheduleKeyboardViewport, 120);
      });
      draft.addEventListener("input", function () {
        scheduleKeyboardViewport();
        keepComposerInView();
      });
      draft.addEventListener("keyup", keepComposerInView);
    }
    syncKeyboardViewport();

    return {
      el: el,
      mode: mode,
      /** Gather must never appear on room component */
      hasGather: false,
      getState: function () {
        return {
          tracked: state.tracked,
          aiOpen: state.aiOpen,
          connected: state.connected,
          mode: mode,
          channel: opts.channel,
          layoutMode: state.layoutMode,
          orient: state.orient,
          theme: state.theme,
          themePref: state.themePref,
        };
      },
      setTheme: function (mode) {
        if (mode !== "light" && mode !== "dark" && mode !== "system") return;
        state.themePref = mode;
        persistRoomTheme(mode);
        state.theme = resolveRoomTheme(mode);
        applyRoomTheme(el, state.theme, state.themePref);
      },
      showBatchConsent: showBatchConsent,
      setNetworkerBusy: function (busy) {
        if (gatherBtn) {
          gatherBtn.disabled = !!busy;
          gatherBtn.textContent = busy ? "Gathering…" : "Gather";
        }
        if (refreshNwBtn) {
          refreshNwBtn.disabled = !!busy;
          refreshNwBtn.textContent = busy ? "…" : "Refresh";
        }
      },
      setTracked: function (v) {
        state.tracked = !!v;
        setTrackUi();
      },
      setAiOpen: function () {
        state.aiOpen = true;
        setAiUi();
      },
      setView: function (view) {
        renderAiFindings(view);
      },
      setChannel: function (channel) {
        switchChannel(channel);
      },
      listChannels: function () {
        return loadChannelCatalog();
      },
      setLayoutMode: function (mode) {
        setLayoutMode(mode);
      },
      getLayoutMode: function () {
        return state.layoutMode;
      },
      setOrient: function (orient) {
        setOrient(orient);
      },
      getOrient: function () {
        return state.orient;
      },
      openMenu: function () {
        setMenuOpen(true);
      },
      closeMenu: function () {
        setMenuOpen(false);
      },
      appendMessage: function (msg) {
        /* Host API: treat as server-log append (not pending). */
        if (msg && msg.text && !serverLogHas(msg)) {
          state.messages.push(msg);
        }
        renderStream();
      },
      setCoalescePrefs: function (prefs) {
        applyCoalescePrefs(prefs);
      },
      getCoalescePrefs: function () {
        return state.coalescePrefs;
      },
      destroy: function () {
        try {
          saveChannelDraft(opts.channel);
        } catch (eSave) {}
        state.destroyed = true;
        if (state.siCleanup) state.siCleanup();
        stopCapture();
        if (state._onExtReady) {
          window.removeEventListener("message", state._onExtReady);
          state._onExtReady = null;
        }
        if (state._onExtVis) {
          document.removeEventListener("visibilitychange", state._onExtVis);
          state._onExtVis = null;
        }
        if (state.holdComposerTimer) {
          clearTimeout(state.holdComposerTimer);
          state.holdComposerTimer = null;
        }
        if (state.kbViewportRaf) {
          cancelAnimationFrame(state.kbViewportRaf);
          state.kbViewportRaf = 0;
        }
        if (window.visualViewport && state._onKbViewport) {
          window.visualViewport.removeEventListener(
            "resize",
            state._onKbViewport
          );
          window.visualViewport.removeEventListener(
            "scroll",
            state._onKbViewport
          );
        }
        if (state._onKbViewport) {
          window.removeEventListener("resize", state._onKbViewport);
          window.removeEventListener(
            "orientationchange",
            state._onKbViewport
          );
        }
        if (state._rowMq && state._onRowMq) {
          if (state._rowMq.removeEventListener) {
            state._rowMq.removeEventListener("change", state._onRowMq);
          } else if (state._rowMq.removeListener) {
            state._rowMq.removeListener(state._onRowMq);
          }
        }
        if (mq && mq.removeEventListener) {
          mq.removeEventListener("change", onSchemeChange);
        }
        disconnectWs();
        if (mode === "page") {
          document.body.classList.remove("ct-room-page");
        }
        el.classList.remove(
          "room",
          "ct-room",
          "ct-room-host",
          "embedded",
          "sidepanel",
        );
        el.removeAttribute("data-theme");
        el.removeAttribute("data-ext");
        el.style.colorScheme = "";
        el.style.height = "";
        el.style.maxHeight = "";
        el.style.transform = "";
        el.innerHTML = "";
      },
      BOT_NICKS: BOT_NICKS,
    };
  }

  return {
    mount: mount,
    isBotNick: isBot,
    BOT_NICKS: BOT_NICKS,
    pickMirror: pickMirror,
    defaultMirrors: defaultMirrors,
    THEME_KEY: THEME_KEY,
    COALESCE_KEY: COALESCE_KEY,
    COALESCE_DEFAULT_GAP_MIN: COALESCE_DEFAULT_GAP_MIN,
    COALESCE_MODES: COALESCE_MODES,
    readCoalescePrefs: readCoalescePrefs,
    persistCoalescePrefs: persistCoalescePrefs,
    messageTs: messageTs,
    nicksMatch: nicksMatch,
    speakersMatch: speakersMatch,
    canCoalesce: canCoalesce,
    groupMessagesForDisplay: groupMessagesForDisplay,
    resolveTheme: resolveRoomTheme,
  };
});
