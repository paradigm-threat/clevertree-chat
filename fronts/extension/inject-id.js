/**
 * Announce this extension's id to the page so chat-launcher can
 * chrome.runtime.sendMessage(id, …) under externally_connectable.
 */
(function () {
  try {
    var id = chrome.runtime.id;
    if (!id) return;
    var existing = document.querySelector('meta[name="clevertree-extension-id"]');
    if (!existing) {
      var m = document.createElement("meta");
      m.setAttribute("name", "clevertree-extension-id");
      m.setAttribute("content", id);
      (document.head || document.documentElement).appendChild(m);
    } else {
      existing.setAttribute("content", id);
    }
    window.postMessage(
      { source: "clevertree-chat-extension", type: "clevertree.extension.ready", id: id },
      "*"
    );
  } catch (e) {}
})();
