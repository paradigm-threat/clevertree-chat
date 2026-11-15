/* Single-canvas /forest stand: curated scenic trees, parallel grow, one buffer. */
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
  /** Cap stand DPR so clear+redraw of ~22 trees stays cheap on retina. */
  const STAND_DPR_CAP = 1.5;

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

  function lodForEntry(entry) {
    if (entry.lod) return entry.lod;
    // Full geometry only for the deepest near trees — clear+redraw of ~14
    // full models (~2k stems each) was ~250–360ms/frame in MCP profiling.
    if (entry.depth >= 0.85) return "full";
    return "far";
  }

  /** Band grow length. Far/mid stay short; near keeps scenic duration. */
  function durationForEntry(entry) {
    if (entry.depth < 0.33) return 6000;
    if (entry.depth < 0.66) return 7000;
    return entry.duration || 10000;
  }

  /**
   * Stagger bands so only one depth band path-paints at a time (far→mid→near).
   * Overlapping all 22 full/far paints was ~100ms+ frames in MCP.
   */
  function delayForEntry(entry) {
    if (entry.depth < 0.33) return 0;
    if (entry.depth < 0.66) return 5500;
    return 12000;
  }

  function seatTransform(entry, layout, options) {
    const VW = global.TREE_VW || 520;
    const VH = global.TREE_VH || 400;
    const dpr = layout.dpr;
    const cssW = layout.cssW;
    const cssH = layout.cssH;
    const nearFloor = options.nearFloor;
    const hillRise = options.hillRise;
    const scaleMul = options.scaleMul;

    // Authored x only — no overflowX remap (avoids page skew).
    const x = entry.x;
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
      shadeRx: entry.depth < 0.33 ? 70 : 100,
      shadeRy: entry.depth < 0.33 ? 22 : 30
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
    // Seat trunks on the painted ridge (~25–32% from bottom in landscape art,
    // ~48–57% in portrait). far uses most of hillRise; near stays near the floor.
    const nearFloor = options.nearFloor != null ? options.nearFloor : (mobile ? 10 : 4);
    const hillRise = options.hillRise != null ? options.hillRise : (mobile ? 48 : 28);
    const scaleMul = options.scaleMul != null ? options.scaleMul : (mobile ? 0.78 : 0.92);
    const night = typeof global.prefersDarkScheme === "function"
      ? global.prefersDarkScheme()
      : false;
    const staticOnly = reduce || lowPerf || options.animate === false;

    const seatOpts = {
      nearFloor: nearFloor,
      hillRise: hillRise,
      scaleMul: scaleMul
    };

    const maxTrees = options.maxTrees != null
      ? options.maxTrees
      : (mobile ? MOBILE_MAX_TREES : null);
    const sorted = pickStand(FOREST, maxTrees).sort(function (a, b) {
      return a.depth - b.depth;
    });

    const canvas = document.createElement("canvas");
    canvas.className = "forest-canvas forest-canvas--stand";
    canvas.setAttribute("aria-hidden", "true");
    root.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;

    // Offscreen bake of the finished far→near prefix (not shown; blitted into stand).
    const settled = document.createElement("canvas");
    const settledCtx = settled.getContext("2d");
    let settledCount = 0;

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
        lod: lodForEntry(entry)
      });
    });

    function measure() {
      const cssW = Math.max(1, root.clientWidth || root.offsetWidth || 1);
      const cssH = Math.max(1, root.clientHeight || root.offsetHeight || 1);
      const dpr = Math.min(global.devicePixelRatio || 1, STAND_DPR_CAP);
      const w = Math.max(1, Math.round(cssW * dpr));
      const h = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        settled.width = w;
        settled.height = h;
        settledCount = 0;
      } else if (settled.width !== w || settled.height !== h) {
        settled.width = w;
        settled.height = h;
        settledCount = 0;
      }
      canvas.style.width = cssW + "px";
      canvas.style.height = cssH + "px";
      canvas.style.top = "0";
      canvas.style.left = "0";
      return { cssW: cssW, cssH: cssH, dpr: dpr, w: w, h: h };
    }

    function paintTreeAt(destCtx, i, u, layout) {
      const entry = sorted[i];
      const xf = seatTransform(entry, layout, seatOpts);
      if (typeof paintShade === "function") {
        paintShade(destCtx, xf, u, {
          night: night,
          rx: xf.shadeRx,
          ry: xf.shadeRy
        });
      }
      paint(destCtx, models[i], u, xf, { cheapLeaves: true });
    }

    /**
     * Largest depth-sorted prefix where every tree is finished (u=1).
     * Far finishes first (shorter durations) so this prefix grows back→front.
     */
    function finishedPrefixLen(uAll) {
      if (typeof uAll === "number") return uAll >= 1 ? sorted.length : 0;
      let k = 0;
      while (k < sorted.length && (uAll[k] == null || uAll[k] >= 1)) k++;
      return k;
    }

    function extendSettled(layout, from, to) {
      if (!settledCtx || to <= from) return;
      for (let i = from; i < to; i++) {
        paintTreeAt(settledCtx, i, 1, layout);
      }
      settledCount = to;
    }

    function rebuildSettled(layout, prefix) {
      if (!settledCtx) return;
      settledCtx.save();
      settledCtx.setTransform(1, 0, 0, 1, 0, 0);
      settledCtx.clearRect(0, 0, settled.width, settled.height);
      settledCtx.restore();
      settledCount = 0;
      extendSettled(layout, 0, prefix);
    }

    /**
     * One visible stand buffer: blit finished far→near prefix, path-paint only
     * trees still growing (avoids re-stroking completed full-LOD giants every RAF).
     */
    function paintStand(uAll) {
      root._forestU = uAll;
      const layout = measure();
      const prefix = finishedPrefixLen(uAll);

      if (prefix < settledCount || settled.width !== canvas.width) {
        rebuildSettled(layout, prefix);
      } else if (prefix > settledCount) {
        extendSettled(layout, settledCount, prefix);
      }

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (prefix > 0) ctx.drawImage(settled, 0, 0);
      ctx.restore();

      for (let i = prefix; i < sorted.length; i++) {
        const u = typeof uAll === "number"
          ? uAll
          : (uAll && uAll[i] != null ? uAll[i] : 1);
        if (u <= 0) continue;
        paintTreeAt(ctx, i, u, layout);
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
      // Parallel within a band; bands staggered far→mid→near for paint budget.
      const t0 = performance.now();
      const durations = sorted.map(durationForEntry);
      const delays = sorted.map(delayForEntry);
      function frame(now) {
        const us = [];
        let allDone = true;
        for (let i = 0; i < durations.length; i++) {
          const elapsed = now - t0 - delays[i];
          const u = elapsed <= 0 ? 0 : Math.min(1, elapsed / durations[i]);
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
        settledCount = 0;
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
  global.plantForestHorizon = plantForestHorizon;
})(typeof window !== "undefined" ? window : globalThis);
