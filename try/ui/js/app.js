(function () {
  const Core = window.ClevertreeUiLabCore;
  const renderers = {
    board: window.ClevertreeUiLabBoard,
    shelf: window.ClevertreeUiLabShelf,
    reading: window.ClevertreeUiLabReading,
    canvas: window.ClevertreeUiLabCanvas,
    hybrid: window.ClevertreeUiLabHybrid,
  };

  function uiFromQuery() {
    const params = new URLSearchParams(location.search);
    const id = (params.get("ui") || "board").toLowerCase();
    return renderers[id] ? id : "board";
  }

  function metaFor(id) {
    return (
      Core.INTERFACES.find(function (i) {
        return i.id === id;
      }) || Core.INTERFACES[0]
    );
  }

  function buildSwitcher(current) {
    const nav = document.getElementById("ui-switcher");
    if (!nav) return;
    nav.innerHTML = Core.INTERFACES.map(function (i) {
      const on = i.id === current ? ' aria-current="page"' : "";
      return (
        '<a class="ui-switch' +
        (i.id === current ? " is-active" : "") +
        '" href="?ui=' +
        encodeURIComponent(i.id) +
        '"' +
        on +
        '><span class="ui-letter">' +
        i.letter +
        "</span> " +
        i.name +
        "</a>"
      );
    }).join("");
  }

  const store = Core.createStore();
  let currentUi = uiFromQuery();
  const mount = document.getElementById("ui-mount");
  const widthLabel = document.getElementById("width-mode");
  const demoLabel = document.getElementById("demo-mode-label");

  function updateChrome() {
    if (widthLabel && mount) {
      const w = mount.clientWidth;
      widthLabel.textContent =
        w < 720
          ? "Layout: mobile / narrow (" + w + "px)"
          : "Layout: desktop (" + w + "px)";
    }
    if (demoLabel) {
      demoLabel.textContent = store.demoMode
        ? "Demo mode on · pauses after each submit→update"
        : "Demo mode off · continuous updates";
    }
  }

  function rerender() {
    const meta = metaFor(currentUi);
    const renderer = renderers[currentUi];
    if (!renderer || !mount) return;
    renderer.render(mount, store, meta);
    updateChrome();
  }

  buildSwitcher(currentUi);
  Core.bindShared(mount, store, rerender);
  rerender();

  if (window.ResizeObserver) {
    new ResizeObserver(updateChrome).observe(mount);
  }
  window.addEventListener("resize", updateChrome);
})();
