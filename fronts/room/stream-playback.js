/**
 * Clevertree stream / file URL helper — SomaFM, PLS/M3U, Icecast, direct media.
 * Safe HTTPS-first resolution for in-room and lobby players.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ClevertreeStreamPlayback = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SOMA_CHANNELS = "https://somafm.com/channels.json";

  function isHttps(url) {
    try {
      return new URL(url).protocol === "https:";
    } catch (e) {
      return false;
    }
  }

  function looksLikePlaylist(url) {
    var u = String(url || "").toLowerCase();
    return (
      u.indexOf(".pls") >= 0 ||
      u.indexOf(".m3u") >= 0 ||
      u.indexOf("somafm.com") >= 0 ||
      u.indexOf("icecast") >= 0
    );
  }

  function looksLikeMediaFile(url) {
    var u = String(url || "").toLowerCase().split("?")[0];
    return /\.(mp3|m4a|aac|ogg|opus|wav|mp4|webm|m3u8)$/.test(u);
  }

  function parsePls(text) {
    var lines = String(text || "").split(/\r?\n/);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^File\d+=(\S+)/i);
      if (m && m[1]) out.push(m[1].trim());
    }
    return out;
  }

  function parseM3u(text) {
    var lines = String(text || "").split(/\r?\n/);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.charAt(0) === "#") continue;
      out.push(line);
    }
    return out;
  }

  function httpsOnly(urls) {
    return (urls || []).filter(isHttps);
  }

  /**
   * Resolve a linked URL into playable HTTPS stream mirrors.
   * @returns {Promise<{ kind: string, mirrors: string[], title?: string, stationId?: string }>}
   */
  function resolveStreamUrl(url) {
    var href = String(url || "").trim();
    if (!href) return Promise.reject(new Error("empty url"));

    // SomaFM station page or id
    var somaId = null;
    var m = href.match(/somafm\.com\/([a-z0-9]+)\/?/i);
    if (m) somaId = m[1].toLowerCase();
    if (/^[a-z0-9]+$/i.test(href) && href.length < 32) {
      // bare station id — try SomaFM
      somaId = href.toLowerCase();
    }

    if (somaId) {
      return fetch(SOMA_CHANNELS, { credentials: "omit" })
        .then(function (r) {
          if (!r.ok) throw new Error("somafm channels");
          return r.json();
        })
        .then(function (data) {
          var channels = (data && data.channels) || [];
          var ch = null;
          for (var i = 0; i < channels.length; i++) {
            if (String(channels[i].id || "").toLowerCase() === somaId) {
              ch = channels[i];
              break;
            }
          }
          if (!ch) throw new Error("unknown SomaFM station");
          var playlists = ch.playlists || [];
          var plsUrl = null;
          for (var j = 0; j < playlists.length; j++) {
            var p = playlists[j];
            if (p && p.format === "mp3" && p.url && String(p.url).indexOf("https") === 0) {
              plsUrl = p.url;
              break;
            }
          }
          if (!plsUrl) plsUrl = "https://api.somafm.com/" + somaId + ".pls";
          return fetch(plsUrl, { credentials: "omit" })
            .then(function (r2) {
              return r2.text();
            })
            .then(function (body) {
              return {
                kind: "radio",
                stationId: somaId,
                title: ch.title || somaId,
                mirrors: httpsOnly(parsePls(body)),
              };
            });
        });
    }

    if (looksLikePlaylist(href) || /\.pls($|\?)/i.test(href) || /\.m3u8?($|\?)/i.test(href)) {
      if (!isHttps(href)) {
        return Promise.reject(new Error("HTTPS required for playlists"));
      }
      return fetch(href, { credentials: "omit" })
        .then(function (r) {
          if (!r.ok) throw new Error("playlist fetch");
          return r.text();
        })
        .then(function (body) {
          var mirrors = /\.pls/i.test(href) ? parsePls(body) : parseM3u(body);
          return {
            kind: "playlist",
            title: href,
            mirrors: httpsOnly(mirrors),
          };
        });
    }

    if (looksLikeMediaFile(href) || isHttps(href)) {
      if (!isHttps(href)) {
        return Promise.reject(new Error("HTTPS required"));
      }
      return Promise.resolve({
        kind: looksLikeMediaFile(href) ? "file" : "stream",
        title: href,
        mirrors: [href],
      });
    }

    return Promise.reject(new Error("unsupported url"));
  }

  /**
   * Attach a one-tap play control next to a message link when it looks streamable.
   */
  function enhanceAnchor(anchor, audioEl) {
    if (!anchor || !anchor.href) return;
    var href = anchor.href;
    if (!(looksLikePlaylist(href) || looksLikeMediaFile(href) || /somafm\.com/i.test(href))) {
      return;
    }
    if (anchor.getAttribute("data-ct-stream") === "1") return;
    anchor.setAttribute("data-ct-stream", "1");
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ct-stream-play";
    btn.textContent = "Play stream";
    btn.style.marginLeft = "8px";
    btn.onclick = function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      btn.disabled = true;
      btn.textContent = "Resolving…";
      resolveStreamUrl(href)
        .then(function (res) {
          var mirrors = res.mirrors || [];
          if (!mirrors.length) throw new Error("no mirrors");
          var player = audioEl;
          if (!player) {
            player = document.createElement("audio");
            player.controls = true;
            player.preload = "none";
            anchor.parentNode.insertBefore(player, anchor.nextSibling);
          }
          var i = 0;
          function tryNext() {
            if (i >= mirrors.length) {
              btn.textContent = "Failed";
              btn.disabled = false;
              return;
            }
            player.src = mirrors[i++];
            player.play().catch(tryNext);
          }
          player.onerror = tryNext;
          tryNext();
          btn.textContent = res.title ? "Playing · " + res.title : "Playing";
          btn.disabled = false;
        })
        .catch(function () {
          btn.textContent = "Unavailable";
          btn.disabled = false;
        });
    };
    anchor.parentNode.insertBefore(btn, anchor.nextSibling);
  }

  return {
    resolveStreamUrl: resolveStreamUrl,
    enhanceAnchor: enhanceAnchor,
    looksLikePlaylist: looksLikePlaylist,
    looksLikeMediaFile: looksLikeMediaFile,
    isHttps: isHttps,
  };
});
