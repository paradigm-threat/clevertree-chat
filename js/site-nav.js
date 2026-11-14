/* Mobile hamburger for marketing site headers. */
(function () {
  function init() {
    const toggle = document.querySelector(".nav-toggle");
    const nav = document.getElementById("site-nav");
    if (!toggle || !nav) return;

    function setOpen(open) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.classList.toggle("nav-open", open);
      if (open) {
        const first = nav.querySelector("a");
        if (first) first.focus();
      } else {
        toggle.focus();
      }
    }

    function isOpen() {
      return toggle.getAttribute("aria-expanded") === "true";
    }

    toggle.addEventListener("click", function () {
      setOpen(!isOpen());
    });

    nav.addEventListener("click", function (e) {
      if (e.target && e.target.closest("a")) setOpen(false);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen()) setOpen(false);
    });

    document.addEventListener("click", function (e) {
      if (!isOpen()) return;
      if (toggle.contains(e.target) || nav.contains(e.target)) return;
      setOpen(false);
    });

    try {
      const mq = window.matchMedia("(min-width: 801px)");
      const onWide = function () {
        if (mq.matches && isOpen()) setOpen(false);
      };
      if (mq.addEventListener) mq.addEventListener("change", onWide);
      else if (mq.addListener) mq.addListener(onWide);
    } catch (err) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
