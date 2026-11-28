/**
 * Clevertree global media controller — one foreground A/V at a time.
 *
 * Used by SI built-ins (ct-video, ct-playlist) and the room SI tabs.
 * Chat messages must never call play() without a user gesture.
 *
 *   ClevertreeMediaController.play(url, { kind, owner, container, loop, muted,
 *     poster, volume, fadeInMs, fadeOutMs, role, tracks, onended })
 *     → Promise<{ ok, needsPlay, error? }>
 *   ClevertreeMediaController.resume()   // call from a click handler when needsPlay
 *   ClevertreeMediaController.pause() / stop() / fullscreen()
 *   ClevertreeMediaController.stopWithin(rootEl)  // stop if owner lives in rootEl
 *   ClevertreeMediaController.subscribe(fn) → unsubscribe
 *
 * Lobby audio (role:"lobby") is soft-suspended when video takes over: fade out,
 * pause, keep position; when video ends/stops, fade lobby back in.
 *
 * If the browser blocks autoplay (NotAllowedError) the element stays loaded,
 * state.needsPlay becomes true and listeners are notified so the UI can show a
 * Play button; a user-gesture resume() then plays it.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root);
  } else {
    root.ClevertreeMediaController =
      root.ClevertreeMediaController || factory(root);
  }
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  var VIDEO_RE = /\.(mp4|m4v|webm|mov|mkv|ogv|m3u8)$/i;
  var DEFAULT_FADE_IN = 1200;
  var DEFAULT_FADE_OUT = 800;

  var active = null; // { el, kind, url, owner, ownsEl, opts }
  var suspended = null; // lobby audio parked under video
  var listeners = [];
  var fadeToken = 0;
  var state = {
    active: false,
    playing: false,
    needsPlay: false,
    kind: "",
    url: "",
    owner: null,
    error: "",
    suspended: false,
  };

  function snapshot() {
    return {
      active: state.active,
      playing: state.playing,
      needsPlay: state.needsPlay,
      kind: state.kind,
      url: state.url,
      owner: state.owner,
      error: state.error,
      suspended: !!suspended,
    };
  }

  function emit(type, extra) {
    var ev = snapshot();
    ev.type = type;
    if (extra) {
      for (var k in extra) ev[k] = extra[k];
    }
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](ev);
      } catch (e) {}
    }
    try {
      if (root.document && typeof root.CustomEvent === "function") {
        root.document.dispatchEvent(
          new root.CustomEvent("ct-media-state", { detail: ev })
        );
      }
    } catch (e2) {}
  }

  function setState(patch) {
    for (var k in patch) state[k] = patch[k];
  }

  function detectKind(url, kind) {
    if (kind === "audio" || kind === "video") return kind;
    return VIDEO_RE.test(String(url || "").split("?")[0].split("#")[0])
      ? "video"
      : "audio";
  }

  function isBlocked(err) {
    var name = err && err.name;
    return name === "NotAllowedError" || name === "AbortError";
  }

  function clamp01(n) {
    n = Number(n);
    if (!(n >= 0)) return 0;
    if (n > 1) return 1;
    return n;
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  /** Smooth HTMLMediaElement.volume ramp (works without Web Audio graph). */
  function fadeVolume(el, from, to, ms) {
    from = clamp01(from);
    to = clamp01(to);
    ms = Math.max(0, Number(ms) || 0);
    return new Promise(function (resolve) {
      if (!el) {
        resolve();
        return;
      }
      var token = ++fadeToken;
      try {
        el.volume = from;
      } catch (e0) {}
      if (ms <= 0 || from === to) {
        try {
          el.volume = to;
        } catch (e1) {}
        resolve();
        return;
      }
      var t0 =
        root.performance && performance.now
          ? performance.now()
          : Date.now();
      function frame(now) {
        if (token !== fadeToken) {
          resolve();
          return;
        }
        var t = Math.min(1, (now - t0) / ms);
        var v = from + (to - from) * easeInOut(t);
        try {
          el.volume = v;
        } catch (e2) {}
        if (t < 1) {
          (root.requestAnimationFrame || function (cb) {
            return setTimeout(function () {
              cb(Date.now());
            }, 16);
          })(frame);
        } else {
          resolve();
        }
      }
      (root.requestAnimationFrame || function (cb) {
        return setTimeout(function () {
          cb(Date.now());
        }, 16);
      })(frame);
    });
  }

  function destroyEl(cur) {
    if (!cur || !cur.el) return;
    try {
      cur.el.onended = null;
      cur.el.onpause = null;
      cur.el.onplay = null;
      cur.el.onerror = null;
      cur.el.pause();
    } catch (e) {}
    try {
      if (
        typeof document !== "undefined" &&
        document.fullscreenElement === cur.el &&
        document.exitFullscreen
      ) {
        document.exitFullscreen();
      }
    } catch (e1) {}
    try {
      cur.el.removeAttribute("src");
      while (cur.el.firstChild) cur.el.removeChild(cur.el.firstChild);
      if (typeof cur.el.load === "function") cur.el.load();
    } catch (e2) {}
    if (cur.ownsEl && cur.el.parentNode) {
      try {
        cur.el.parentNode.removeChild(cur.el);
      } catch (e3) {}
    }
  }

  function applyTrackModes(video, tracks) {
    try {
      var tt = video.textTracks;
      if (!tt) return;
      for (var j = 0; j < tt.length; j++) {
        tt[j].mode =
          tracks[j] && (tracks[j].default || tracks[j].isDefault)
            ? "showing"
            : "hidden";
      }
    } catch (e) {}
  }

  /**
   * Attach subtitle tracks. Prefer fetching VTT → blob: URLs so cross-origin
   * stream hosts (CDN without CORS) still decode; remote track src is fallback.
   */
  function attachTracks(video, tracks) {
    if (!video || !tracks || !tracks.length) return Promise.resolve();
    var jobs = [];
    for (var i = 0; i < tracks.length; i++) {
      (function (t, index) {
        var src = String((t && (t.src || t.url)) || "").trim();
        if (!src) return;
        var el = document.createElement("track");
        el.kind = (t && t.kind) || "subtitles";
        el.label = (t && t.label) || "Subtitles";
        el.srclang = (t && (t.lang || t.srclang)) || "en";
        if (t && (t.default || t.isDefault)) el.default = true;
        video.appendChild(el);
        jobs.push(
          Promise.resolve()
            .then(function () {
              return fetch(src, { mode: "cors", credentials: "omit" }).then(
                function (r) {
                  if (!r.ok) throw new Error("track-http");
                  return r.text();
                }
              );
            })
            .then(function (text) {
              var blob = new Blob([text], { type: "text/vtt" });
              el.src = URL.createObjectURL(blob);
            })
            .catch(function () {
              el.src = src;
            })
        );
      })(tracks[i], i);
    }
    return Promise.all(jobs).then(function () {
      applyTrackModes(video, tracks);
    });
  }

  function floatingHost() {
    var host = document.getElementById("ct-media-float");
    if (host) return host;
    host = document.createElement("div");
    host.id = "ct-media-float";
    host.style.cssText =
      "position:fixed;right:12px;bottom:12px;width:min(320px,80vw);z-index:2147483000;" +
      "background:#000;border-radius:8px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,.4)";
    (document.body || document.documentElement).appendChild(host);
    return host;
  }

  function wireElement(cur) {
    var el = cur.el;
    el.onplay = function () {
      if (active !== cur) return;
      setState({ playing: true, needsPlay: false, error: "" });
      emit("play");
    };
    el.onpause = function () {
      if (active !== cur) return;
      if (el.ended) return;
      setState({ playing: false });
      emit("pause");
    };
    el.onended = function () {
      if (active !== cur) return;
      var cb = cur.opts && cur.opts.onended;
      setState({ playing: false });
      emit("ended");
      if (typeof cb === "function") {
        try {
          cb();
        } catch (e) {}
        return;
      }
      /* Video finished with no continue handler → clear + restore lobby. */
      if (cur.kind === "video") {
        teardown("ended");
      }
    };
    el.onerror = function () {
      if (active !== cur) return;
      setState({ playing: false, error: "media-error" });
      emit("error");
    };
  }

  function tryPlay(cur) {
    var p;
    try {
      p = cur.el.play();
    } catch (e) {
      p = Promise.reject(e);
    }
    return Promise.resolve(p).then(
      function () {
        if (active !== cur) return { ok: false, superseded: true };
        setState({ playing: true, needsPlay: false, error: "" });
        emit("play");
        return { ok: true, needsPlay: false };
      },
      function (err) {
        if (active !== cur) return { ok: false, superseded: true };
        if (isBlocked(err)) {
          setState({ playing: false, needsPlay: true, error: "" });
          emit("needs-play");
          return { ok: false, needsPlay: true };
        }
        setState({ playing: false, needsPlay: false, error: "play-failed" });
        emit("error", { message: String((err && err.message) || err || "") });
        return {
          ok: false,
          needsPlay: false,
          error: String((err && err.message) || err),
        };
      }
    );
  }

  function fadeOutActive(cur) {
    if (!cur || !cur.el) return Promise.resolve();
    var ms =
      cur.opts && cur.opts.fadeOutMs != null
        ? Number(cur.opts.fadeOutMs)
        : cur.kind === "audio"
          ? DEFAULT_FADE_OUT
          : 0;
    var from = 1;
    try {
      from = typeof cur.el.volume === "number" ? cur.el.volume : 1;
    } catch (e) {}
    if (!(ms > 0) || cur.kind !== "audio") {
      try {
        cur.el.pause();
      } catch (e2) {}
      return Promise.resolve();
    }
    return fadeVolume(cur.el, from, 0, ms).then(function () {
      try {
        cur.el.pause();
      } catch (e3) {}
    });
  }

  function shouldSuspendForVideo(cur, incomingOpts) {
    if (!cur || cur.kind !== "audio") return false;
    if (!incomingOpts || incomingOpts.kind !== "video") return false;
    var role = cur.opts && cur.opts.role;
    return role === "lobby" || role === "background";
  }

  function parkSuspended(cur) {
    suspended = cur;
    setState({ suspended: true });
    emit("suspend", { prevOwner: cur.owner, prevUrl: cur.url });
  }

  function clearSuspended(destroy) {
    var cur = suspended;
    suspended = null;
    setState({ suspended: false });
    if (destroy && cur) destroyEl(cur);
  }

  function restoreSuspended() {
    if (!suspended) return Promise.resolve({ ok: false });
    var cur = suspended;
    suspended = null;
    setState({ suspended: false });
    active = cur;
    wireElement(cur);
    setState({
      active: true,
      playing: false,
      needsPlay: false,
      kind: cur.kind,
      url: cur.url,
      owner: cur.owner,
      error: "",
    });
    emit("resume-suspended", { owner: cur.owner, url: cur.url });
    var targetVol =
      cur.opts && cur.opts.volume != null ? clamp01(cur.opts.volume) : 1;
    var fadeIn =
      cur.opts && cur.opts.fadeInMs != null
        ? Number(cur.opts.fadeInMs)
        : DEFAULT_FADE_IN;
    try {
      cur.el.volume = 0;
    } catch (e) {}
    return tryPlay(cur).then(function (res) {
      if (!res || !res.ok) return res;
      return fadeVolume(cur.el, 0, targetVol, fadeIn).then(function () {
        return res;
      });
    });
  }

  function teardown(reason, opts) {
    opts = opts || {};
    var cur = active;
    if (!cur) {
      if (!opts.keepSuspended && reason !== "replaced") {
        return restoreSuspended();
      }
      return Promise.resolve();
    }
    active = null;
    var prevOwner = cur.owner;
    var prevUrl = cur.url;
    var doRestore =
      !opts.keepSuspended &&
      reason !== "replaced" &&
      reason !== "suspend";

    return fadeOutActive(cur).then(function () {
      destroyEl(cur);
      setState({
        active: false,
        playing: false,
        needsPlay: false,
        kind: "",
        url: "",
        owner: null,
        error: "",
      });
      emit("stop", {
        reason: reason || "stop",
        prevOwner: prevOwner,
        prevUrl: prevUrl,
      });
      if (doRestore) return restoreSuspended();
      return { ok: true };
    });
  }

  /**
   * Start playback. Prior media is faded out; lobby audio under video is
   * soft-suspended and restored when video ends/stops.
   */
  function play(url, opts) {
    opts = opts || {};
    url = String(url || "").trim();
    if (!url) return Promise.resolve({ ok: false, error: "no-url" });
    if (typeof document === "undefined") {
      return Promise.resolve({ ok: false, error: "no-dom" });
    }

    var kind = detectKind(url, opts.kind);
    opts.kind = kind;

    var prep = Promise.resolve();
    if (active) {
      if (shouldSuspendForVideo(active, opts)) {
        var parking = active;
        active = null;
        prep = fadeOutActive(parking).then(function () {
          parkSuspended(parking);
          setState({
            active: false,
            playing: false,
            needsPlay: false,
            kind: "",
            url: "",
            owner: null,
            error: "",
          });
          emit("stop", {
            reason: "suspend",
            prevOwner: parking.owner,
            prevUrl: parking.url,
          });
        });
      } else {
        if (opts.role === "lobby") clearSuspended(true);
        prep = teardown("replaced", { keepSuspended: true });
      }
    } else if (opts.role === "lobby") {
      clearSuspended(true);
    }

    return prep.then(function () {
      var el;
      var ownsEl = true;
      if (kind === "video") {
        el = document.createElement("video");
        el.playsInline = true;
        el.setAttribute("playsinline", "");
        el.controls = opts.controls !== false;
        el.preload = "metadata";
        /* Only set CORS mode when caller asks — many CDNs lack ACAO and
         * anonymous mode would block decode entirely. Tracks use blob: URLs. */
        if (opts.crossOrigin) el.crossOrigin = opts.crossOrigin;
        if (opts.poster) el.poster = opts.poster;
        el.style.cssText =
          "display:block;width:100%;max-height:70vh;background:#000";
        var host = opts.container || floatingHost();
        host.appendChild(el);
      } else {
        el = new Audio();
        el.preload = "auto";
        if (opts.crossOrigin) el.crossOrigin = opts.crossOrigin;
      }
      el.loop = !!opts.loop;
      if (opts.muted) el.muted = true;
      var targetVol =
        opts.volume != null ? clamp01(opts.volume) : kind === "audio" ? 1 : 1;
      var fadeIn =
        opts.fadeInMs != null
          ? Number(opts.fadeInMs)
          : kind === "audio"
            ? DEFAULT_FADE_IN
            : 0;
      try {
        el.volume = fadeIn > 0 && kind === "audio" ? 0 : targetVol;
      } catch (eVol) {}
      el.src = url;

      var cur = {
        el: el,
        kind: kind,
        url: url,
        owner: opts.owner || null,
        ownsEl: ownsEl,
        opts: opts,
      };
      active = cur;
      wireElement(cur);
      setState({
        active: true,
        playing: false,
        needsPlay: false,
        kind: kind,
        url: url,
        owner: cur.owner,
        error: "",
      });
      emit("load");

      var tracksReady =
        kind === "video" && opts.tracks && opts.tracks.length
          ? attachTracks(el, opts.tracks)
          : Promise.resolve();

      return tracksReady.then(function () {
        return tryPlay(cur).then(function (res) {
          if (!res || !res.ok || !(fadeIn > 0) || kind !== "audio") return res;
          return fadeVolume(el, 0, targetVol, fadeIn).then(function () {
            return res;
          });
        });
      });
    });
  }

  /** Call from a user gesture after needsPlay (or to resume after pause). */
  function resume() {
    if (!active) return Promise.resolve({ ok: false, error: "no-active" });
    return tryPlay(active);
  }

  function pause() {
    if (!active) return;
    try {
      active.el.pause();
    } catch (e) {}
  }

  /** Set active media volume (0–1). Updates opts so fade/resume keep the level. */
  function setVolume(level) {
    var v = clamp01(level);
    if (!active || !active.el) return v;
    try {
      if (!active.opts) active.opts = {};
      active.opts.volume = v;
      active.el.volume = v;
    } catch (e) {}
    emit("volume", { volume: v });
    return v;
  }

  function getVolume() {
    if (active && active.el && typeof active.el.volume === "number") {
      return clamp01(active.el.volume);
    }
    if (active && active.opts && active.opts.volume != null) {
      return clamp01(active.opts.volume);
    }
    return 1;
  }

  function stop() {
    return teardown("stop");
  }

  function stopWithin(rootEl) {
    if (!active || !rootEl) return false;
    var owner = active.owner;
    var inside = false;
    try {
      inside =
        (owner && owner.nodeType === 1 && rootEl.contains(owner)) ||
        (active.el && rootEl.contains(active.el));
    } catch (e) {}
    if (inside) {
      teardown("closed");
      return true;
    }
    return false;
  }

  function ensureFsStyle() {
    if (document.getElementById("ct-media-fs-style")) return;
    var s = document.createElement("style");
    s.id = "ct-media-fs-style";
    s.textContent =
      "video.ct-media-fs{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;" +
      "max-height:none!important;z-index:2147483646!important;background:#000!important;object-fit:contain!important}" +
      ".ct-media-fs-backdrop{position:fixed;inset:0;z-index:2147483645;background:#000;border:0;padding:0;margin:0}";
    (document.head || document.documentElement).appendChild(s);
  }

  function exitCssFullscreen() {
    if (!active || !active.el) return;
    try {
      active.el.classList.remove("ct-media-fs");
    } catch (e) {}
    var bak = document.querySelector(".ct-media-fs-backdrop");
    if (bak && bak.parentNode) bak.parentNode.removeChild(bak);
  }

  function fullscreen() {
    if (!active || active.kind !== "video") return false;
    var el = active.el;
    try {
      if (document.fullscreenElement === el || el.classList.contains("ct-media-fs")) {
        if (document.exitFullscreen) document.exitFullscreen();
        exitCssFullscreen();
        return true;
      }
      if (el.requestFullscreen) {
        var p = el.requestFullscreen();
        if (p && typeof p.then === "function") {
          p.catch(function () {
            enterCssFullscreen(el);
          });
        }
        return true;
      }
      if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
        return true;
      }
      if (el.webkitEnterFullscreen) {
        el.webkitEnterFullscreen();
        return true;
      }
    } catch (e) {}
    return enterCssFullscreen(el);
  }

  function enterCssFullscreen(el) {
    if (!el) return false;
    ensureFsStyle();
    try {
      var bak = document.createElement("button");
      bak.type = "button";
      bak.className = "ct-media-fs-backdrop";
      bak.setAttribute("aria-label", "Exit fullscreen");
      bak.onclick = function () {
        exitCssFullscreen();
      };
      (document.body || document.documentElement).appendChild(bak);
      el.classList.add("ct-media-fs");
      return true;
    } catch (e2) {
      return false;
    }
  }

  function subscribe(fn) {
    if (typeof fn !== "function") return function () {};
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function isActiveFor(owner, url) {
    if (!active) return false;
    if (owner && active.owner !== owner) return false;
    if (url && active.url !== url) return false;
    return true;
  }

  function getElement() {
    return active ? active.el : null;
  }

  return {
    play: play,
    resume: resume,
    pause: pause,
    stop: stop,
    stopWithin: stopWithin,
    fullscreen: fullscreen,
    setVolume: setVolume,
    getVolume: getVolume,
    subscribe: subscribe,
    isActiveFor: isActiveFor,
    getState: snapshot,
    getElement: getElement,
    detectKind: detectKind,
  };
});
