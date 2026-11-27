(function () {
  "use strict";
  var nw = document.getElementById("networker");
  var theme = document.getElementById("theme");
  var saved = document.getElementById("saved");

  function flash() {
    saved.hidden = false;
    setTimeout(function () {
      saved.hidden = true;
    }, 1200);
  }

  chrome.storage.sync.get(
    { networkerEnabled: false, roomTheme: "system" },
    function (data) {
      nw.checked = !!data.networkerEnabled;
      theme.value = data.roomTheme || "system";
    }
  );

  nw.addEventListener("change", function () {
    chrome.storage.sync.set({ networkerEnabled: nw.checked }, flash);
  });
  theme.addEventListener("change", function () {
    var v = theme.value;
    chrome.storage.sync.set({ roomTheme: v }, function () {
      try {
        if (v === "system") localStorage.removeItem("clevertree.room.theme");
        else localStorage.setItem("clevertree.room.theme", v);
      } catch (e) {}
      flash();
    });
  });
})();
