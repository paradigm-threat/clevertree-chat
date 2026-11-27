/**
 * Clevertree Chat side panel — IRC room + SI panel on any website.
 * Default: #web + [[d:domain]]. Product hosts map via channel-route.
 * Networker chrome only when Options sets networkerEnabled.
 */
(function () {
  "use strict";

  var API_BASE = "https://api.clevertree.chat";
  var root = document.getElementById("room-root");
  var api = null;

  function qs(tabUrl) {
    return CleverTreeChannelRoute.routeForUrl(tabUrl || "https://example.com/");
  }

  function wsFor(channel) {
    var topic = String(channel || "#web").replace(/^#/, "");
    return (
      "wss://api.clevertree.chat/api/chat/ws?topic=" + encodeURIComponent(topic)
    );
  }

  function fail(msg) {
    if (!root) return;
    root.innerHTML =
      '<div style="padding:1rem;font:14px/1.4 system-ui,sans-serif;color:#7a2e2e">' +
      "<strong>Clevertree Chat failed to load.</strong><br>" +
      String(msg || "Unknown error") +
      "<br><span style=\"color:#52665a;font-size:12px\">Reload the extension from chrome://extensions after syncing room assets.</span></div>";
  }

  function mount(tabUrl, networker) {
    if (!root) return;
    if (!window.CleverTreeRoom || !window.CleverTreeChannelRoute) {
      fail(
        "Room scripts missing (CleverTreeRoom / CleverTreeChannelRoute). " +
          "Run scripts/sync_extension_room.sh and reload unpacked."
      );
      return;
    }
    if (api && api.destroy) {
      try {
        api.destroy();
      } catch (e) {}
    }
    root.innerHTML = "";
    try {
      var route = qs(tabUrl);
      var ctx = {};
      if (route.topicId !== null && route.topicId !== undefined) ctx.topicId = route.topicId;
      if (route.domain) ctx.domain = route.domain;
      api = CleverTreeRoom.mount(root, {
        mode: "sidepanel",
        channel: route.channel,
        title: route.title,
        context: ctx,
        showNetworker: !!networker,
        apiBase: API_BASE,
        wsUrl: wsFor(route.channel),
        /* Let CleverTreeRoom.build default wss mirrors (bare hosts are rejected). */
        nick: "you",
      });
    } catch (err) {
      fail((err && err.message) || String(err));
    }
  }

  function activeTabUrl(cb) {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var t = tabs && tabs[0];
        cb((t && t.url) || "https://example.com/");
      });
    } catch (e) {
      cb("https://example.com/");
    }
  }

  function boot() {
    chrome.storage.sync.get({ networkerEnabled: false }, function (data) {
      activeTabUrl(function (url) {
        mount(url, data.networkerEnabled);
      });
    });
  }

  chrome.runtime.onMessage.addListener(function (msg) {
    if (!msg || msg.type !== "clevertree.chat.toggle") return;
    if (msg.action === "open" || msg.action === "context") {
      chrome.storage.sync.get({ networkerEnabled: false }, function (data) {
        mount(msg.url || "https://example.com/", data.networkerEnabled);
      });
    }
  });

  if (chrome.tabs && chrome.tabs.onActivated) {
    chrome.tabs.onActivated.addListener(function () {
      boot();
    });
  }
  if (chrome.tabs && chrome.tabs.onUpdated) {
    chrome.tabs.onUpdated.addListener(function (tabId, info, tab) {
      if (info.status === "complete" && tab && tab.active) boot();
    });
  }

  boot();
})();
