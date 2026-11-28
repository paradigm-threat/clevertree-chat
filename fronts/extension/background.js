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

function openSidePanel(windowId, msg, sendResponse) {
  if (!chrome.sidePanel || windowId == null) {
    sendResponse({ ok: false });
    return;
  }
  chrome.sidePanel
    .open({ windowId: windowId })
    .then(function () {
      chrome.runtime
        .sendMessage({
          type: "clevertree.chat.toggle",
          action: "context",
          url: (msg && msg.url) || "",
        })
        .catch(function () {});
      sendResponse({ ok: true, action: "open" });
    })
    .catch(function () {
      sendResponse({ ok: false });
    });
}

function handleToggleMessage(msg, sendResponse) {
  var action = (msg && msg.action) || "toggle";
  // Quiet presence check — never opens the panel.
  if (action === "ping") {
    sendResponse({ ok: true, action: "ping" });
    return false;
  }
  if (action === "close") {
    // Chromium has no reliable sidePanel.close; ACK only.
    sendResponse({ ok: true, action: "close" });
    return false;
  }
  if (action === "open" || action === "toggle") {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var t = tabs && tabs[0];
      openSidePanel(t && t.windowId, msg, sendResponse);
    });
    return true; // async
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
