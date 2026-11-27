/**
 * Relay side panel: CleverTree room + always-on Refresh.
 * Gather runs via background → host tab; chat stays mounted.
 */
(function () {
  "use strict";

  // Prefer real MV3 chrome; otherwise a local preview stub (never assign window.chrome —
  // Cursor/Electron often expose a non-writable empty chrome object).
  var ext =
    typeof chrome !== "undefined" &&
    chrome.runtime &&
    chrome.runtime.sendMessage &&
    chrome.storage &&
    chrome.storage.local
      ? chrome
      : null;
  if (!ext) {
    var _store = {};
    try {
      _store = JSON.parse(sessionStorage.getItem("relay_preview_store") || "{}") || {};
    } catch (e) {}
    function persistStore() {
      try {
        sessionStorage.setItem("relay_preview_store", JSON.stringify(_store));
      } catch (e2) {}
    }
    var listeners = [];
    ext = {
      runtime: {
        sendMessage: function (msg, cb) {
          if (msg && msg.type === "GATHER_START") {
            try {
              window.parent.postMessage(
                { type: "RELAY_GATHER", collectionId: msg.collectionId },
                "*"
              );
            } catch (e3) {}
            setTimeout(function () {
              listeners.forEach(function (fn) {
                fn({
                  type: "GATHER_STATE",
                  phase: "complete",
                  lastSuccessfulRefreshAt: new Date().toISOString(),
                });
              });
            }, 1800);
          }
          if (typeof cb === "function") cb({});
        },
        onMessage: {
          addListener: function (fn) {
            listeners.push(fn);
          },
        },
      },
      storage: {
        local: {
          get: function (keys, cb) {
            var out = {};
            (Array.isArray(keys) ? keys : Object.keys(keys || {})).forEach(function (k) {
              if (_store[k] != null) out[k] = _store[k];
            });
            cb(out);
          },
          set: function (obj, cb) {
            Object.keys(obj || {}).forEach(function (k) {
              _store[k] = obj[k];
            });
            persistStore();
            if (typeof cb === "function") cb();
          },
        },
      },
    };
  }

  var DEFAULTS = {
    collectionId: "savannah-cat-rescue",
    title: "Savannah Cat Rescue",
    channel: "#ga-savannah-cat-rescue",
    apiBase: "https://api.clevertree.chat",
    mirrors: [
      "wss://api.clevertree.chat/api/chat/ws",
      "wss://pub1.relaygateway.net/chat/ws",
    ],
  };

  var statusEl = document.getElementById("refresh-status");
  var detailEl = document.getElementById("refresh-detail");
  var refreshBtn = document.getElementById("refresh-btn");
  var roomApi = null;
  var gatherPhase = "idle";
  var lastRefreshAt = null;

  function formatAge(iso) {
    if (!iso) return "never";
    var ms = Date.now() - new Date(iso).getTime();
    if (ms < 0 || isNaN(ms)) return "unknown";
    var days = Math.floor(ms / 86400000);
    if (days >= 1) return days + (days === 1 ? " day" : " days") + " ago";
    var hrs = Math.floor(ms / 3600000);
    if (hrs >= 1) return hrs + (hrs === 1 ? " hour" : " hours") + " ago";
    var mins = Math.max(1, Math.floor(ms / 60000));
    return mins + " min ago";
  }

  function setRefreshUi() {
    document.body.classList.toggle("gathering", gatherPhase === "gathering");
    if (gatherPhase === "gathering") {
      statusEl.textContent = "Gathering…";
      detailEl.textContent = "Working in host tab · chat stays open";
      refreshBtn.disabled = true;
      refreshBtn.textContent = "Gathering…";
      return;
    }
    if (gatherPhase === "fresh") {
      statusEl.textContent = "Up to date";
      detailEl.textContent = "Refreshed just now";
    } else {
      statusEl.textContent = "Last refreshed " + formatAge(lastRefreshAt);
      detailEl.textContent = "Tracked groups · one click to collect";
    }
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Refresh";
  }

  function loadCollection(cb) {
    var done = false;
    function finish(j) {
      if (done) return;
      done = true;
      if (j) {
        if (j.irc_channel) DEFAULTS.channel = j.irc_channel;
        if (j.name) DEFAULTS.title = j.name;
        if (j.id) DEFAULTS.collectionId = j.id;
      }
      cb();
    }
    var url = "https://myproblem.app/collections/" + DEFAULTS.collectionId + ".json";
    var timer = setTimeout(function () {
      finish(null);
    }, 2500);
    fetch(url)
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (j) {
        clearTimeout(timer);
        finish(j);
      })
      .catch(function () {
        clearTimeout(timer);
        finish(null);
      });
  }

  function mountRoom() {
    var root = document.getElementById("room-root");
    if (!root || typeof CleverTreeRoom === "undefined") {
      console.error("Relay: CleverTreeRoom missing");
      return;
    }
    try {
    roomApi = CleverTreeRoom.mount(root, {
      mode: "sidepanel",
      channel: DEFAULTS.channel,
      title: DEFAULTS.title,
      collectionId: DEFAULTS.collectionId,
      mirrors: DEFAULTS.mirrors.map(function (u) {
        // Append topic for chat-edge style gateways
        if (u.indexOf("api.clevertree.chat") >= 0) {
          return (
            u +
            (u.indexOf("?") >= 0 ? "&" : "?") +
            "topic=" +
            encodeURIComponent(
              (DEFAULTS.channel || "").replace(/^#/, "")
            )
          );
        }
        return u;
      }),
      context: { collection: DEFAULTS.collectionId },
      showGather: false,
      seedMessages: [
        {
          nick: "system",
          text:
            "[[c:" +
            DEFAULTS.collectionId +
            "]] Public room ready. Refresh gathers on the host tab; this chat stays open.",
          time: "",
        },
      ],
      onTrack: function (tracked) {
        ext.runtime.sendMessage({ type: "TRACK_GROUP", tracked: tracked });
      },
      onSend: function (text) {
        ext.runtime.sendMessage({ type: "ROOM_OUTBOX", text: text });
      },
    });
    } catch (err) {
      console.error("Relay: room mount failed", err);
    }
  }

  refreshBtn.addEventListener("click", function () {
    if (gatherPhase === "gathering") return;
    gatherPhase = "gathering";
    setRefreshUi();
    ext.runtime.sendMessage(
      { type: "GATHER_START", collectionId: DEFAULTS.collectionId },
      function () {
        /* state pushed via GATHER_STATE */
      }
    );
  });

  ext.runtime.onMessage.addListener(function (msg) {
    if (!msg || !msg.type) return;
    if (msg.type === "GATHER_STATE") {
      gatherPhase = msg.phase || gatherPhase;
      if (msg.lastSuccessfulRefreshAt) lastRefreshAt = msg.lastSuccessfulRefreshAt;
      if (msg.phase === "complete" || msg.phase === "fresh") {
        gatherPhase = "fresh";
        lastRefreshAt = new Date().toISOString();
        try {
          ext.storage.local.set({ relay_last_refresh_at: lastRefreshAt });
        } catch (e) {}
      }
      if (msg.phase === "failed" || msg.phase === "interrupted") {
        gatherPhase = "idle";
      }
      setRefreshUi();
    }
    if (msg.type === "GROUP_CONTEXT" && roomApi) {
      roomApi.setTracked(!!msg.tracked);
    }
  });

  ext.storage.local.get(["relay_last_refresh_at"], function (data) {
    if (data.relay_last_refresh_at) lastRefreshAt = data.relay_last_refresh_at;
    setRefreshUi();
  });

  // Mount ASAP so preview works even if collection fetch stalls;
  // reload defaults when collection JSON arrives.
  mountRoom();
  setRefreshUi();
  loadCollection(function () {
    if (roomApi && roomApi.destroy) {
      try {
        roomApi.destroy();
      } catch (e) {}
    }
    mountRoom();
    setRefreshUi();
  });
})();
