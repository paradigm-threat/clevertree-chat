/**
 * Clevertree Chat marketing chrome — theme + SI preview toggles.
 * Bridges kit key `ct-theme` with room key `clevertree.room.theme`.
 */
(function () {
  "use strict";

  var SITE_KEY = "ct-theme";
  var ROOM_KEY = "clevertree.room.theme";
  var root = document.documentElement;
  var params = new URLSearchParams(location.search);

  function readPref() {
    try {
      var q = params.get("theme");
      if (q === "light" || q === "dark") return q;
      var site = localStorage.getItem(SITE_KEY);
      if (site === "light" || site === "dark" || site === "system") return site;
      var room = localStorage.getItem(ROOM_KEY);
      if (room === "light" || room === "dark" || room === "system") return room;
    } catch (e) {}
    return "system";
  }

  function writePref(pref) {
    try {
      localStorage.setItem(SITE_KEY, pref);
      if (pref === "system") localStorage.removeItem(ROOM_KEY);
      else localStorage.setItem(ROOM_KEY, pref);
    } catch (e) {}
    try {
      window.dispatchEvent(new CustomEvent("clevertree-themechange", { detail: pref }));
    } catch (e2) {}
  }

  function isDark() {
    var t = root.dataset.theme || "system";
    if (t === "dark") return true;
    if (t === "light") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function syncButtons() {
    document.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
      var label = isDark() ? "Switch to light theme" : "Switch to dark theme";
      b.setAttribute("aria-label", label);
      b.title = label;
      b.textContent = isDark() ? "☀" : "◐";
    });
  }

  var pref = readPref();
  root.dataset.theme = pref;
  writePref(pref);
  syncButtons();

  document.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
    b.addEventListener("click", function () {
      root.dataset.theme = isDark() ? "light" : "dark";
      writePref(root.dataset.theme);
      syncButtons();
    });
  });

  document.querySelectorAll("[data-panel]").forEach(function (b) {
    b.addEventListener("click", function () {
      var room = b.closest(".room");
      if (!room) return;
      var off = room.classList.toggle("panel-off");
      b.setAttribute("aria-expanded", String(!off));
    });
  });

  if (window.matchMedia) {
    try {
      window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", syncButtons);
    } catch (e3) {}
  }
})();
