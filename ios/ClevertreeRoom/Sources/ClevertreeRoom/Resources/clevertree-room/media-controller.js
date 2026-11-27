/**
 * Clevertree global media controller — one active audio/video at a time.
 *
 * Used by SI built-ins (ct-video, ct-playlist) and the room SI tabs.
 * Chat messages must never call play() without a user gesture.
 *
 *   ClevertreeMediaController.play(url, { kind, owner, container, loop, muted,
 *     poster, autoplay, onended })
 *     → Promise<{ ok, needsPlay, error? }>
 *   ClevertreeMediaController.resume()   // call from a click handler when needsPlay
 *   ClevertreeMediaController.pause() / stop() / fullscreen()
 *   ClevertreeMediaController.stopWithin(rootEl)  // stop if owner lives in rootEl
 *   ClevertreeMediaController.subscribe(fn) → unsubscribe
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

  var active = null; // { el, kind, url, owner, ownsEl, opts }
  var listeners = [];
  var state = {
    active: false,
    playing: false,
    needsPlay: false,
    kind: "",
    url: "",
    owner: null,
    error: "",
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

  function teardown(reason) {
    var cur = active;
    if (!cur) return;
    active = null;
    var prevOwner = cur.owner;
    var prevUrl = cur.url;
    try {
      cur.el.onended = null;
      cur.el.onpause = null;
      cur.el.onplay = null;
      cur.el.onerror = null;
      cur.el.pause();
    } catch (e) {}
    try {
      if (document.fullscreenElement === cur.el && document.exitFullscreen) {
        document.exitFullscreen();
      }
    } catch (e1) {}
    try {
      cur.el.removeAttribute("src");
      if (typeof cur.el.load === "function") cur.el.load();
    } catch (e2) {}
    if (cur.ownsEl && cur.el.parentNode) {
      try {
        cur.el.parentNode.removeChild(cur.el);
      } catch (e3) {}
    }
    setState({
      active: false,
      playing: false,
      needsPlay: false,
      kind: "",
      url: "",
      owner: null,
      error: "",
    });
    emit("stop", { reason: reason || "stop", prevOwner: prevOwner, prevUrl: prevUrl });
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
        return { ok: false, needsPlay: false, error: String((err && err.message) || err) };
      }
    );
  }

  /**
   * Start playback. Any prior media is stopped first. Never throws.
   * opts: kind ("audio"|"video"), owner (any token, usually the UI element),
   *       container (element for <video>), loop, muted, poster, onended.
   */
  function play(url, opts) {
    opts = opts || {};
    url = String(url || "").trim();
    if (!url) return Promise.resolve({ ok: false, error: "no-url" });
    if (typeof document === "undefined") {
      return Promise.resolve({ ok: false, error: "no-dom" });
    }
    teardown("replaced");

    var kind = detectKind(url, opts.kind);
    var el;
    var ownsEl = true;
    if (kind === "video") {
      el = document.createElement("video");
      el.playsInline = true;
      el.setAttribute("playsinline", "");
      el.controls = opts.controls !== false;
      el.preload = "metadata";
      if (opts.poster) el.poster = opts.poster;
      el.style.cssText = "display:block;width:100%;max-height:70vh;background:#000";
      var host = opts.container || floatingHost();
      host.appendChild(el);
    } else {
      el = new Audio();
      el.preload = "auto";
    }
    el.loop = !!opts.loop;
    if (opts.muted) el.muted = true;
    el.src = url;

    var cur = { el: el, kind: kind, url: url, owner: opts.owner || null, ownsEl: ownsEl, opts: opts };
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
    return tryPlay(cur);
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

  function stop() {
    teardown("stop");
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
    if (inside) teardown("closed");
    return inside;
  }

  function fullscreen() {
    if (!active || active.kind !== "video") return false;
    var el = active.el;
    try {
      if (el.requestFullscreen) {
        el.requestFullscreen();
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
    return false;
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

  return {
    play: play,
    resume: resume,
    pause: pause,
    stop: stop,
    stopWithin: stopWithin,
    fullscreen: fullscreen,
    subscribe: subscribe,
    isActiveFor: isActiveFor,
    getState: snapshot,
    detectKind: detectKind,
  };
});
