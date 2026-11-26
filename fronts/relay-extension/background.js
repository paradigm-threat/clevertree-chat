/**
 * Relay MV3 service worker — side panel open + gather job coordination.
 * Host-page gather implementation may delegate to MyProblem capture engine later;
 * this worker owns Refresh state so the room never blocks.
 */
"use strict";

chrome.runtime.onInstalled.addListener(function () {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function () {});
  }
});

chrome.action.onClicked.addListener(function (tab) {
  if (chrome.sidePanel && chrome.sidePanel.open && tab && tab.windowId != null) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(function () {});
  }
});

var gather = {
  phase: "idle",
  jobId: null,
  collectionId: null,
  completed: 0,
  total: 0,
};

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(function () {});
}

function setPhase(phase, extra) {
  gather.phase = phase;
  var payload = Object.assign(
    {
      type: "GATHER_STATE",
      phase: phase,
      jobId: gather.jobId,
      collectionId: gather.collectionId,
      completed: gather.completed,
      total: gather.total,
    },
    extra || {}
  );
  broadcast(payload);
}

chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
  if (!msg || !msg.type) return;

  if (msg.type === "GATHER_START") {
    if (gather.phase === "gathering") {
      sendResponse({ ok: false, reason: "busy" });
      return true;
    }
    gather.jobId = "job-" + Date.now();
    gather.collectionId = msg.collectionId || null;
    gather.completed = 0;
    gather.total = msg.total || 1;
    setPhase("gathering");

    // Simulate walk until MyProblem content-script gather is wired from this package.
    // Production: message active tab content script to deepCapture / automateAll.
    var jobId = gather.jobId;
    var steps = gather.total;
    var i = 0;
    var timer = setInterval(function () {
      if (gather.jobId !== jobId) {
        clearInterval(timer);
        return;
      }
      i += 1;
      gather.completed = i;
      setPhase("gathering", { completed: i, total: steps });
      if (i >= steps) {
        clearInterval(timer);
        var iso = new Date().toISOString();
        chrome.storage.local.set({ relay_last_refresh_at: iso });
        setPhase("complete", { lastSuccessfulRefreshAt: iso });
        gather.phase = "idle";
      }
    }, 400);

    // Ask content script if present (MyProblem / Nextdoor).
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab || !tab.id) return;
      chrome.tabs
        .sendMessage(tab.id, {
          type: "RELAY_GATHER",
          jobId: gather.jobId,
          collectionId: gather.collectionId,
        })
        .catch(function () {
          /* no content script — demo timer still completes */
        });
    });

    sendResponse({ ok: true, jobId: gather.jobId });
    return true;
  }

  if (msg.type === "GATHER_STOP") {
    gather.jobId = null;
    setPhase("interrupted");
    gather.phase = "idle";
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "TRACK_GROUP" || msg.type === "ROOM_OUTBOX") {
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
