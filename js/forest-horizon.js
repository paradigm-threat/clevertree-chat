/* Code presets for the /forest overlapping horizon forest. */
(function (global) {
  // Stable scenic stand: far→near via depth; smaller scale = farther.
  // leafPalette picks a named foliage range from TREE_LEAF_PALETTES.
  const FOREST = [
    { x: 0.06, depth: 0.12, scale: 0.34, duration: 16000, habit: 0.15, branchiness: 0.28, asymmetry: 0.55, leanSign: -1, sideBias: -1, seed: 101, leafPalette: "pine" },
    { x: 0.18, depth: 0.18, scale: 0.38, duration: 15000, habit: 0.85, branchiness: 0.72, asymmetry: 0.35, leanSign: 1, sideBias: 1, seed: 202, leafPalette: "birch" },
    { x: 0.28, depth: 0.15, scale: 0.36, duration: 17000, habit: 0.05, branchiness: 0.32, asymmetry: 0.7, leanSign: -1, sideBias: 1, seed: 303, leafPalette: "pine" },
    { x: 0.4, depth: 0.22, scale: 0.4, duration: 14000, habit: 0.55, branchiness: 0.45, asymmetry: 0.4, leanSign: 1, sideBias: -1, seed: 404, leafPalette: "oak" },
    { x: 0.52, depth: 0.1, scale: 0.32, duration: 18000, habit: 0.92, branchiness: 0.8, asymmetry: 0.25, leanSign: -1, sideBias: -1, seed: 505, leafPalette: "summer" },
    { x: 0.64, depth: 0.2, scale: 0.37, duration: 15500, habit: 0.25, branchiness: 0.35, asymmetry: 0.8, leanSign: 1, sideBias: 1, seed: 606, leafPalette: "maple" },
    { x: 0.76, depth: 0.14, scale: 0.35, duration: 16500, habit: 0.7, branchiness: 0.55, asymmetry: 0.5, leanSign: -1, sideBias: 1, seed: 707, leafPalette: "birch" },
    { x: 0.9, depth: 0.16, scale: 0.36, duration: 14500, habit: 0.1, branchiness: 0.3, asymmetry: 0.65, leanSign: 1, sideBias: -1, seed: 808, leafPalette: "pine" },

    { x: 0.1, depth: 0.42, scale: 0.52, duration: 13000, habit: 0.4, branchiness: 0.5, asymmetry: 0.45, leanSign: -1, sideBias: -1, seed: 909, leafPalette: "maple" },
    { x: 0.24, depth: 0.48, scale: 0.55, duration: 12500, habit: 0.08, branchiness: 0.38, asymmetry: 0.75, leanSign: 1, sideBias: 1, seed: 1010, leafPalette: "oak" },
    { x: 0.38, depth: 0.4, scale: 0.5, duration: 13500, habit: 0.95, branchiness: 0.78, asymmetry: 0.3, leanSign: -1, sideBias: 1, seed: 1111, leafPalette: "aspen" },
    { x: 0.5, depth: 0.45, scale: 0.54, duration: 12000, habit: 0.3, branchiness: 0.42, asymmetry: 0.6, leanSign: 1, sideBias: -1, seed: 1212, leafPalette: "summer" },
    { x: 0.62, depth: 0.38, scale: 0.5, duration: 14000, habit: 0.65, branchiness: 0.6, asymmetry: 0.4, leanSign: -1, sideBias: -1, seed: 1313, leafPalette: "aspen" },
    { x: 0.78, depth: 0.5, scale: 0.56, duration: 11800, habit: 0.18, branchiness: 0.36, asymmetry: 0.7, leanSign: 1, sideBias: 1, seed: 1414, leafPalette: "summer" },
    { x: 0.92, depth: 0.44, scale: 0.52, duration: 12800, habit: 0.8, branchiness: 0.7, asymmetry: 0.55, leanSign: -1, sideBias: 1, seed: 1515, leafPalette: "birch" },

    { x: 0.14, depth: 0.72, scale: 0.72, duration: 11000, habit: 0.12, branchiness: 0.4, asymmetry: 0.65, leanSign: -1, sideBias: -1, seed: 1616, leafPalette: "oak" },
    { x: 0.32, depth: 0.8, scale: 0.82, duration: 10000, habit: 0.88, branchiness: 0.75, asymmetry: 0.35, leanSign: 1, sideBias: 1, seed: 1717, leafPalette: "maple" },
    { x: 0.48, depth: 0.78, scale: 0.78, duration: 10500, habit: 0.22, branchiness: 0.48, asymmetry: 0.8, leanSign: -1, sideBias: 1, seed: 1818, leafPalette: "summer" },
    { x: 0.66, depth: 0.85, scale: 0.88, duration: 9500, habit: 0.5, branchiness: 0.55, asymmetry: 0.45, leanSign: 1, sideBias: -1, seed: 1919, leafPalette: "birch" },
    { x: 0.84, depth: 0.74, scale: 0.74, duration: 11200, habit: 0.05, branchiness: 0.34, asymmetry: 0.7, leanSign: -1, sideBias: -1, seed: 2020, leafPalette: "autumn" },
    { x: 0.58, depth: 0.92, scale: 0.98, duration: 9000, habit: 0.35, branchiness: 0.5, asymmetry: 0.55, leanSign: 1, sideBias: 1, seed: 2121, leafPalette: "autumn" },
    { x: 0.22, depth: 0.88, scale: 0.9, duration: 9800, habit: 0.75, branchiness: 0.68, asymmetry: 0.4, leanSign: -1, sideBias: 1, seed: 2222, leafPalette: "fall" }
  ];

  const MOBILE_MQ = "(max-width: 460px)";
  const MOBILE_MAX_TREES = 8;

  function isMobileForestViewport() {
    return typeof global.matchMedia === "function" &&
      global.matchMedia(MOBILE_MQ).matches;
  }

  function sampleBand(band, n) {
    if (n <= 0 || !band.length) return [];
    if (band.length <= n) return band.slice();
    const out = [];
    const last = band.length - 1;
    for (let i = 0; i < n; i++) {
      out.push(band[Math.round((i * last) / Math.max(1, n - 1))]);
    }
    return out;
  }

  /**
   * Depth-banded subset with x-spread (ends of each band) so mobile
   * keeps far/mid/near without crowding the center.
   */
  function pickStand(entries, maxTrees) {
    if (!maxTrees || maxTrees >= entries.length) return entries.slice();
    const far = entries.filter(function (e) { return e.depth < 0.33; })
      .sort(function (a, b) { return a.x - b.x; });
    const mid = entries.filter(function (e) { return e.depth >= 0.33 && e.depth < 0.66; })
      .sort(function (a, b) { return a.x - b.x; });
    // Prefer the deepest near trees (true foreground), then spread by x.
    const nearDeep = entries.filter(function (e) { return e.depth >= 0.66; })
      .sort(function (a, b) { return b.depth - a.depth; });

    const farN = Math.max(1, Math.round(maxTrees * 0.375));
    const nearN = Math.max(1, Math.round(maxTrees * 0.25));
    const midN = Math.max(1, maxTrees - farN - nearN);

    const nearPool = nearDeep
      .slice(0, Math.max(nearN * 2, Math.ceil(nearDeep.length * 0.6)))
      .sort(function (a, b) { return a.x - b.x; });

    return sampleBand(far, farN)
      .concat(sampleBand(mid, midN), sampleBand(nearPool, nearN))
      .slice(0, maxTrees);
  }

  function plantForestHorizon(root, opts) {
    const options = opts || {};
    const reduce = !!options.reduce;
    const performance = !!options.performance;
    const grow = typeof options.grow === "function" ? options.grow : global.growHillTree;
    if (!root || typeof grow !== "function") return 0;

    if (root._forestIO && typeof root._forestIO.disconnect === "function") {
      root._forestIO.disconnect();
      root._forestIO = null;
    }

    root.innerHTML = "";
    root.classList.add("forest-horizon");

    const mobile = options.mobile != null ? !!options.mobile : isMobileForestViewport();
    const maxTrees = options.maxTrees != null
      ? options.maxTrees
      : (mobile ? MOBILE_MAX_TREES : null);
    // Bleed past left/right so crowns aren't boxed inside the viewport.
    const overflowX = options.overflowX != null ? !!options.overflowX : mobile;
    // Seat trunks on hills: far higher, near lower. Mobile portrait hills need a taller rise.
    const nearFloor = options.nearFloor != null ? options.nearFloor : (mobile ? 2 : 2);
    const hillRise = options.hillRise != null ? options.hillRise : (mobile ? 48 : 32);
    const scaleMul = options.scaleMul != null ? options.scaleMul : (mobile ? 0.82 : 1);

    const sorted = pickStand(FOREST, maxTrees).sort(function (a, b) {
      return a.depth - b.depth;
    });

    sorted.forEach(function (entry) {
      const figure = document.createElement("figure");
      figure.className = "forest-tree";
      figure.setAttribute("role", "listitem");
      // Map 0…1 stand into mild overscan so edge crowns hang past the viewport.
      const x = overflowX ? entry.x * 1.22 - 0.11 : entry.x;
      figure.style.left = x * 100 + "%";
      figure.style.height = entry.scale * scaleMul * 100 + "%";
      figure.style.zIndex = String(Math.round(10 + entry.depth * 90));
      // Perspective: farther (smaller / lower depth) trees sit higher on the hillside.
      const hill = Math.max(0, Math.min(1, 1 - entry.depth));
      const bottomPct = nearFloor + hill * hillRise;
      figure.style.bottom = bottomPct + "%";

      const canvas = document.createElement("canvas");
      canvas.width = 520;
      canvas.height = 400;
      canvas.className = "forest-canvas";
      canvas.setAttribute("role", "img");
      canvas.setAttribute(
        "aria-label",
        "Tree habit " + entry.habit.toFixed(2) +
          (entry.leafPalette ? ", " + entry.leafPalette + " foliage" : "") +
          " at " + Math.round(x * 100) + "% along the horizon"
      );
      canvas.tabIndex = 0;

      figure.appendChild(canvas);
      root.appendChild(figure);

      grow(canvas, {
        reduce: reduce,
        performance: performance,
        habit: entry.habit,
        leanSign: entry.leanSign,
        branchiness: entry.branchiness,
        asymmetry: entry.asymmetry,
        sideBias: entry.sideBias,
        seed: entry.seed,
        duration: reduce || performance ? 1 : entry.duration,
        delay: 0,
        clickable: true,
        wind: "calm",
        leafPalette: entry.leafPalette,
        leafColors: entry.leafColors
      });
    });

    return sorted.length;
  }

  global.FOREST_HORIZON = FOREST;
  global.FOREST_MOBILE_MQ = MOBILE_MQ;
  global.plantForestHorizon = plantForestHorizon;
})(typeof window !== "undefined" ? window : globalThis);
