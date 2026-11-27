/**
 * Clevertree Chat — side panel + page handshake (clevertree.chat.toggle).
 */
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

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || msg.type !== "clevertree.chat.toggle") return;
  var action = msg.action || "toggle";
  function openPanel(windowId) {
    if (!chrome.sidePanel || windowId == null) {
      sendResponse({ ok: false });
      return;
    }
    chrome.sidePanel
      .open({ windowId: windowId })
      .then(function () {
        chrome.runtime.sendMessage({
          type: "clevertree.chat.toggle",
          action: "context",
          url: msg.url || "",
        }).catch(function () {});
        sendResponse({ ok: true, action: "open" });
      })
      .catch(function () {
        sendResponse({ ok: false });
      });
  }
  if (action === "open" || action === "toggle") {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var t = tabs && tabs[0];
      openPanel(t && t.windowId);
    });
    return true;
  }
  if (action === "close") {
    sendResponse({ ok: true, action: "close" });
    return;
  }
  sendResponse({ ok: true });
});

chrome.runtime.onMessageExternal.addListener(function (msg, sender, sendResponse) {
  if (!msg || msg.type !== "clevertree.chat.toggle") {
    sendResponse({ ok: false });
    return;
  }
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var t = tabs && tabs[0];
    if (!chrome.sidePanel || !t || t.windowId == null) {
      sendResponse({ ok: false });
      return;
    }
    chrome.sidePanel
      .open({ windowId: t.windowId })
      .then(function () {
        sendResponse({ ok: true });
      })
      .catch(function () {
        sendResponse({ ok: false });
      });
  });
  return true;
});
