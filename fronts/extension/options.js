(function () {
  "use strict";
  var COALESCE_KEY = "clevertree.room.coalesce";
  var DEFAULT_GAP = 15;
  var nw = document.getElementById("networker");
  var theme = document.getElementById("theme");
  var coalesceMode = document.getElementById("coalesce-mode");
  var coalesceGap = document.getElementById("coalesce-gap");
  var saved = document.getElementById("saved");

  function flash() {
    saved.hidden = false;
    setTimeout(function () {
      saved.hidden = true;
    }, 1200);
  }

  function normalizeMode(mode, enabledLegacy) {
    mode = String(mode || "").toLowerCase();
    if (mode === "normal" || mode === "combined" || mode === "paragraph") {
      return mode;
    }
    return enabledLegacy ? "combined" : "normal";
  }

  function readCoalesceLocal() {
    try {
      var raw = localStorage.getItem(COALESCE_KEY);
      if (!raw) return { mode: "normal", gapMinutes: DEFAULT_GAP };
      var parsed = JSON.parse(raw);
      var gap = Number(parsed && parsed.gapMinutes);
      if (!isFinite(gap) || gap < 1) gap = DEFAULT_GAP;
      if (gap > 120) gap = 120;
      return {
        mode: normalizeMode(parsed && parsed.mode, parsed && parsed.enabled),
        gapMinutes: Math.round(gap),
      };
    } catch (e) {
      return { mode: "normal", gapMinutes: DEFAULT_GAP };
    }
  }

  function writeCoalesceLocal(prefs) {
    try {
      localStorage.setItem(COALESCE_KEY, JSON.stringify(prefs));
    } catch (e) {}
  }

  function syncGapDisabled() {
    if (coalesceGap) {
      coalesceGap.disabled =
        !coalesceMode || coalesceMode.value === "normal";
    }
  }

  function saveCoalesce() {
    var gap = Number(coalesceGap && coalesceGap.value);
    if (!isFinite(gap) || gap < 1) gap = DEFAULT_GAP;
    if (gap > 120) gap = 120;
    var prefs = {
      mode: normalizeMode(coalesceMode && coalesceMode.value),
      gapMinutes: Math.round(gap),
    };
    writeCoalesceLocal(prefs);
    chrome.storage.sync.set(
      {
        roomCoalesceMode: prefs.mode,
        roomCoalesceGapMinutes: prefs.gapMinutes,
      },
      flash
    );
    syncGapDisabled();
  }

  chrome.storage.sync.get(
    {
      networkerEnabled: false,
      roomTheme: "system",
      roomCoalesceMode: "",
      roomCoalesceEnabled: false,
      roomCoalesceGapMinutes: DEFAULT_GAP,
    },
    function (data) {
      nw.checked = !!data.networkerEnabled;
      theme.value = data.roomTheme || "system";
      var local = readCoalesceLocal();
      var mode = normalizeMode(
        data.roomCoalesceMode || local.mode,
        data.roomCoalesceEnabled
      );
      var gap = Number(data.roomCoalesceGapMinutes);
      if (!isFinite(gap) || gap < 1) gap = local.gapMinutes;
      if (coalesceMode) coalesceMode.value = mode;
      if (coalesceGap) coalesceGap.value = String(Math.round(gap));
      writeCoalesceLocal({ mode: mode, gapMinutes: Math.round(gap) });
      syncGapDisabled();
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
  if (coalesceMode) coalesceMode.addEventListener("change", saveCoalesce);
  if (coalesceGap) coalesceGap.addEventListener("change", saveCoalesce);
})();
