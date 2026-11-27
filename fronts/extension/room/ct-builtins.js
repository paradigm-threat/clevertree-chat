/**
 * CleverTree SI built-in components (web custom elements) + SI markdown.
 *
 *   <ct-carousel src="/hooks/client/si/showing.json" open="tab"></ct-carousel>
 *   <ct-video src="https://…/movie.mp4" label="Watch"></ct-video>
 *   <ct-playlist src="/hooks/client/lobby/lobby.playlist.json" autoplay="1"></ct-playlist>
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
    label: 1,
    autoplay: 1,
    "data-autoplay": 1,
    poster: 1,
    title: 1,
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

  var STYLE_ID = "ct-builtins-style";
  var CSS =
    "ct-carousel,ct-video,ct-playlist{display:block;margin:10px 0}" +
    "ct-carousel .ct-car-row{display:flex;gap:10px;overflow-x:auto;padding:4px 2px 10px;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch}" +
    "ct-carousel .ct-car-card{flex:0 0 112px;scroll-snap-align:start;display:flex;flex-direction:column;gap:5px;padding:0;text-align:left;background:none;border:0;color:inherit;cursor:pointer}" +
    "ct-carousel .ct-car-poster{width:112px;aspect-ratio:2/3;object-fit:cover;border-radius:6px;background:color-mix(in srgb,currentColor 12%,transparent);border:1px solid var(--line,#d9ded6);display:block}" +
    "ct-carousel .ct-car-card:hover .ct-car-poster,ct-carousel .ct-car-card:focus-visible .ct-car-poster{outline:2px solid var(--green,#225744);outline-offset:1px}" +
    "ct-carousel .ct-car-title{font-size:12px;font-weight:700;line-height:1.25;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}" +
    "ct-carousel .ct-car-year{font-size:11px;color:var(--muted,#52645c)}" +
    "ct-carousel .ct-car-status{font-size:12px;color:var(--muted,#52645c)}" +
    "ct-video .ct-btn,ct-playlist .ct-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:6px;border:1px solid var(--green,#225744);background:var(--green,#225744);color:var(--white,#fffefa);font-weight:700;font-size:13px;cursor:pointer}" +
    "ct-video .ct-btn.secondary,ct-playlist .ct-btn.secondary{background:transparent;color:var(--green,#225744)}" +
    "ct-video .ct-label,ct-playlist .ct-label{margin-left:8px;font-size:13px}" +
    "ct-video .ct-player:not(:empty){margin-top:8px}" +
    "ct-video .ct-hint,ct-playlist .ct-hint{display:block;margin-top:4px;font-size:12px;color:var(--muted,#52645c)}";

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

  function defineElements() {
    if (typeof HTMLElement === "undefined" || !root.customElements) return;
    ensureStyle();

    /* ---------- ct-carousel ---------- */
    if (!customElements.get("ct-carousel")) {
      class CtCarousel extends HTMLElement {
        static get observedAttributes() {
          return ["src"];
        }
        connectedCallback() {
          if (!this._loaded) this._load();
        }
        attributeChangedCallback(name, oldV, newV) {
          if (name === "src" && this.isConnected && oldV !== newV) this._load();
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
            var detail = {
              title: String(it.title || ""),
              year: it.year == null ? "" : it.year,
              readme: abs(it.readme),
              poster: abs(it.poster),
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
            '<button type="button" class="ct-btn" data-ct="play"></button>' +
            '<button type="button" class="ct-btn secondary" data-ct="fs" hidden aria-label="Fullscreen">⛶</button>' +
            (label ? '<span class="ct-label">' + esc(label) + "</span>" : "") +
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
        _start() {
          var mc = MC();
          if (!mc) return;
          var url = resolveUrl(this.getAttribute("src"), this);
          if (!url) return;
          var self = this;
          mc.play(url, {
            kind: "video",
            owner: this,
            container: this._slot,
            poster: this.getAttribute("poster") || undefined,
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

    /* ---------- ct-playlist ---------- */
    if (!customElements.get("ct-playlist")) {
      class CtPlaylist extends HTMLElement {
        connectedCallback() {
          if (this._built) return;
          this._built = true;
          var self = this;
          var label = this.getAttribute("label") || "Lobby music";
          this.innerHTML =
            '<button type="button" class="ct-btn" data-ct="play"></button>' +
            '<span class="ct-label" data-ct="label">' + esc(label) + "</span>" +
            '<span class="ct-hint" data-ct="hint" hidden>Your browser blocked autoplay — tap Play.</span>';
          this._btn = this.querySelector('[data-ct="play"]');
          this._hint = this.querySelector('[data-ct="hint"]');
          this._btn.addEventListener("click", function () {
            self._onClick();
          });
          var mc = MC();
          this._unsub = mc ? mc.subscribe(function () { self._sync(); }) : null;
          this._sync();
          this._prefetch();
          // SI may set autoplay=1; a blocked attempt surfaces the Play button.
          // Never steal focus from media something else is already playing.
          var ap = this.getAttribute("autoplay");
          if (ap && ap !== "0" && ap !== "false") {
            this._prefetch().then(function () {
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
          var mc = MC();
          if (mc && mc.isActiveFor(this)) mc.stop();
        }
        _prefetch() {
          var self = this;
          if (this._pre) return this._pre;
          var url = resolveUrl(this.getAttribute("src"), this);
          this._pre = url
            ? fetchJson(url).then(
                function (data) {
                  self._tracks = pickTracks(data);
                  self._loop = playlistLoops(data);
                },
                function () {
                  self._tracks = [];
                }
              )
            : Promise.resolve();
          return this._pre;
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
        }
        _playTrack() {
          var self = this;
          var mc = MC();
          var tracks = this._tracks || [];
          if (!mc || !tracks.length) return Promise.resolve();
          if (this._idx >= tracks.length) this._idx = 0;
          return mc
            .play(resolveUrl(tracks[this._idx], this), {
              kind: "audio",
              owner: this,
              onended: function () {
                self._idx++;
                if (self._idx >= tracks.length && !self._loop) return;
                self._playTrack();
              },
            })
            .then(function () {
              self._sync();
            });
        }
        _startPlayback() {
          var self = this;
          return this._prefetch().then(function () {
            self._idx = self._idx || 0;
            return self._playTrack();
          });
        }
        _onClick() {
          var mc = MC();
          if (!mc) return;
          var st = this._mine();
          if (!st) return this._startPlayback();
          if (st.playing) mc.pause();
          else mc.resume().then(this._sync.bind(this));
        }
      }
      customElements.define("ct-playlist", CtPlaylist);
    }
  }

  /** lobby.playlist.json → ordered track URLs (defaultSong, shuffle honoured). */
  function pickTracks(data) {
    var songs = (data && data.songs) || {};
    var key = (data && data.defaultSong) || Object.keys(songs)[0];
    var song = songs[key] || {};
    var tracks = (song.tracks || []).slice();
    if (song.shuffle) {
      for (var i = tracks.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = tracks[i];
        tracks[i] = tracks[j];
        tracks[j] = t;
      }
    }
    return tracks;
  }

  function playlistLoops(data) {
    var songs = (data && data.songs) || {};
    var key = (data && data.defaultSong) || Object.keys(songs)[0];
    return !!(songs[key] && songs[key].loop);
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
