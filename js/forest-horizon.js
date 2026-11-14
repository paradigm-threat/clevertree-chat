/* Code presets for the /forest overlapping horizon forest. */
(function (global) {
  // Stable scenic stand: far→near via depth; smaller scale = farther.
  // leafPalette picks a named foliage range from TREE_LEAF_PALETTES.
  // Far band (depth < 0.33) is expanded ~10× at ~0.1× scale for a distant canopy.
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
  const FAR_MULTIPLIER = 10;
  const FAR_SCALE_DIV = 10;
  const MOBILE_FAR_MULTIPLIER = 6;

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
   * Far band is handled separately via expandFarCanopy — pickStand only
   * thins mid + near on mobile.
   */
  function pickMidNear(entries, maxMidNear) {
    const mid = entries.filter(function (e) { return e.depth >= 0.33 && e.depth < 0.66; })
      .sort(function (a, b) { return a.x - b.x; });
    const nearDeep = entries.filter(function (e) { return e.depth >= 0.66; })
      .sort(function (a, b) { return b.depth - a.depth; });

    if (!maxMidNear || mid.length + nearDeep.length <= maxMidNear) {
      return mid.concat(nearDeep);
    }

    const nearN = Math.max(1, Math.round(maxMidNear * 0.4));
    const midN = Math.max(1, maxMidNear - nearN);
    const nearPool = nearDeep
      .slice(0, Math.max(nearN * 2, Math.ceil(nearDeep.length * 0.6)))
      .sort(function (a, b) { return a.x - b.x; });

    return sampleBand(mid, midN).concat(sampleBand(nearPool, nearN)).slice(0, maxMidNear);
  }

  function hashSeed(a, b) {
    return ((a >>> 0) * 2654435761 + (b >>> 0) * 1597334677) >>> 0;
  }

  /**
   * Emit ~multiplier clones of each far template at ~1/10 scale with jittered x/depth/seed.
   */
  function expandFarCanopy(farTemplates, multiplier) {
    const out = [];
    const mul = Math.max(1, multiplier | 0);
    for (let t = 0; t < farTemplates.length; t++) {
      const base = farTemplates[t];
      for (let i = 0; i < mul; i++) {
        const salt = hashSeed(base.seed || (t + 1) * 97, i + 1);
        const u1 = ((salt >>> 0) % 10000) / 10000;
        const u2 = (((salt * 1664525 + 1013904223) >>> 0) % 10000) / 10000;
        const u3 = (((salt * 22695477 + 1) >>> 0) % 10000) / 10000;
        // Spread across the horizon; keep mild overscan room for overflowX.
        const x = (i + u1) / mul;
        const depth = 0.05 + u2 * 0.2;
        const scale = Math.max(0.028, (base.scale || 0.35) / FAR_SCALE_DIV);
        out.push({
          x: x,
          depth: depth,
          scale: scale,
          duration: base.duration || 12000,
          habit: base.habit,
          branchiness: base.branchiness,
          asymmetry: base.asymmetry,
          leanSign: base.leanSign,
          sideBias: base.sideBias,
          seed: hashSeed(base.seed || 1, salt ^ (i * 9973)),
          leafPalette: base.leafPalette,
          leafColors: base.leafColors,
          lod: "far",
          farCanopy: true
        });
        // Slight habit wobble from u3 without inventing new presets.
        if (u3 > 0.5 && out[out.length - 1].habit != null) {
          out[out.length - 1].habit = Math.max(0, Math.min(1,
            out[out.length - 1].habit + (u3 - 0.75) * 0.2));
        }
      }
    }
    return out;
  }

  function buildStandEntries(options) {
    const mobile = options.mobile;
    const farTemplates = FOREST.filter(function (e) { return e.depth < 0.33; });
    const farMul = options.farMultiplier != null
      ? options.farMultiplier
      : (mobile ? MOBILE_FAR_MULTIPLIER : FAR_MULTIPLIER);
    const far = expandFarCanopy(farTemplates, farMul);

    const maxMidNear = options.maxTrees != null
      ? options.maxTrees
      : (mobile ? MOBILE_MAX_TREES : null);
    const midNear = pickMidNear(FOREST, maxMidNear);

    return far.concat(midNear).sort(function (a, b) {
      return a.depth - b.depth;
    });
  }

  function seatTransform(entry, layout, options) {
    const VW = global.TREE_VW || 520;
    const VH = global.TREE_VH || 400;
    const dpr = layout.dpr;
    const cssW = layout.cssW;
    const cssH = layout.cssH;
    const overflowX = options.overflowX;
    const nearFloor = options.nearFloor;
    const hillRise = options.hillRise;
    const scaleMul = options.scaleMul;

    const x = overflowX ? entry.x * 1.22 - 0.11 : entry.x;
    const treeH = entry.scale * scaleMul * cssH;
    const treeW = treeH * (VW / VH);
    const hill = Math.max(0, Math.min(1, 1 - entry.depth));
    const bottomPct = nearFloor + hill * hillRise;
    const bottom = (bottomPct / 100) * cssH;
    const top = cssH - bottom - treeH;
    const left = x * cssW - treeW / 2;

    return {
      m: [
        (treeW / VW) * dpr,
        0,
        0,
        (treeH / VH) * dpr,
        left * dpr,
        top * dpr
      ],
      // Shade footprint grows with tree scale (local VW units stay fixed; CTM scales them).
      shadeRx: entry.farCanopy ? 70 : 100,
      shadeRy: entry.farCanopy ? 22 : 30
    };
  }

  function stopForestStand(root) {
    if (!root) return;
    if (root._forestRaf) {
      cancelAnimationFrame(root._forestRaf);
      root._forestRaf = 0;
    }
    if (root._forestRO && typeof root._forestRO.disconnect === "function") {
      root._forestRO.disconnect();
      root._forestRO = null;
    }
    if (root._forestIO && typeof root._forestIO.disconnect === "function") {
      root._forestIO.disconnect();
      root._forestIO = null;
    }
    root._forestStop = null;
  }

  function plantForestHorizon(root, opts) {
    const options = opts || {};
    const reduce = !!options.reduce;
    const lowPerf = !!options.performance;
    const build = typeof options.build === "function"
      ? options.build
      : global.buildTreeModel;
    const paint = typeof options.paint === "function"
      ? options.paint
      : global.paintTreeModel;
    const paintShade = typeof options.paintShade === "function"
      ? options.paintShade
      : global.paintTreeShade;
    if (!root || typeof build !== "function" || typeof paint !== "function") return 0;

    stopForestStand(root);

    root.innerHTML = "";
    root.classList.add("forest-horizon");
    root.setAttribute("role", "img");
    root.setAttribute("aria-label", "Horizon forest of overlapping trees");

    const mobile = options.mobile != null ? !!options.mobile : isMobileForestViewport();
    const overflowX = options.overflowX != null ? !!options.overflowX : mobile;
    const nearFloor = options.nearFloor != null ? options.nearFloor : 2;
    const hillRise = options.hillRise != null ? options.hillRise : (mobile ? 48 : 32);
    const scaleMul = options.scaleMul != null ? options.scaleMul : (mobile ? 0.82 : 1);
    const night = typeof global.prefersDarkScheme === "function"
      ? global.prefersDarkScheme()
      : false;
    const staticOnly = reduce || lowPerf || options.animate === false;

    const seatOpts = {
      mobile: mobile,
      overflowX: overflowX,
      nearFloor: nearFloor,
      hillRise: hillRise,
      scaleMul: scaleMul,
      maxTrees: options.maxTrees != null
        ? options.maxTrees
        : (mobile ? MOBILE_MAX_TREES : null),
      farMultiplier: options.farMultiplier
    };

    const sorted = buildStandEntries(seatOpts);

    const canvas = document.createElement("canvas");
    canvas.className = "forest-canvas forest-canvas--stand";
    canvas.setAttribute("aria-hidden", "true");
    root.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;

    const models = sorted.map(function (entry) {
      return build({
        habit: entry.habit,
        leanSign: entry.leanSign,
        branchiness: entry.branchiness,
        asymmetry: entry.asymmetry,
        sideBias: entry.sideBias,
        seed: entry.seed,
        leafPalette: entry.leafPalette,
        leafColors: entry.leafColors,
        lod: entry.lod || "full"
      });
    });

    function measure() {
      const cssW = Math.max(1, root.clientWidth || root.offsetWidth || 1);
      const cssH = Math.max(1, root.clientHeight || root.offsetHeight || 1);
      const dpr = global.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(cssW * dpr));
      const h = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      canvas.style.width = cssW + "px";
      canvas.style.height = cssH + "px";
      return { cssW: cssW, cssH: cssH, dpr: dpr, w: w, h: h };
    }

    function paintStand(uAll) {
      root._forestU = uAll;
      const layout = measure();
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      for (let i = 0; i < sorted.length; i++) {
        const entry = sorted[i];
        const u = typeof uAll === "number"
          ? uAll
          : (uAll && uAll[i] != null ? uAll[i] : 1);
        const xf = seatTransform(entry, layout, seatOpts);
        if (typeof paintShade === "function") {
          paintShade(ctx, xf, u, {
            night: night,
            rx: xf.shadeRx,
            ry: xf.shadeRy
          });
        }
        paint(ctx, models[i], u, xf, {});
      }
    }

    let raf = 0;
    function stop() {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      root._forestRaf = 0;
    }
    root._forestStop = stop;

    if (staticOnly) {
      paintStand(1);
    } else {
      // One RAF for the whole stand; stagger by entry duration.
      const t0 = performance.now();
      const durations = sorted.map(function (e) {
        return e.farCanopy ? 8000 : (e.duration || 12000);
      });
      function frame(now) {
        const us = [];
        let allDone = true;
        for (let i = 0; i < durations.length; i++) {
          const u = Math.min(1, (now - t0) / durations[i]);
          us.push(u);
          if (u < 1) allDone = false;
        }
        paintStand(us);
        if (!allDone) {
          raf = requestAnimationFrame(frame);
          root._forestRaf = raf;
        } else {
          raf = 0;
          root._forestRaf = 0;
        }
      }
      raf = requestAnimationFrame(frame);
      root._forestRaf = raf;
    }

    if (typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(function () {
        paintStand(root._forestU != null ? root._forestU : 1);
      });
      ro.observe(root);
      root._forestRO = ro;
    }

    root._forestCount = sorted.length;
    return sorted.length;
  }

  global.FOREST_HORIZON = FOREST;
  global.FOREST_MOBILE_MQ = MOBILE_MQ;
  global.FOREST_FAR_MULTIPLIER = FAR_MULTIPLIER;
  global.expandFarCanopy = expandFarCanopy;
  global.plantForestHorizon = plantForestHorizon;
})(typeof window !== "undefined" ? window : globalThis);
