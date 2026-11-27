/**
 * Legacy board widget — retired.
 * Debate board is now IRC room + SI panel (`fronts/room` + chat-launcher).
 * This stub boots the room launcher so old mounts keep working.
 */
(function (global) {
  "use strict";
  function boot() {
    if (global.ClevertreeChatLauncher && global.ClevertreeChatLauncher.mountButton) {
      global.ClevertreeChatLauncher.mountButton(null, {
        apiBase: "https://api.clevertree.chat",
      });
      return;
    }
    var s = document.createElement("script");
    s.src = "https://api.clevertree.chat/fronts/room/chat-launcher.js";
    s.onload = function () {
      if (global.ClevertreeChatLauncher) {
        global.ClevertreeChatLauncher.mountButton(null, {
          apiBase: "https://api.clevertree.chat",
        });
      }
    };
    document.head.appendChild(s);
  }
  global.ClevertreeBoard = {
    boot: boot,
    mount: function () {
      boot();
    },
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(typeof window !== "undefined" ? window : this);
