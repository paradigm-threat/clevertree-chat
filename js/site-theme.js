/* Theme toggle: localStorage wins over prefers-color-scheme. */
(function () {
  var KEY = "clevertree-theme";

  function storedTheme() {
    try {
      var t = localStorage.getItem(KEY);
      if (t === "dark" || t === "light") return t;
    } catch (e) {}
    return null;
  }

  function osDark() {
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch (e2) {
      return false;
    }
  }

  function effectiveTheme() {
    var stored = storedTheme();
    if (stored) return stored;
    return osDark() ? "dark" : "light";
  }

  function applyTheme(theme, persist) {
    var next = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
      if (persist) localStorage.setItem(KEY, next);
    } catch (e3) {}
    document.documentElement.style.colorScheme = next;
    syncToggle();
    try {
      window.dispatchEvent(new CustomEvent("clevertree-themechange", { detail: { theme: next } }));
    } catch (e4) {}
  }

  function syncToggle() {
    var btn = document.querySelector(".theme-toggle");
    if (!btn) return;
    var dark = effectiveTheme() === "dark";
    btn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    btn.setAttribute("title", dark ? "Switch to light theme" : "Switch to dark theme");
    btn.setAttribute("aria-pressed", dark ? "true" : "false");
    btn.dataset.theme = dark ? "dark" : "light";
  }

  function init() {
    var stored = storedTheme();
    if (stored) {
      applyTheme(stored, false);
    } else {
      // Reflect OS without writing storage until the user toggles.
      document.documentElement.setAttribute("data-theme", osDark() ? "dark" : "light");
      document.documentElement.style.colorScheme = osDark() ? "dark" : "light";
      syncToggle();
    }

    var btn = document.querySelector(".theme-toggle");
    if (btn) {
      btn.addEventListener("click", function () {
        applyTheme(effectiveTheme() === "dark" ? "light" : "dark", true);
      });
    }

    try {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      var onOs = function () {
        if (storedTheme()) return;
        applyTheme(osDark() ? "dark" : "light", false);
      };
      if (mq.addEventListener) mq.addEventListener("change", onOs);
      else if (mq.addListener) mq.addListener(onOs);
    } catch (e5) {}
  }

  window.clevertreeTheme = {
    key: KEY,
    effective: effectiveTheme,
    apply: applyTheme,
    stored: storedTheme
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
