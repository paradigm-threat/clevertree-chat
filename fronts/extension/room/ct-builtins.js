/**
 * CleverTree SI built-in components (web custom elements) + SI markdown.
 *
 *   <ct-carousel src="/hooks/client/si/showing.json" open="tab" mode="grid"></ct-carousel>
 *   <ct-video src="https://…/movie.mp4" label="Watch"></ct-video>
 *   <ct-playlist src="/hooks/client/lobby/lobby.m3u" autoplay="1" theme="system"></ct-playlist>
 *
 * Playback always goes through ClevertreeMediaController (media-controller.js,
 * load it first). Nothing here autoplays from construction unless the caller
 * is an SI surface that opts in (see ct-video / ct-playlist notes below).
 *
 * ClevertreeSiMarkdown.render(md) → HTML string (raw HTML escaped; only
 * ct-carousel / ct-video / ct-playlist pass through, with allowlisted attrs).
 *
 * Native note: Android/iOS use the same WebView room JS; there are no native
 * counterparts for these elements yet.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.ClevertreeBuiltins = root.ClevertreeBuiltins || api;
    root.ClevertreeSiMarkdown = root.ClevertreeSiMarkdown || api.SiMarkdown;
  }
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* Shared helpers                                                     */
  /* ------------------------------------------------------------------ */

  var cfg = { siteOrigin: "" };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function MC() {
    return root.ClevertreeMediaController || null;
  }

  /** Resolve a URL against the nearest [data-ct-site-origin], cfg, or page origin. */
  function resolveUrl(u, el) {
    u = String(u || "").trim();
    if (!u) return "";
    var origin = "";
    try {
      var holder = el && el.closest ? el.closest("[data-ct-site-origin]") : null;
      if (holder) origin = holder.getAttribute("data-ct-site-origin") || "";
    } catch (e) {}
    origin = origin || cfg.siteOrigin || "";
    if (!origin && root.location) origin = root.location.origin || "";
    try {
      return new URL(u, origin ? origin.replace(/\/?$/, "/") : undefined).toString();
    } catch (e2) {
      return u;
    }
  }

  function isUnsafeUrl(u) {
    var s = String(u || "").replace(/[\u0000-\u0020\u007f]+/g, "").toLowerCase();
    return /^(javascript|vbscript|data|file):/.test(s);
  }

  /* ------------------------------------------------------------------ */
  /* Markdown                                                           */
  /* ------------------------------------------------------------------ */

  var CT_TAGS = ["ct-carousel", "ct-video", "ct-playlist"];
  var CT_ATTRS = {
    src: 1,
    open: 1,
    mode: 1,
    theme: 1,
    label: 1,
    autoplay: 1,
    "data-autoplay": 1,
    poster: 1,
    title: 1,
    tracks: 1,
    subtitles: 1,
  };
  var CT_OPEN_RE = /<(ct-carousel|ct-video|ct-playlist)\b((?:[^<>"']|"[^"]*"|'[^']*')*?)(\/?)>/gi;
  var CT_CLOSE_RE = /<\/(ct-carousel|ct-video|ct-playlist)\s*>/gi;

  function cleanCtAttrs(raw) {
    var out = "";
    var re = /([a-zA-Z][\w:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    var m;
    while ((m = re.exec(raw))) {
      var name = m[1].toLowerCase();
      if (!CT_ATTRS[name]) continue;
      var val = m[2] != null ? m[2] : m[3] != null ? m[3] : m[4] != null ? m[4] : "";
      if ((name === "src" || name === "poster") && isUnsafeUrl(val)) continue;
      out += " " + name + '="' + esc(val) + '"';
    }
    return out;
  }

  function inline(text, stash) {
    // text is already HTML-escaped. Code spans first so nothing inside is styled.
    text = text.replace(/`([^`]+)`/g, function (_, code) {
      stash.push("<code>" + code + "</code>");
      return "\u0001" + (stash.length - 1) + "\u0001";
    });
    text = text.replace(/!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+&quot;[^)]*?&quot;)?\s*\)/g, function (_, alt, url) {
      var raw = url.replace(/&amp;/g, "&");
      if (isUnsafeUrl(raw)) return alt;
      stash.push('<img src="' + url + '" alt="' + alt + '" loading="lazy">');
      return "\u0001" + (stash.length - 1) + "\u0001";
    });
    text = text.replace(/\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+&quot;[^)]*?&quot;)?\s*\)/g, function (_, label, url) {
      var raw = url.replace(/&amp;/g, "&");
      if (isUnsafeUrl(raw)) return label;
      var ext = /^(https?:)?\/\//i.test(raw);
      stash.push(
        '<a href="' + url + '"' + (ext ? ' target="_blank" rel="noopener noreferrer"' : "") + ">" + inline(label, stash) + "</a>"
      );
      return "\u0001" + (stash.length - 1) + "\u0001";
    });
    text = text.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, function (_, a, b) {
      return "<strong>" + (a || b) + "</strong>";
    });
    text = text.replace(/(^|[^\w*])\*([^*\s][^*]*)\*(?![\w*])/g, "$1<em>$2</em>");
    text = text.replace(/(^|[^\w])_([^_\s][^_]*)_(?!\w)/g, "$1<em>$2</em>");
    text = text.replace(/\u0001(\d+)\u0001/g, function (_, i) {
      return stash[+i];
    });
    return text;
  }

  function renderMarkdown(md) {
    var ctStash = [];
    var src = String(md == null ? "" : md).replace(/\r\n?/g, "\n");

    function ctPlace(html) {
      ctStash.push(html);
      // Own paragraph so the custom element is block-level, never inside <p>.
      return "\n\n\u0000" + (ctStash.length - 1) + "\u0000\n\n";
    }
    // Allowlisted custom elements → placeholders (before escaping everything else).
    src = src.replace(CT_OPEN_RE, function (_, tag, attrs) {
      tag = tag.toLowerCase();
      return ctPlace("<" + tag + cleanCtAttrs(attrs) + ">" + "</" + tag + ">");
    });
    // Explicit close tags after a non-self-closing open: open already emitted a
    // complete element, so drop the stray closer. (Inner text is not supported.)
    src = src.replace(CT_CLOSE_RE, "");

    var lines = src.split("\n");
    var html = [];
    var i = 0;
    var para = [];
    var stash = [];

    function flushPara() {
      if (!para.length) return;
      var text = esc(para.join("\n"));
      para = [];
      var body = inline(text, stash);
      if (/^(\u0000\d+\u0000\s*)+$/.test(body)) html.push(body);
      else html.push("<p>" + body.replace(/\n/g, "<br>") + "</p>");
    }

    while (i < lines.length) {
      var line = lines[i];
      var m;
      if (/^\s*$/.test(line)) {
        flushPara();
        i++;
        continue;
      }
      if ((m = /^(```|~~~)/.exec(line))) {
        flushPara();
        var fence = m[1];
        var buf = [];
        i++;
        while (i < lines.length && lines[i].indexOf(fence) !== 0) {
          buf.push(lines[i]);
          i++;
        }
        i++;
        html.push("<pre><code>" + esc(buf.join("\n")) + "</code></pre>");
        continue;
      }
      if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) {
        flushPara();
        var lvl = m[1].length;
        html.push("<h" + lvl + ">" + inline(esc(m[2]), stash) + "</h" + lvl + ">");
        i++;
        continue;
      }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
        flushPara();
        html.push("<hr>");
        i++;
        continue;
      }
      if (/^\s*>\s?/.test(line)) {
        flushPara();
        var q = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          q.push(lines[i].replace(/^\s*>\s?/, ""));
          i++;
        }
        html.push("<blockquote>" + inline(esc(q.join("\n")), stash).replace(/\n/g, "<br>") + "</blockquote>");
        continue;
      }
      if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
        flushPara();
        var ordered = /^\s*\d+[.)]\s+/.test(line);
        var itemRe = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/;
        var items = [];
        while (i < lines.length && itemRe.test(lines[i])) {
          items.push("<li>" + inline(esc(lines[i].replace(itemRe, "")), stash) + "</li>");
          i++;
        }
        html.push((ordered ? "<ol>" : "<ul>") + items.join("") + (ordered ? "</ol>" : "</ul>"));
        continue;
      }
      para.push(line);
      i++;
    }
    flushPara();

    return html.join("\n").replace(/\u0000(\d+)\u0000/g, function (_, n) {
      return ctStash[+n] || "";
    });
  }

  var SiMarkdown = { render: renderMarkdown, CT_TAGS: CT_TAGS };

  /* ------------------------------------------------------------------ */
  /* Custom elements (browser only)                                     */
  /* ------------------------------------------------------------------ */

  var STYLE_ID = "ct-builtins-style-v9";
  var CSS =
    "ct-carousel,ct-video,ct-playlist{display:block;margin:14px 0}" +
    "ct-carousel .ct-car-row{display:flex;gap:18px;overflow-x:auto;padding:8px 6px 14px;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch}" +
    "ct-carousel .ct-car-card{flex:0 0 120px;scroll-snap-align:start;display:flex;flex-direction:column;gap:8px;padding:0 4px;text-align:left;background:none;border:0;color:inherit;cursor:pointer}" +
    "ct-carousel .ct-car-poster{width:120px;aspect-ratio:2/3;object-fit:cover;border-radius:6px;background:color-mix(in srgb,currentColor 12%,transparent);border:1px solid var(--line,#d9ded6);display:block}" +
    "ct-carousel .ct-car-card:hover .ct-car-poster,ct-carousel .ct-car-card:focus-visible .ct-car-poster{outline:2px solid var(--green,#225744);outline-offset:1px}" +
    '[data-tv="1"] ct-carousel .ct-car-card:focus .ct-car-poster,' +
    '[data-tv="1"] ct-carousel .ct-car-card:focus-visible .ct-car-poster{' +
    "outline:3px solid var(--green,#225744);outline-offset:3px;transform:scale(1.04)}" +
    "ct-carousel .ct-car-title{font-size:12px;font-weight:700;line-height:1.25;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}" +
    "ct-carousel .ct-car-year{font-size:11px;color:var(--muted,#52645c)}" +
    "ct-carousel .ct-car-status{font-size:12px;color:var(--muted,#52645c)}" +
    /* mode=grid: wrap all posters; SI pane scrolls vertically */
    "ct-carousel[mode=\"grid\"]{margin:10px 0 0}" +
    "ct-carousel[mode=\"grid\"] .ct-car-row{" +
      "display:grid;" +
      "grid-template-columns:repeat(auto-fill,minmax(112px,1fr));" +
      "gap:14px 12px;" +
      "overflow:visible;" +
      "scroll-snap-type:none;" +
      "padding:4px 2px 18px;" +
      "-webkit-overflow-scrolling:auto" +
    "}" +
    "ct-carousel[mode=\"grid\"] .ct-car-card{" +
      "flex:none;width:100%;min-width:0;max-width:none;" +
      "scroll-snap-align:none;padding:0" +
    "}" +
    "ct-carousel[mode=\"grid\"] .ct-car-poster{width:100%}" +
    /* ct-video toolbar (separate chips). Beat .room button reset. */
    ".room ct-video .ct-toolbar,ct-video .ct-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 8px;padding:2px 0}" +
    ".room ct-video button.ct-btn,ct-video button.ct-btn{" +
      "display:inline-flex;align-items:center;justify-content:center;gap:6px;" +
      "min-height:40px;padding:8px 14px;margin:0 10px 6px 0;" +
      "border-radius:7px;border:1px solid var(--green,#225744)!important;" +
      "background:var(--green,#225744)!important;color:var(--white,#fffefa)!important;" +
      "font-weight:700;font-size:13px;line-height:1.2;cursor:pointer;box-sizing:border-box" +
    "}" +
    ".room ct-video button.ct-btn.secondary,ct-video button.ct-btn.secondary{" +
      "background:transparent!important;color:var(--green,#225744)!important" +
    "}" +
    ".room ct-video button.ct-btn[hidden],ct-video button.ct-btn[hidden]{display:none!important}" +
    "ct-video .ct-label{margin:0 10px 6px 0;font-size:13px;font-weight:600}" +
    "ct-video .ct-player:not(:empty){margin-top:10px}" +
    "ct-video .ct-hint,ct-playlist .ct-hint{" +
      "display:block;margin-top:8px;font-size:12px;" +
      "color:var(--ct-pl-muted,var(--muted,var(--ct-muted,#52665a)))" +
    "}" +
    /* ct-playlist theme tokens: inherit room, or theme=light|dark|system */
    "ct-playlist{" +
      "color-scheme:light;" +
      "--ct-pl-bg:var(--white,var(--ct-canvas,#ffffff));" +
      "--ct-pl-ink:var(--ink,var(--ct-ink,#23352b));" +
      "--ct-pl-muted:var(--muted,var(--ct-muted,#52665a));" +
      "--ct-pl-line:var(--line,var(--ct-line,#c5d0c5));" +
      "--ct-pl-accent:var(--action,var(--green,var(--ct-brand,#285c46)));" +
      "--ct-pl-accent-ink:var(--action-ink,var(--ct-action-ink,#ffffff));" +
      "--ct-pl-hover:color-mix(in srgb,var(--ct-pl-accent) 14%,transparent)" +
    "}" +
    "ct-playlist[theme=\"light\"]{" +
      "color-scheme:light;" +
      "--ct-pl-bg:#ffffff;" +
      "--ct-pl-ink:#23352b;" +
      "--ct-pl-muted:#52665a;" +
      "--ct-pl-line:#c5d0c5;" +
      "--ct-pl-accent:#285c46;" +
      "--ct-pl-accent-ink:#ffffff;" +
      "--ct-pl-hover:color-mix(in srgb,#285c46 12%,transparent)" +
    "}" +
    "ct-playlist[theme=\"dark\"]{" +
      "color-scheme:dark;" +
      "--ct-pl-bg:#1a2520;" +
      "--ct-pl-ink:#e6eee6;" +
      "--ct-pl-muted:#b0c1b5;" +
      "--ct-pl-line:#3d5144;" +
      "--ct-pl-accent:#a8d4b4;" +
      "--ct-pl-accent-ink:#14291d;" +
      "--ct-pl-hover:color-mix(in srgb,#a8d4b4 16%,transparent)" +
    "}" +
    "@media (prefers-color-scheme:dark){" +
      "ct-playlist[theme=\"system\"]," +
      "ct-playlist:not([theme]){" +
        "color-scheme:dark;" +
        "--ct-pl-bg:#1a2520;" +
        "--ct-pl-ink:#e6eee6;" +
        "--ct-pl-muted:#b0c1b5;" +
        "--ct-pl-line:#3d5144;" +
        "--ct-pl-accent:#a8d4b4;" +
        "--ct-pl-accent-ink:#14291d;" +
        "--ct-pl-hover:color-mix(in srgb,#a8d4b4 16%,transparent)" +
      "}" +
      /* Room already resolved light — keep playlist with the room, not OS */
      ".room[data-theme=\"light\"] ct-playlist:not([theme])," +
      ".ct-room[data-theme=\"light\"] ct-playlist:not([theme])," +
      ".ct-room-host[data-theme=\"light\"] ct-playlist:not([theme]){" +
        "color-scheme:light;" +
        "--ct-pl-bg:var(--white,var(--ct-canvas,#ffffff));" +
        "--ct-pl-ink:var(--ink,var(--ct-ink,#23352b));" +
        "--ct-pl-muted:var(--muted,var(--ct-muted,#52665a));" +
        "--ct-pl-line:var(--line,var(--ct-line,#c5d0c5));" +
        "--ct-pl-accent:var(--action,var(--green,var(--ct-brand,#285c46)));" +
        "--ct-pl-accent-ink:var(--action-ink,var(--ct-action-ink,#ffffff));" +
        "--ct-pl-hover:color-mix(in srgb,var(--ct-pl-accent) 14%,transparent)" +
      "}" +
    "}" +
    "@media (prefers-color-scheme:light){" +
      "ct-playlist[theme=\"system\"]{" +
        "color-scheme:light;" +
        "--ct-pl-bg:#ffffff;" +
        "--ct-pl-ink:#23352b;" +
        "--ct-pl-muted:#52665a;" +
        "--ct-pl-line:#c5d0c5;" +
        "--ct-pl-accent:#285c46;" +
        "--ct-pl-accent-ink:#ffffff;" +
        "--ct-pl-hover:color-mix(in srgb,#285c46 12%,transparent)" +
      "}" +
    "}" +
    /* Room dark (explicit or system-resolved) — inherit even if OS is light */
    ".room[data-theme=\"dark\"] ct-playlist:not([theme])," +
    ".ct-room[data-theme=\"dark\"] ct-playlist:not([theme])," +
    ".ct-room-host[data-theme=\"dark\"] ct-playlist:not([theme]){" +
      "color-scheme:dark;" +
      "--ct-pl-bg:var(--white,var(--ct-canvas,#1a2520));" +
      "--ct-pl-ink:var(--ink,var(--ct-ink,#e6eee6));" +
      "--ct-pl-muted:var(--muted,var(--ct-muted,#b0c1b5));" +
      "--ct-pl-line:var(--line,var(--ct-line,#3d5144));" +
      "--ct-pl-accent:var(--action,var(--green,var(--ct-brand,#a8d4b4)));" +
      "--ct-pl-accent-ink:var(--action-ink,var(--ct-action-ink,#14291d));" +
      "--ct-pl-hover:color-mix(in srgb,var(--ct-pl-accent) 16%,transparent)" +
    "}" +
    /* ct-playlist: one Material-style bar — flush transport | now playing */
    ".room ct-playlist .ct-player-bar,ct-playlist .ct-player-bar{" +
      "display:flex;align-items:stretch;width:100%;max-width:100%;" +
      "margin:0;padding:0;overflow:hidden;" +
      "border:1px solid var(--ct-pl-line);" +
      "border-radius:12px;" +
      "background:var(--ct-pl-bg);" +
      "color:var(--ct-pl-ink);" +
      "box-sizing:border-box;" +
      "box-shadow:0 1px 0 color-mix(in srgb,var(--ct-pl-ink) 6%,transparent)" +
    "}" +
    ".room ct-playlist .ct-transport,ct-playlist .ct-transport{" +
      "display:flex;flex:0 0 auto;align-items:stretch;gap:0;margin:0;padding:0" +
    "}" +
    ".room ct-playlist .ct-player-bar button.ct-btn.ct-icon," +
    "ct-playlist .ct-player-bar button.ct-btn.ct-icon{" +
      "display:inline-flex;align-items:center;justify-content:center;" +
      "flex:0 0 auto;min-width:48px;width:48px;min-height:48px;height:48px;" +
      "margin:0!important;padding:0!important;gap:0;" +
      "border:0!important;border-radius:0!important;" +
      "background:transparent!important;" +
      "color:var(--ct-pl-ink)!important;" +
      "font-size:20px;line-height:1;font-weight:600;" +
      "cursor:pointer;box-sizing:border-box;box-shadow:none;" +
      "filter:none;opacity:1" +
    "}" +
    ".room ct-playlist .ct-player-bar button.ct-btn.ct-icon:hover," +
    ".room ct-playlist .ct-player-bar button.ct-btn.ct-icon:focus-visible," +
    "ct-playlist .ct-player-bar button.ct-btn.ct-icon:hover," +
    "ct-playlist .ct-player-bar button.ct-btn.ct-icon:focus-visible{" +
      "background:var(--ct-pl-hover)!important;" +
      "outline:none" +
    "}" +
    ".room ct-playlist .ct-player-bar button.ct-btn.ct-icon[data-ct=\"play\"]," +
    "ct-playlist .ct-player-bar button.ct-btn.ct-icon[data-ct=\"play\"]{" +
      "background:var(--ct-pl-accent)!important;" +
      "color:var(--ct-pl-accent-ink)!important" +
    "}" +
    ".room ct-playlist .ct-player-bar button.ct-btn.ct-icon[data-ct=\"play\"]:hover," +
    ".room ct-playlist .ct-player-bar button.ct-btn.ct-icon[data-ct=\"play\"]:focus-visible," +
    "ct-playlist .ct-player-bar button.ct-btn.ct-icon[data-ct=\"play\"]:hover," +
    "ct-playlist .ct-player-bar button.ct-btn.ct-icon[data-ct=\"play\"]:focus-visible{" +
      "filter:brightness(1.06)" +
    "}" +
    /* Volume slider replaces the old quieter/louder icon pair (~96px → ~120px). */
    ".room ct-playlist .ct-vol,ct-playlist .ct-vol{" +
      "display:flex;align-items:center;justify-content:center;" +
      "flex:0 0 auto;width:120px;min-width:120px;max-width:120px;" +
      "min-height:48px;height:48px;padding:0 10px;box-sizing:border-box;" +
      "border:0;background:transparent" +
    "}" +
    ".room ct-playlist .ct-vol:hover,ct-playlist .ct-vol:hover," +
    ".room ct-playlist .ct-vol:focus-within,ct-playlist .ct-vol:focus-within{" +
      "background:var(--ct-pl-hover)" +
    "}" +
    ".room ct-playlist .ct-vol-range,ct-playlist .ct-vol-range{" +
      "display:block;width:100%;height:28px;margin:0;padding:0;" +
      "cursor:pointer;accent-color:var(--ct-pl-accent);" +
      "background:transparent;color:var(--ct-pl-ink)" +
    "}" +
    ".room ct-playlist .ct-vol-range:focus-visible,ct-playlist .ct-vol-range:focus-visible{" +
      "outline:2px solid var(--ct-pl-accent);outline-offset:3px;border-radius:4px" +
    "}" +
    ".room ct-playlist .ct-sep,ct-playlist .ct-sep{" +
      "flex:0 0 1px;width:1px;align-self:stretch;" +
      "margin:10px 0;padding:0;" +
      "background:var(--ct-pl-line);border:0" +
    "}" +
    ".room ct-playlist .ct-now,ct-playlist .ct-now{" +
      "flex:1 1 auto;min-width:0;display:flex;flex-direction:column;" +
      "justify-content:center;gap:2px;padding:8px 14px;box-sizing:border-box;" +
      "color:var(--ct-pl-ink)" +
    "}" +
    ".room ct-playlist .ct-now-title,ct-playlist .ct-now-title{" +
      "display:block;margin:0;font-size:14px;font-weight:700;line-height:1.3;" +
      "color:var(--ct-pl-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" +
    "}" +
    ".room ct-playlist .ct-now-title.is-idle,ct-playlist .ct-now-title.is-idle," +
    ".room ct-playlist .ct-now-title.is-status,ct-playlist .ct-now-title.is-status{" +
      "color:var(--ct-pl-muted);font-weight:500" +
    "}" +
    ".room ct-playlist .ct-now-title.is-error,ct-playlist .ct-now-title.is-error{" +
      "color:var(--ct-warning-ink,#79501d);font-weight:700" +
    "}" +
    ".room ct-playlist .ct-now-title.is-loading,ct-playlist .ct-now-title.is-loading{" +
      "color:var(--ct-pl-muted);font-weight:500;font-style:italic" +
    "}";

  function ensureStyle() {
    if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
    var st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  function fetchJson(url) {
    return fetch(url, { credentials: "omit", cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function fetchText(url) {
    return fetch(url, { credentials: "omit", cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    });
  }

  function shuffleInPlace(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  /**
   * Parse extended M3U. Header `#EXT-RANDOM` shuffles when the frame is entered.
   * Nested playlists: `type="playlist"` on #EXTINF and/or URL ending in .m3u/.m3u8.
   */
  function parseM3u(text) {
    var lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/);
    var random = false;
    var entries = [];
    var pendingTitle = "";
    var pendingPlaylist = false;
    var headerDone = false;
    for (var i = 0; i < lines.length; i++) {
      var line = String(lines[i] || "").trim();
      if (!line) continue;
      if (line.charAt(0) === "#") {
        var upper = line.toUpperCase();
        if (upper === "#EXTM3U") {
          headerDone = true;
          continue;
        }
        if (upper === "#EXT-RANDOM" || upper.indexOf("#EXT-RANDOM:") === 0) {
          random = true;
          continue;
        }
        if (upper.indexOf("#EXTINF:") === 0) {
          headerDone = true;
          var meta = line.slice(8);
          var comma = meta.indexOf(",");
          var attrs = comma >= 0 ? meta.slice(0, comma) : meta;
          pendingTitle = comma >= 0 ? meta.slice(comma + 1).trim() : "";
          pendingPlaylist =
            /\btype\s*=\s*["']?playlist["']?/i.test(attrs) ||
            /\bcontent-type\s*=\s*["']?playlist["']?/i.test(attrs);
          continue;
        }
        continue;
      }
      headerDone = true;
      var url = line;
      var kind =
        pendingPlaylist || /\.m3u8?(\?|#|$)/i.test(url) ? "playlist" : "track";
      entries.push({
        url: url,
        title: pendingTitle || url.split("/").pop() || url,
        kind: kind,
      });
      pendingTitle = "";
      pendingPlaylist = false;
    }
    return { random: random, entries: entries, headerDone: headerDone };
  }

  function defineElements() {
    if (typeof HTMLElement === "undefined" || !root.customElements) return;
    ensureStyle();

    /* ---------- ct-carousel ---------- */
    if (!customElements.get("ct-carousel")) {
      class CtCarousel extends HTMLElement {
        static get observedAttributes() {
          return ["src", "mode"];
        }
        connectedCallback() {
          if (!this._loaded) this._load();
        }
        attributeChangedCallback(name, oldV, newV) {
          if (oldV === newV) return;
          if (name === "src" && this.isConnected) this._load();
        }
        _load() {
          var self = this;
          var raw = this.getAttribute("src");
          if (!raw) return;
          var url = resolveUrl(raw, this);
          this._loaded = true;
          this.innerHTML = '<span class="ct-car-status">Loading…</span>';
          fetchJson(url).then(
            function (data) {
              if (self.getAttribute("src") !== raw) return;
              self._render(data, url);
            },
            function () {
              self.innerHTML = '<span class="ct-car-status">Couldn\'t load the list.</span>';
              self._loaded = false;
            }
          );
        }
        _render(data, base) {
          var self = this;
          var items = (data && data.items) || [];
          this.textContent = "";
          if (!items.length) {
            this.innerHTML = '<span class="ct-car-status">Nothing here yet.</span>';
            return;
          }
          var row = document.createElement("div");
          row.className = "ct-car-row";
          row.setAttribute("role", "list");
          items.forEach(function (it) {
            if (!it) return;
            var abs = function (v) {
              if (!v) return "";
              try {
                return new URL(String(v), base).toString();
              } catch (e) {
                return String(v);
              }
            };
            var slug = String(it.slug || "").trim();
            if (!slug && it.readme) {
              var rm = String(it.readme).replace(/\\/g, "/");
              var mSlug = rm.match(/\/FanMixes\/([^\/]+)\//i);
              if (mSlug) slug = mSlug[1];
            }
            var detail = {
              title: String(it.title || ""),
              year: it.year == null ? "" : it.year,
              readme: abs(it.readme),
              poster: abs(it.poster),
              slug: slug,
              topic: slug,
              open: self.getAttribute("open") || "",
            };
            var card = document.createElement("button");
            card.type = "button";
            card.className = "ct-car-card";
            card.setAttribute("role", "listitem");
            card.title = detail.title;
            var poster = detail.poster && !isUnsafeUrl(detail.poster)
              ? '<img class="ct-car-poster" loading="lazy" alt="" src="' + esc(detail.poster) + '">'
              : '<span class="ct-car-poster"></span>';
            card.innerHTML =
              poster +
              '<span class="ct-car-title">' + esc(detail.title) + "</span>" +
              (detail.year !== "" ? '<span class="ct-car-year">' + esc(detail.year) + "</span>" : "");
            card.addEventListener("click", function () {
              self.dispatchEvent(
                new CustomEvent("ct-carousel-open", {
                  bubbles: true,
                  composed: true,
                  detail: detail,
                })
              );
            });
            card.addEventListener("keydown", function (ev) {
              if (
                ev.key !== "ArrowLeft" &&
                ev.key !== "ArrowRight" &&
                ev.key !== "ArrowUp" &&
                ev.key !== "ArrowDown"
              ) {
                return;
              }
              var cards = Array.prototype.slice.call(
                row.querySelectorAll(".ct-car-card")
              );
              var idx = cards.indexOf(card);
              if (idx < 0) return;
              var next = -1;
              var pick =
                typeof window !== "undefined" &&
                window.CleverTreeRoom &&
                typeof window.CleverTreeRoom.pickSpatialFocusTarget === "function"
                  ? window.CleverTreeRoom.pickSpatialFocusTarget
                  : null;
              if (
                pick &&
                (ev.key === "ArrowUp" ||
                  ev.key === "ArrowDown" ||
                  self.getAttribute("mode") === "grid")
              ) {
                var rects = cards.map(function (c) {
                  var r = c.getBoundingClientRect();
                  return {
                    left: r.left,
                    top: r.top,
                    width: r.width,
                    height: r.height,
                  };
                });
                var dx =
                  ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
                var dy =
                  ev.key === "ArrowDown" ? 1 : ev.key === "ArrowUp" ? -1 : 0;
                next = pick(rects, idx, dx, dy);
                if (
                  next < 0 &&
                  dx !== 0 &&
                  window.CleverTreeRoom.pickHorizontalWrapTarget
                ) {
                  next = window.CleverTreeRoom.pickHorizontalWrapTarget(
                    rects,
                    idx,
                    dx
                  );
                }
              } else if (ev.key === "ArrowRight") {
                next = Math.min(cards.length - 1, idx + 1);
              } else if (ev.key === "ArrowLeft") {
                next = Math.max(0, idx - 1);
              }
              if (next < 0 || next === idx) return;
              ev.preventDefault();
              ev.stopPropagation();
              try {
                cards[next].focus();
                cards[next].scrollIntoView({
                  block: "nearest",
                  inline: "nearest",
                });
              } catch (eNav) {}
            });
            row.appendChild(card);
          });
          this.appendChild(row);
        }
      }
      customElements.define("ct-carousel", CtCarousel);
    }

    /* ---------- ct-video ---------- */
    if (!customElements.get("ct-video")) {
      class CtVideo extends HTMLElement {
        connectedCallback() {
          if (this._built) return;
          this._built = true;
          var self = this;
          var label = this.getAttribute("label") || "";
          this.innerHTML =
            '<div class="ct-toolbar">' +
            '<button type="button" class="ct-btn" data-ct="play"></button>' +
            '<button type="button" class="ct-btn secondary" data-ct="fs" hidden aria-label="Fullscreen">⛶</button>' +
            (label ? '<span class="ct-label">' + esc(label) + "</span>" : "") +
            "</div>" +
            '<span class="ct-hint" data-ct="hint" hidden>Your browser blocked autoplay — tap Play.</span>' +
            '<div class="ct-player" data-ct="player"></div>';
          this._btn = this.querySelector('[data-ct="play"]');
          this._fs = this.querySelector('[data-ct="fs"]');
          this._hint = this.querySelector('[data-ct="hint"]');
          this._slot = this.querySelector('[data-ct="player"]');
          this._btn.addEventListener("click", function () {
            self._onPlayClick();
          });
          this._fs.addEventListener("click", function () {
            var mc = MC();
            if (mc) mc.fullscreen();
          });
          var mc = MC();
          this._unsub = mc ? mc.subscribe(function () { self._sync(); }) : null;
          this._sync();
          // Default: never autoplay. Only an SI surface that opts in via
          // [data-si-autoplay-ok] ancestor + data-autoplay on the element may.
          if (
            this.hasAttribute("data-autoplay") &&
            this.closest &&
            this.closest("[data-si-autoplay-ok]")
          ) {
            this._start();
          }
        }
        disconnectedCallback() {
          if (this._unsub) this._unsub();
          this._unsub = null;
          this._built = false;
          var mc = MC();
          if (mc && mc.isActiveFor(this)) mc.stop();
        }
        _mine() {
          var mc = MC();
          return mc && mc.isActiveFor(this) ? mc.getState() : null;
        }
        _sync() {
          if (!this._btn) return;
          var st = this._mine();
          var label = "▶ Play";
          if (st && st.playing) label = "⏸ Pause";
          else if (st && st.needsPlay) label = "▶ Tap to play";
          else if (st) label = "▶ Resume";
          this._btn.textContent = label;
          this._hint.hidden = !(st && st.needsPlay);
          this._fs.hidden = !(st && st.kind === "video");
        }
        _parseTracks() {
          var raw =
            this.getAttribute("tracks") || this.getAttribute("subtitles") || "";
          if (!raw) return null;
          try {
            var parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              return parsed
                .map(function (t) {
                  if (!t) return null;
                  var src = resolveUrl(t.src || t.url || "", this);
                  if (!src) return null;
                  return {
                    src: src,
                    label: t.label || "Subtitles",
                    lang: t.lang || t.srclang || "en",
                    default: !!(t.default || t.isDefault),
                  };
                }, this)
                .filter(Boolean);
            }
          } catch (e) {}
          /* Comma-separated VTT URLs fallback. */
          return String(raw)
            .split(",")
            .map(function (s) {
              var src = resolveUrl(s.trim(), this);
              return src ? { src: src, label: "Subtitles", lang: "en" } : null;
            }, this)
            .filter(Boolean);
        }
        _start() {
          var mc = MC();
          if (!mc) return;
          var url = resolveUrl(this.getAttribute("src"), this);
          if (!url) return;
          var self = this;
          var tracks = this._parseTracks();
          mc.play(url, {
            kind: "video",
            owner: this,
            container: this._slot,
            poster: this.getAttribute("poster") || undefined,
            tracks: tracks || undefined,
          }).then(function () {
            self._sync();
          });
        }
        _onPlayClick() {
          var mc = MC();
          if (!mc) return;
          var st = this._mine();
          if (!st) return this._start();
          if (st.playing) mc.pause();
          else mc.resume().then(this._sync.bind(this));
        }
      }
      customElements.define("ct-video", CtVideo);
    }

    /* ---------- ct-playlist (M3U + nested stack) ---------- */
    if (!customElements.get("ct-playlist")) {
      class CtPlaylist extends HTMLElement {
        connectedCallback() {
          if (this._built) return;
          this._built = true;
          var self = this;
          this.innerHTML =
            '<div class="ct-player-bar" role="group" aria-label="Playlist playback">' +
            '<div class="ct-transport">' +
            '<button type="button" class="ct-btn ct-icon" data-ct="prev" aria-label="Previous" title="Previous">⏮</button>' +
            '<button type="button" class="ct-btn ct-icon" data-ct="play" aria-label="Play" title="Play">▶</button>' +
            '<button type="button" class="ct-btn ct-icon" data-ct="next" aria-label="Next" title="Next">⏭</button>' +
            '<div class="ct-vol" data-ct="vol-wrap">' +
            '<input type="range" class="ct-vol-range" data-ct="vol"' +
            ' min="0" max="100" step="1" value="25"' +
            ' aria-label="Volume"' +
            ' aria-valuemin="0" aria-valuemax="100" aria-valuenow="25"' +
            ' aria-valuetext="25 percent"' +
            ' title="Volume — drag or scroll to adjust">' +
            "</div>" +
            "</div>" +
            '<div class="ct-sep" aria-hidden="true"></div>' +
            '<div class="ct-now">' +
            '<span class="ct-now-title is-idle" data-ct="now">Nothing playing</span>' +
            "</div>" +
            "</div>" +
            '<span class="ct-hint" data-ct="hint" hidden>Autoplay blocked — tap ▶</span>';
          this._btn = this.querySelector('[data-ct="play"]');
          this._now = this.querySelector('[data-ct="now"]');
          this._hint = this.querySelector('[data-ct="hint"]');
          this._vol = this.querySelector('[data-ct="vol"]');
          this._volWrap = this.querySelector('[data-ct="vol-wrap"]');
          this.querySelector('[data-ct="prev"]').addEventListener("click", function () {
            self._prev();
          });
          this._btn.addEventListener("click", function () {
            self._onPlayPause();
          });
          this.querySelector('[data-ct="next"]').addEventListener("click", function () {
            self._next();
          });
          this._stack = [];
          this._lastTitle = "";
          this._busy = false;
          this._busyLabel = "";
          this._localError = "";
          this._volume = 0.25;
          this._fadeInMs = 1200;
          this._fadeOutMs = 800;
          this._wireVolume();
          var mc = MC();
          this._unsub = mc ? mc.subscribe(function () { self._sync(); }) : null;
          this._sync();
          this._prefetchRoot();
          var ap = this.getAttribute("autoplay");
          if (ap && ap !== "0" && ap !== "false") {
            this._prefetchRoot().then(function () {
              var m = MC();
              if (m && m.getState().active && !m.isActiveFor(self)) return;
              if (self.isConnected) self._startPlayback();
            });
          }
        }
        disconnectedCallback() {
          if (this._unsub) this._unsub();
          this._unsub = null;
          this._built = false;
          this._stack = [];
          this._busy = false;
          this._localError = "";
          var mc = MC();
          if (mc && mc.isActiveFor(this)) mc.stop();
        }
        _setBusy(on, label) {
          this._busy = !!on;
          this._busyLabel = on ? String(label || "Loading…") : "";
          if (on) this._localError = "";
          this._sync();
        }
        _setLocalError(msg) {
          this._busy = false;
          this._busyLabel = "";
          this._localError = String(msg || "").trim();
          this._sync();
        }
        _friendlyError(code, detail) {
          var c = String(code || "").toLowerCase();
          if (c === "media-error") return "Couldn't play this track";
          if (c === "play-failed") return "Playback failed";
          if (c === "no-url") return "Missing track URL";
          if (c === "no-active") return "Nothing to resume";
          if (c === "no-dom") return "Player unavailable";
          if (c.indexOf("http") === 0 || /^http\s+\d+/.test(c)) {
            return "Couldn't load playlist";
          }
          var d = String(detail || "").trim();
          if (d) return d.length > 72 ? d.slice(0, 69) + "…" : d;
          if (code) return String(code);
          return "Playback error";
        }
        _prefetchRoot() {
          var self = this;
          if (this._pre) return this._pre;
          var url = resolveUrl(this.getAttribute("src"), this);
          this._rootUrl = url;
          if (!url) {
            this._rootFrame = null;
            this._setLocalError("No playlist URL");
            this._pre = Promise.resolve();
            return this._pre;
          }
          this._setBusy(true, "Loading playlist…");
          this._pre = this._loadFrame(url).then(
            function (frame) {
              self._rootFrame = frame;
              self._busy = false;
              self._busyLabel = "";
              if (!frame || !frame.entries || !frame.entries.length) {
                self._localError = "Playlist empty";
              } else {
                self._localError = "";
              }
              self._sync();
            },
            function (err) {
              self._rootFrame = null;
              self._setLocalError(
                self._friendlyError(
                  err && err.message,
                  "Couldn't load playlist"
                )
              );
            }
          );
          return this._pre;
        }
        _loadFrame(url) {
          var self = this;
          var abs = resolveUrl(url, this);
          return fetchText(abs).then(function (text) {
            var parsed = parseM3u(text);
            var entries = (parsed.entries || []).map(function (e) {
              return {
                url: resolveUrl(e.url, self),
                title: e.title,
                kind: e.kind,
              };
            });
            if (parsed.random) shuffleInPlace(entries);
            return { url: abs, entries: entries, idx: 0 };
          });
        }
        _mine() {
          var mc = MC();
          return mc && mc.isActiveFor(this) ? mc.getState() : null;
        }
        _titleFromUrl(url) {
          try {
            var path = String(url || "").split("?")[0].split("#")[0];
            var base = path.split("/").pop() || "";
            base = decodeURIComponent(base).replace(/\+/g, " ");
            return base.replace(/\.[a-z0-9]{2,5}$/i, "") || "";
          } catch (e) {
            return "";
          }
        }
        _trackTitle() {
          var frame = this._frame();
          if (frame && frame.entries && frame.entries[frame.idx]) {
            var entry = frame.entries[frame.idx];
            if (entry && entry.kind !== "playlist") {
              var title =
                (entry.title && String(entry.title).trim()) ||
                this._titleFromUrl(entry.url);
              if (title) {
                this._lastTitle = title;
                return title;
              }
            }
          }
          return this._lastTitle || "";
        }
        _sync() {
          if (!this._btn) return;
          var st = this._mine();
          var mc = MC();
          var global = mc ? mc.getState() : null;
          var icon = "▶";
          var label = "Play";
          if (st && st.playing) {
            icon = "⏸";
            label = "Pause";
          } else if (st && st.needsPlay) {
            icon = "▶";
            label = "Play";
          } else if (st) {
            icon = "▶";
            label = "Resume";
          } else if (global && global.suspended) {
            icon = "⏸";
            label = "Paused";
          }
          this._btn.textContent = icon;
          this._btn.setAttribute("aria-label", label);
          this._btn.setAttribute("title", label);
          this._hint.hidden = !(st && st.needsPlay);
          if (this._now) this._paintNow(st, global);
        }
        _paintNow(st, global) {
          var text = "Nothing playing";
          var tone = "idle"; /* idle | status | loading | error | playing */
          if (this._busy) {
            text = this._busyLabel || "Loading…";
            tone = "loading";
          } else if (this._localError) {
            text = this._localError;
            tone = "error";
          } else if (st && st.error) {
            text = this._friendlyError(st.error);
            tone = "error";
          } else if (st && st.needsPlay) {
            text = "Tap ▶ to play";
            tone = "status";
          } else if (st && st.playing) {
            text = this._trackTitle() || "Playing…";
            tone = "playing";
          } else if (st && !st.playing) {
            text = "Paused";
            tone = "status";
          } else if (global && global.suspended) {
            text = "Paused for video";
            tone = "status";
          } else if (!this._rootUrl) {
            text = "No playlist URL";
            tone = "error";
          } else if (this._rootFrame && !this._rootFrame.entries.length) {
            text = "Playlist empty";
            tone = "error";
          }
          this._now.textContent = text;
          this._now.setAttribute("title", text);
          this._now.classList.toggle("is-idle", tone === "idle");
          this._now.classList.toggle("is-status", tone === "status");
          this._now.classList.toggle("is-loading", tone === "loading");
          this._now.classList.toggle("is-error", tone === "error");
        }
        _frame() {
          return this._stack.length
            ? this._stack[this._stack.length - 1]
            : null;
        }
        _onStack() {
          var urls = {};
          for (var i = 0; i < this._stack.length; i++) {
            urls[this._stack[i].url] = 1;
          }
          return urls;
        }
        _wireVolume() {
          var self = this;
          var vol = this._vol;
          var wrap = this._volWrap || vol;
          if (!vol) return;
          function onInput() {
            self._setVolume(Number(vol.value) / 100);
          }
          vol.addEventListener("input", onInput);
          vol.addEventListener("change", onInput);
          /* Wheel over the slider (or its hit area) nudges volume. */
          wrap.addEventListener(
            "wheel",
            function (ev) {
              if (ev.ctrlKey || ev.metaKey) return;
              ev.preventDefault();
              var raw =
                Math.abs(ev.deltaY) >= Math.abs(ev.deltaX)
                  ? ev.deltaY
                  : ev.deltaX;
              if (!raw) return;
              /* Line/page deltas → coarse steps; pixel deltas → finer. */
              var step =
                ev.deltaMode === 1
                  ? 0.05
                  : ev.deltaMode === 2
                    ? 0.15
                    : 0.04;
              self._nudgeVolume(raw > 0 ? -step : step);
            },
            { passive: false }
          );
          this._paintVolume();
        }
        _paintVolume() {
          var vol = this._vol;
          if (!vol) return;
          var pct = Math.round(Math.max(0, Math.min(1, this._volume || 0)) * 100);
          if (String(vol.value) !== String(pct)) vol.value = String(pct);
          vol.setAttribute("aria-valuenow", String(pct));
          vol.setAttribute("aria-valuetext", pct + " percent");
          vol.setAttribute("title", "Volume " + pct + "% — drag or scroll to adjust");
        }
        _setVolume(level) {
          var next = Math.max(0, Math.min(1, Number(level)));
          if (!(next >= 0)) next = 0;
          this._volume = Math.round(next * 100) / 100;
          this._paintVolume();
          var mc = MC();
          if (mc && typeof mc.setVolume === "function" && this._mine()) {
            mc.setVolume(this._volume);
          }
        }
        _nudgeVolume(delta) {
          this._setVolume((this._volume || 0.25) + Number(delta || 0));
        }
        _advance() {
          var frame = this._frame();
          if (!frame) return Promise.resolve();
          this._localError = "";
          frame.idx++;
          this._setBusy(true, "Loading next…");
          return this._playNext();
        }
        _next() {
          var mc = MC();
          if (!mc) return;
          if (!this._mine() && !this._stack.length) {
            this._startPlayback();
            return;
          }
          this._advance();
        }
        _prev() {
          var self = this;
          var mc = MC();
          if (!mc) return;
          if (!this._mine() && !this._stack.length) {
            this._startPlayback();
            return;
          }
          var el = typeof mc.getElement === "function" ? mc.getElement() : null;
          if (el && typeof el.currentTime === "number" && el.currentTime > 2.5) {
            try {
              el.currentTime = 0;
            } catch (e) {}
            return;
          }
          var frame = this._frame();
          if (!frame) return;
          if (frame.idx > 0) {
            frame.idx--;
            this._playNext();
            return;
          }
          if (this._stack.length > 1) {
            this._stack.pop();
            frame = this._frame();
            if (!frame) return;
            if (frame.idx > 0) frame.idx--;
            this._playNext();
            return;
          }
          /* Root start: restart current track. */
          this._playNext();
        }
        _playNext() {
          var self = this;
          var mc = MC();
          if (!mc) {
            this._setLocalError("Player unavailable");
            return Promise.resolve();
          }
          var frame = this._frame();
          while (frame && frame.idx >= frame.entries.length) {
            this._stack.pop();
            frame = this._frame();
            if (frame) frame.idx++;
          }
          if (!frame) {
            this._busy = false;
            this._busyLabel = "";
            if (!this._localError) this._localError = "End of playlist";
            this._sync();
            return Promise.resolve();
          }
          var entry = frame.entries[frame.idx];
          if (!entry || !entry.url) {
            frame.idx++;
            return this._playNext();
          }
          if (entry.kind === "playlist") {
            if (this._onStack()[entry.url]) {
              frame.idx++;
              return this._playNext();
            }
            this._setBusy(true, "Loading album…");
            return this._loadFrame(entry.url).then(
              function (child) {
                if (!child.entries.length) {
                  frame.idx++;
                  return self._playNext();
                }
                self._stack.push(child);
                return self._playNext();
              },
              function () {
                /* Skip broken nested playlist; surface only if nothing else plays. */
                frame.idx++;
                return self._playNext();
              }
            );
          }
          var pendingTitle =
            (entry.title && String(entry.title).trim()) ||
            this._titleFromUrl(entry.url) ||
            "track";
          this._setBusy(true, "Loading " + pendingTitle + "…");
          return mc
            .play(entry.url, {
              kind: "audio",
              role: "lobby",
              owner: this,
              volume: self._volume,
              fadeInMs: self._fadeInMs,
              fadeOutMs: self._fadeOutMs,
              onended: function () {
                self._advance();
              },
            })
            .then(function (res) {
              self._busy = false;
              self._busyLabel = "";
              if (res && res.ok) {
                self._localError = "";
                self._lastTitle = pendingTitle;
              } else if (res && res.needsPlay) {
                self._localError = "";
                self._lastTitle = pendingTitle;
              } else if (res && res.superseded) {
                /* Another owner took over — leave their status alone. */
              } else {
                self._localError = self._friendlyError(
                  res && res.error,
                  "Couldn't play " + pendingTitle
                );
              }
              self._sync();
              return res;
            })
            .catch(function (err) {
              self._setLocalError(
                self._friendlyError(
                  err && err.message,
                  "Couldn't play " + pendingTitle
                )
              );
            });
        }
        _startPlayback() {
          var self = this;
          this._wantLobby = true;
          this._localError = "";
          this._setBusy(true, "Starting…");
          return this._prefetchRoot().then(function () {
            if (!self._rootFrame || !self._rootFrame.entries.length) {
              self._setLocalError(
                self._localError || "Playlist empty"
              );
              return;
            }
            /* Fresh stack each start; re-shuffle by reloading root. */
            self._setBusy(true, "Loading playlist…");
            return self._loadFrame(self._rootUrl).then(
              function (frame) {
                self._rootFrame = frame;
                self._stack = [frame];
                return self._playNext();
              },
              function (err) {
                self._setLocalError(
                  self._friendlyError(
                    err && err.message,
                    "Couldn't load playlist"
                  )
                );
              }
            );
          });
        }
        _onPlayPause() {
          var self = this;
          var mc = MC();
          if (!mc) {
            this._setLocalError("Player unavailable");
            return;
          }
          var st = this._mine();
          if (!st) return this._startPlayback();
          if (st.playing) {
            mc.pause();
            this._sync();
          } else {
            this._setBusy(true, "Resuming…");
            mc.resume().then(
              function (res) {
                self._busy = false;
                self._busyLabel = "";
                if (res && res.ok) self._localError = "";
                else if (res && !res.needsPlay) {
                  self._localError = self._friendlyError(
                    res && res.error,
                    "Couldn't resume"
                  );
                }
                self._sync();
              },
              function (err) {
                self._setLocalError(
                  self._friendlyError(err && err.message, "Couldn't resume")
                );
              }
            );
          }
        }
      }
      customElements.define("ct-playlist", CtPlaylist);
    }
  }

  /** Upgrade any ct-* elements under rootEl (no-op when already defined/upgraded). */
  function upgrade(rootEl) {
    defineElements();
    if (rootEl && root.customElements && typeof customElements.upgrade === "function") {
      try {
        customElements.upgrade(rootEl);
      } catch (e) {}
    }
  }

  function setSiteOrigin(origin) {
    cfg.siteOrigin = String(origin || "").replace(/\/+$/, "");
  }

  defineElements();

  return {
    SiMarkdown: SiMarkdown,
    render: renderMarkdown,
    define: defineElements,
    upgrade: upgrade,
    setSiteOrigin: setSiteOrigin,
    resolveUrl: resolveUrl,
  };
});
