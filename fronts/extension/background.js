/**
 * Clevertree Chat — side panel + page handshake + Networker batch SW.
 */
importScripts("networker-batch.js");

chrome.runtime.onInstalled.addListener(function () {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function () {});
  }
});

chrome.action.onClicked.addListener(async function (tab) {
  if (!chrome.sidePanel || !tab || tab.windowId == null) return;
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (e) {}
});

function openSidePanel(windowId, msg, sendResponse) {
  if (!chrome.sidePanel || windowId == null) {
    sendResponse({ ok: false });
    return;
  }
  chrome.sidePanel
    .open({ windowId: windowId })
    .then(function () {
      var context = {
        type: "clevertree.chat.toggle",
        action: "context",
        url: (msg && msg.url) || "",
      };
      if (msg && msg.channel) context.channel = String(msg.channel);
      if (msg && msg.title) context.title = String(msg.title);
      chrome.runtime.sendMessage(context).catch(function () {});
      sendResponse({ ok: true, action: "open" });
    })
    .catch(function () {
      sendResponse({ ok: false });
    });
}

function handleToggleMessage(msg, sendResponse) {
  var action = (msg && msg.action) || "toggle";
  if (action === "ping") {
    sendResponse({ ok: true, action: "ping" });
    return false;
  }
  if (action === "close") {
    sendResponse({ ok: true, action: "close" });
    return false;
  }
  if (action === "open" || action === "toggle") {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var t = tabs && tabs[0];
      openSidePanel(t && t.windowId, msg, sendResponse);
    });
    return true;
  }
  sendResponse({ ok: true });
  return false;
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || msg.type !== "clevertree.chat.toggle") return;
  return handleToggleMessage(msg, sendResponse);
});

chrome.runtime.onMessageExternal.addListener(function (msg, sender, sendResponse) {
  if (!msg || msg.type !== "clevertree.chat.toggle") {
    sendResponse({ ok: false });
    return;
  }
  return handleToggleMessage(msg, sendResponse);
});
