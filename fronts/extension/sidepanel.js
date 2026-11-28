/**
 * Clevertree Chat side panel — IRC room + SI panel on any website.
 * Default: #web + [[d:domain]]. Product hosts map via channel-route.
 * Networker chrome only when Options sets networkerEnabled.
 * Gather (Nextdoor): hash-diff → consent → Bunny inbox → optional public chat link.
 */
(function () {
  "use strict";

  var API_BASE = "https://api.clevertree.chat";
  var PUBLIC_CHAT_TOPIC = "ga-savannah-cat-rescue";
  var LAST_LOCAL_HASH_KEY = "mpx_last_local_batch_hash";
  var AUTO_UPLOAD_POST_KEY = "mpx_auto_upload_post";
  var root = document.getElementById("room-root");
  var api = null;
  var gathering = false;
  var lastLocalBatchHash = null;
  var autoUploadPost = false;
  /* Sticky manual channel for the current tab URL until the user browses elsewhere. */
  var stickyRouteUrl = "";
  var stickyChannel = "";
  var stickyTitle = "";

  function normalizeTabUrl(tabUrl) {
    try {
      var u = new URL(tabUrl || "https://example.com/");
      u.hash = "";
      return u.toString();
    } catch (e) {
      return String(tabUrl || "https://example.com/");
    }
  }

  function qs(tabUrl) {
    return CleverTreeChannelRoute.routeForUrl(tabUrl || "https://example.com/");
  }

  function clearSticky() {
    stickyRouteUrl = "";
    stickyChannel = "";
    stickyTitle = "";
  }

  function setSticky(tabUrl, channel, title) {
    stickyRouteUrl = normalizeTabUrl(tabUrl);
    stickyChannel = String(channel || "").trim();
    stickyTitle = String(title || "").trim();
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

  function activeTab(cb) {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        cb((tabs && tabs[0]) || null);
      });
    } catch (e) {
      cb(null);
    }
  }

  function sendTab(tabId, msg) {
    return new Promise(function (resolve) {
      chrome.tabs.sendMessage(tabId, msg, function (res) {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(res || { ok: false });
      });
    });
  }

  function sendBg(msg) {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage(msg, function (res) {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(res || { ok: false });
      });
    });
  }

  function ensureNextdoorContent(tab) {
    return new Promise(function (resolve) {
      if (!tab || !tab.id) {
        resolve({ ok: false, error: "no_tab" });
        return;
      }
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id },
          files: [
            "lib/scrub.js",
            "lib/topics.js",
            "lib/external-id.js",
            "content-nextdoor.js",
          ],
        },
        function () {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve({ ok: true });
        }
      );
    });
  }

  async function postInboxLinkToPublicChat(uploadRes, batch) {
    var body = uploadRes && uploadRes.response;
    var objectId =
      (body && (body.object_id || body.id)) ||
      (batch && batch.content_hash) ||
      "";
    var url =
      (body && (body.meta_url || body.url || (body.urls && body.urls[0]))) ||
      "";
    var marker = objectId
      ? "[[mp:inbox id=" +
        objectId +
        " kind=networker" +
        (url ? " url=" + url : "") +
        "]]"
      : url
        ? "[[mp:inbox kind=networker url=" + url + "]]"
        : "";
    if (!marker) return { ok: false, error: "no_inbox_link" };
    var text =
      "Networker harvest ready (" +
      ((batch && batch.stats && batch.stats.ticket_count) || 0) +
      " topics) " +
      marker;
    try {
      var visitor =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "00000000-0000-4000-8000-" +
            String(Date.now()).slice(-12).padStart(12, "0");
      var inboxRefs = [];
      if (objectId) inboxRefs.push(String(objectId));
      if (url) inboxRefs.push(String(url));
      var res = await fetch(API_BASE + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          topic: PUBLIC_CHAT_TOPIC,
          body: text,
          visitor: visitor,
          name: "networker",
          source: "extension",
          inbox_refs: inboxRefs,
        }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) return { ok: false, error: data.error || "chat_" + res.status };
      return { ok: true, data: data };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }

  async function rememberLocalHash(hash) {
    if (!hash) return;
    lastLocalBatchHash = hash;
    await chrome.storage.local.set(
      (function () {
        var o = {};
        o[LAST_LOCAL_HASH_KEY] = hash;
        return o;
      })()
    );
  }

  function waitTabComplete(tabId, timeoutMs) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        try {
          chrome.tabs.onUpdated.removeListener(onUp);
        } catch (e) {}
        resolve(false);
      }, timeoutMs || 25000);
      function onUp(id, info) {
        if (id !== tabId || info.status !== "complete") return;
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
          chrome.tabs.onUpdated.removeListener(onUp);
        } catch (e2) {}
        resolve(true);
      }
      chrome.tabs.onUpdated.addListener(onUp);
      chrome.tabs.get(tabId, function (t) {
        if (chrome.runtime.lastError) return;
        if (t && t.status === "complete" && !done) {
          /* already complete — still wait briefly for navigation we just kicked */
        }
      });
    });
  }

  /**
   * Always hard-refresh Nextdoor after gather so stacked post overlays are gone.
   * Past recommendation: deep walk stacks /p/ modals — navigate to group + bypass-cache reload.
   */
  async function cleanupNextdoorAfterDeep(tab, source) {
    if (!tab || !tab.id) return;
    var groupId = (source && source.group_secure_id) || null;
    if (!groupId) {
      try {
        var m = String(tab.url || "").match(/\/g\/([^/?#]+)/);
        if (m) groupId = m[1];
      } catch (e) {}
    }
    try {
      if (groupId) {
        await new Promise(function (resolve, reject) {
          chrome.tabs.update(
            tab.id,
            {
              url:
                "https://nextdoor.com/g/" +
                groupId +
                "/?_mpx=" +
                Date.now(),
            },
            function () {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
              }
              resolve();
            }
          );
        });
        await waitTabComplete(tab.id, 25000);
      }
      await new Promise(function (resolve, reject) {
        chrome.tabs.reload(tab.id, { bypassCache: true }, function () {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        });
      });
      await waitTabComplete(tab.id, 25000);
    } catch (e) {
      try {
        chrome.tabs.reload(tab.id, { bypassCache: true });
      } catch (e2) {}
    }
  }

  async function handleGather() {
    if (gathering) return;
    gathering = true;
    if (api && api.setNetworkerBusy) api.setNetworkerBusy(true);
    var tab = null;
    var deep = null;

    try {
      tab = await new Promise(function (resolve) {
        activeTab(resolve);
      });
      if (!tab || !/nextdoor\.com/i.test(tab.url || "")) {
        alert(
          "Open a Nextdoor group feed tab, then press Gather. Networker harvest runs in the host tab."
        );
        return;
      }

      await ensureNextdoorContent(tab);
      deep = await sendTab(tab.id, {
        type: "MPX_DEEP_CAPTURE",
        lookbackDays: null,
      });
      // Always wipe stacked post screens after a deep attempt (success or fail).
      await cleanupNextdoorAfterDeep(tab, deep && deep.source);

      if (!deep || !deep.ok) {
        alert(
          "Gather failed: " +
            ((deep && (deep.error || deep.message)) || "unknown") +
            "\nNextdoor was refreshed so open posts are cleared."
        );
        return;
      }

      await sendBg({
        type: "MPX_MERGE_HARVEST",
        source: deep.source,
        threads: deep.threads || [],
        debug: deep.debug || [],
        dom_probe: deep.dom_probe,
        capture_summary: deep.capture_summary,
      });
      var ready = await sendBg({ type: "MPX_MARK_READY" });
      var batch = (ready && ready.batch) || null;
      var hash = (batch && batch.content_hash) || "";
      var posts =
        (deep.capture_summary && deep.capture_summary.threads) ||
        (deep.threads && deep.threads.length) ||
        0;

      if (lastLocalBatchHash && hash && hash === lastLocalBatchHash) {
        alert(
          "Gather complete — same as last local batch (" +
            hash.slice(0, 12) +
            "). Nothing new to upload.\nNextdoor was refreshed."
        );
        return;
      }

      var consent = {
        confirmed: true,
        postPublic: true,
        autoFuture: autoUploadPost,
      };
      if (!autoUploadPost && api && api.showBatchConsent) {
        consent = await api.showBatchConsent({
          contentHash: hash,
          posts: posts,
        });
        if (!consent.confirmed) {
          await rememberLocalHash(hash);
          return;
        }
        if (consent.autoFuture) {
          autoUploadPost = true;
          await chrome.storage.local.set(
            (function () {
              var o = {};
              o[AUTO_UPLOAD_POST_KEY] = true;
              return o;
            })()
          );
        }
      } else if (!autoUploadPost) {
        var ok = window.confirm(
          "New batch (" +
            posts +
            " posts). Upload to inbox and post the link in the public chat?"
        );
        consent = { confirmed: ok, postPublic: ok, autoFuture: false };
        if (!ok) {
          await rememberLocalHash(hash);
          return;
        }
      }

      var up = await sendBg({ type: "MPX_UPLOAD" });
      await rememberLocalHash(hash);
      if (!up || !up.ok) {
        alert(
          "Upload failed: " +
            ((up && (up.message || up.error)) || "unknown")
        );
        return;
      }
      if (consent.postPublic) {
        var posted = await postInboxLinkToPublicChat(up, batch);
        if (posted.ok) {
          alert("Uploaded and posted inbox link to #" + PUBLIC_CHAT_TOPIC);
        } else {
          alert(
            "Uploaded, but public chat post failed: " +
              (posted.error || "unknown")
          );
        }
      } else {
        alert("Uploaded to inbox (not posted to public chat)");
      }
    } finally {
      gathering = false;
      if (api && api.setNetworkerBusy) api.setNetworkerBusy(false);
    }
  }

  function mount(tabUrl, networker, override) {
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
      override = override || {};
      var normUrl = normalizeTabUrl(tabUrl);
      if (stickyRouteUrl && stickyRouteUrl !== normUrl) {
        clearSticky();
      }
      /* Page handoff (Toggle Extension) may force a channel for this URL. */
      var forcedChannel = String(override.channel || "").trim();
      var forcedTitle = String(override.title || "").trim();
      if (forcedChannel) {
        setSticky(tabUrl, forcedChannel, forcedTitle);
      }
      var route = qs(tabUrl);
      var ctx = {};
      if (route.topicId !== null && route.topicId !== undefined) ctx.topicId = route.topicId;
      if (route.domain) ctx.domain = route.domain;
      // On Nextdoor with Networker, prefer the craft collection room.
      var channel = route.channel;
      var title = route.title;
      var mountOpts = {
        mode: "sidepanel",
        channel: channel,
        title: title,
        context: ctx,
        showNetworker: !!networker,
        networkerDisabled: !!override.networkerDisabled,
        apiBase: API_BASE,
        wsUrl: wsFor(channel),
        nick: (function () {
          try {
            return localStorage.getItem("clevertree.nick") || "";
          } catch (e) {
            return "";
          }
        })(),
        onGather: networker ? handleGather : undefined,
        onRefresh: networker ? handleGather : undefined,
        onTrack: networker
          ? function (tracked) {
              chrome.storage.local.set({ ct_tracked: !!tracked });
            }
          : undefined,
        onChannelChange: function (ch) {
          var next = String(ch || "").trim();
          if (!next) return;
          setSticky(tabUrl, next, "");
        },
      };
      if (networker && /nextdoor\.com/i.test(tabUrl || "")) {
        channel = "#ga-savannah-cat-rescue";
        title = "Savannah Cat Rescue";
        ctx.collection = "savannah-cat-rescue";
        mountOpts.channel = channel;
        mountOpts.title = title;
        mountOpts.context = ctx;
        mountOpts.wsUrl = wsFor(channel);
        mountOpts.siteOrigin = "https://myproblem.app";
        mountOpts.siMarkdownPath =
          "hooks/client/si/ga-savannah-cat-rescue/panel.md";
        mountOpts.aiOpen = true;
      }
      /* Same URL + sticky (manual pick or page-forced channel). */
      if (
        stickyChannel &&
        stickyRouteUrl === normUrl &&
        stickyChannel !== channel
      ) {
        channel = stickyChannel;
        if (stickyTitle) title = stickyTitle;
        mountOpts.channel = channel;
        mountOpts.title = title;
        mountOpts.wsUrl = wsFor(channel);
      }
      api = CleverTreeRoom.mount(root, mountOpts);
    } catch (err) {
      fail((err && err.message) || String(err));
    }
  }

  function activeTabUrl(cb) {
    activeTab(function (t) {
      cb((t && t.url) || "https://example.com/");
    });
  }

  function boot() {
    chrome.storage.local.get(
      [LAST_LOCAL_HASH_KEY, AUTO_UPLOAD_POST_KEY],
      function (local) {
        if (local[LAST_LOCAL_HASH_KEY]) {
          lastLocalBatchHash = String(local[LAST_LOCAL_HASH_KEY]);
        }
        autoUploadPost = !!local[AUTO_UPLOAD_POST_KEY];
        chrome.storage.sync.get({ networkerEnabled: false }, function (data) {
          activeTabUrl(function (url) {
            var allowed =
              window.MyProblemSocialHosts &&
              MyProblemSocialHosts.isAllowed(url);
            mount(url, !!data.networkerEnabled && !!allowed, {
              networkerDisabled: !!data.networkerEnabled && !allowed,
            });
          });
        });
      }
    );
  }

  chrome.runtime.onMessage.addListener(function (msg) {
    if (!msg || msg.type !== "clevertree.chat.toggle") return;
    if (msg.action === "open" || msg.action === "context") {
      chrome.storage.sync.get({ networkerEnabled: false }, function (data) {
        var url = msg.url || "https://example.com/";
        var allowed =
          window.MyProblemSocialHosts && MyProblemSocialHosts.isAllowed(url);
        mount(url, !!data.networkerEnabled && !!allowed, {
          channel: msg.channel || "",
          title: msg.title || "",
          networkerDisabled: !!data.networkerEnabled && !allowed,
        });
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
