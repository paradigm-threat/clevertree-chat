/* Shared hillside tree grower for the home hero and /trees forest. */
function growHillTree(canvas, opts) {
  const options = opts && typeof opts === "object" ? opts : {};
  const reduce = !!options.reduce;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  if (typeof canvas._growStop === "function") canvas._growStop();
  canvas._growOpts = options;

  // Wide virtual view so spreading habits are not clipped by the bitmap.
  const VW = 520;
  const VH = 400;
  const DEPTH = 7;
  const STEM_N = 2200;
  const LEAF_N = 12000;
  // Leader + laterals (not equal ±Y forks). Angles in degrees by depth.
  const RANGE_DEG = [34, 32, 36, 34, 38, 34, 32, 28];
  const LENGTHS = [64, 56, 48, 40, 32, 24, 16, 11];
  const DURATION = options.duration > 0 ? options.duration : 30000;
  const START_DELAY = options.delay > 0 ? options.delay : 0;
  const TRUNK_X = VW * 0.5;
  const TRUNK_Y = VH - 8;
  const VIEW_PAD = 28;

  const sx0 = new Float32Array(STEM_N);
  const sy0 = new Float32Array(STEM_N);
  const sx1 = new Float32Array(STEM_N);
  const sy1 = new Float32Array(STEM_N);
  const sw0 = new Float32Array(STEM_N);
  const sw1 = new Float32Array(STEM_N);
  const sang = new Float32Array(STEM_N);
  const sdep = new Uint8Array(STEM_N);
  const sStart = new Float32Array(STEM_N);
  const sEnd = new Float32Array(STEM_N);

  const lx = new Float32Array(LEAF_N);
  const ly = new Float32Array(LEAF_N);
  const lrot = new Float32Array(LEAF_N);
  const llen = new Float32Array(LEAF_N);
  const lshow = new Float32Array(LEAF_N);
  const llandx = new Float32Array(LEAF_N);
  const llandy = new Float32Array(LEAF_N);
  const llandr = new Float32Array(LEAF_N);
  const lcol = new Uint8Array(LEAF_N);
  const lfall = new Uint8Array(LEAF_N);
  const ldep = new Uint8Array(LEAF_N);

  const BARK = ["#5c3d22", "#684628", "#755230", "#825e38", "#8f6a42", "#9c764c"];
  const LEAF = ["#1f6b28", "#247a24", "#2f8a28", "#3e9a32", "#4ea628", "#62b41e", "#78c422"];

  const seedBits = new Uint32Array(1);
  if (options.seed != null) {
    seedBits[0] = options.seed >>> 0;
  } else {
    crypto.getRandomValues(seedBits);
  }
  let seed = (seedBits[0] % 2147483646) + 1;
  function rnd() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }
  // habit 0 = tall/thin, 1 = wide/spreading, mid = in between
  const habit = options.habit != null
    ? Math.max(0, Math.min(1, Number(options.habit)))
    : rnd();
  const leanSign = options.leanSign === -1 || options.leanSign === 1
    ? options.leanSign
    : null;
  // 0 = airy, 1 = lush — chance of extra laterals / mid-trunk shoots.
  const branchiness = options.branchiness != null
    ? Math.max(0, Math.min(1, Number(options.branchiness)))
    : 0.35 + rnd() * 0.55;
  // 0 = milder laterals, 1 = one side clearly dominates (breaks Y symmetry).
  const asymmetry = options.asymmetry != null
    ? Math.max(0, Math.min(1, Number(options.asymmetry)))
    : 0.35 + rnd() * 0.55;
  const sideBias = options.sideBias === -1 || options.sideBias === 1
    ? options.sideBias
    : (leanSign != null ? leanSign : (rnd() < 0.5 ? -1 : 1));
  const clickable = options.clickable !== false;
  // Tall = long trunk + long limbs; bushy = shorter trunk, still wide reach.
  // Do not starve side length when habit is low (that made “tall” look skinny).
  const upScale = 1.02 + 0.55 * (1 - habit);
  const sideScale = 1.08 + 0.22 * habit;
  function clampHeading(angle) {
    const max = 1.15 + 0.7 * habit;
    return angle < -max ? -max : angle > max ? max : angle;
  }
  function stemLength(base, angle, spur) {
    const side = Math.abs(Math.sin(angle));
    const habitScale = upScale * (1 - side) + sideScale * side;
    const own = 0.92 + 0.22 * rnd();
    const spurScale = spur ? 0.62 + 0.22 * rnd() : 1;
    return base * habitScale * own * spurScale;
  }

  const depthIndex = new Uint16Array(DEPTH + 1);
  let n = 0;
  function addStem(s) {
    if (n >= STEM_N) return null;
    const x1 = s.x + Math.sin(s.angle) * s.length;
    const y1 = s.y - Math.cos(s.angle) * s.length;
    const tipRatio = s.depth === 0 ? 0.62 : (s.spur ? 0.55 : 0.72);
    let r1 = s.radius * tipRatio;
    if (r1 < 0.35) r1 = 0.35;
    const di = depthIndex[s.depth]++;
    const start = s.depth === 0 ? 0 : Math.min(0.82, 0.06 + s.depth * 0.085 + (di % 7) * 0.012);
    const end = Math.min(1, start + 0.14 + (s.spur ? 0.02 : 0.04));
    sx0[n] = s.x;
    sy0[n] = s.y;
    sx1[n] = x1;
    sy1[n] = y1;
    sw0[n] = s.radius;
    sw1[n] = r1;
    sang[n] = s.angle;
    sdep[n] = s.depth;
    sStart[n] = start;
    sEnd[n] = end;
    n += 1;
    return { x: x1, y: y1, radius: r1, bx: s.x, by: s.y };
  }

  const trunkLean = (leanSign != null ? leanSign * (2.2 + rnd() * 1.8) : (rnd() * 2 - 1) * 4) * Math.PI / 180;
  // Tall trunks stretch; bushy trunks stay shorter so the crown reads wide.
  const trunkLen = stemLength(72 + 42 * (1 - habit), trunkLean, false);
  const trunk = addStem({
    x: TRUNK_X,
    y: TRUNK_Y,
    angle: trunkLean,
    length: trunkLen,
    radius: 15,
    depth: 0,
    spur: false
  });
  const queue = [{
    x: trunk.x,
    y: trunk.y,
    bx: TRUNK_X,
    by: TRUNK_Y,
    angle: trunkLean,
    radius: trunk.radius,
    depth: 0,
    side: sideBias,
    isLeader: true
  }];

  while (queue.length) {
    const s = queue.shift();
    if (s.depth >= DEPTH) continue;
    if (n >= STEM_N - 4) continue;
    // Weak tips on airy trees stop early so density actually varies.
    if (!s.isLeader && s.depth >= 3 && rnd() > 0.35 + 0.6 * branchiness) continue;
    const spread = RANGE_DEG[Math.min(s.depth, RANGE_DEG.length - 1)] * Math.PI / 180;
    // Tall still opens laterals (long crown); bushy opens wider.
    const latOpen = (0.82 + 0.48 * habit) * (0.8 + 0.3 * asymmetry);
    const leaderKeep = 0.06 + 0.12 * (1 - habit);
    const kids = [];

    // Near-straight leader — never an equal left/right Y split.
    const leaderWobble = (rnd() * 2 - 1) * spread * leaderKeep;
    kids.push({
      ox: s.x,
      oy: s.y,
      angle: clampHeading(s.angle + leaderWobble),
      spur: false,
      isLeader: true,
      lengthMul: s.isLeader ? (1.02 + 0.12 * (1 - habit)) : 0.9,
      radiusMul: 0.78,
      side: s.side
    });

    // Dominant lateral — long reach on tall trees, not a stub.
    const domSign = s.side;
    const domMag = spread * latOpen * (0.75 + 0.4 * rnd());
    kids.push({
      ox: s.x,
      oy: s.y,
      angle: clampHeading(s.angle + domSign * domMag),
      spur: false,
      isLeader: false,
      lengthMul: 0.95 + 0.2 * rnd() + 0.12 * (1 - habit),
      radiusMul: 0.58,
      side: domSign
    });

    // Opposite lateral — weaker when asymmetry is high (avoids mirrored Y).
    const oppChance = 0.18 + 0.5 * branchiness - 0.28 * asymmetry;
    if (rnd() < oppChance) {
      const oppMag = spread * latOpen * (0.28 + 0.35 * (1 - asymmetry)) * (0.6 + 0.4 * rnd());
      kids.push({
        ox: s.x,
        oy: s.y,
        angle: clampHeading(s.angle - domSign * oppMag),
        spur: true,
        isLeader: false,
        lengthMul: 0.62 + 0.28 * rnd(),
        radiusMul: 0.48,
        side: -domSign
      });
    }

    // Mid-segment shoot — bushy trees get more; tall trees still get trunk laterals.
    const midChance = s.depth === 0
      ? 0.75 + 0.2 * habit
      : (s.depth <= 2 ? 0.28 + 0.4 * branchiness + 0.15 * habit : (s.depth === 3 ? 0.12 + 0.22 * branchiness : 0));
    if (midChance > 0 && rnd() < midChance) {
      const along = 0.28 + rnd() * 0.45;
      const mx = s.bx + (s.x - s.bx) * along;
      const my = s.by + (s.y - s.by) * along;
      const midSign = rnd() < 0.55 ? domSign : -domSign;
      const midMag = spread * (0.55 + 0.45 * habit) * (0.55 + 0.4 * rnd());
      kids.push({
        ox: mx,
        oy: my,
        angle: clampHeading(s.angle + midSign * midMag),
        spur: true,
        isLeader: false,
        lengthMul: 0.55 + 0.28 * rnd(),
        radiusMul: 0.42,
        side: midSign
      });
    }

    // Extra tip lateral on lush trees only (kept sparse to limit overlap).
    if (s.depth >= 1 && s.depth <= 4 && rnd() < 0.06 + 0.32 * branchiness) {
      const extraSign = rnd() < 0.5 ? domSign : -domSign;
      const extraMag = spread * (0.35 + 0.4 * rnd());
      kids.push({
        ox: s.x,
        oy: s.y,
        angle: clampHeading(s.angle + extraSign * extraMag * 0.85),
        spur: true,
        isLeader: false,
        lengthMul: 0.42 + 0.22 * rnd(),
        radiusMul: 0.4,
        side: extraSign
      });
    }

    for (let k = 0; k < kids.length; k++) {
      const kid = kids[k];
      const baseLen = LENGTHS[Math.min(s.depth, LENGTHS.length - 1)] * kid.lengthMul;
      const length = stemLength(baseLen, kid.angle, kid.spur);
      const made = addStem({
        x: kid.ox,
        y: kid.oy,
        angle: kid.angle,
        length: length,
        radius: Math.max(0.4, s.radius * kid.radiusMul),
        depth: s.depth + 1,
        spur: kid.spur
      });
      if (!made) continue;
      queue.push({
        x: made.x,
        y: made.y,
        bx: kid.ox,
        by: kid.oy,
        angle: kid.angle,
        radius: made.radius,
        depth: s.depth + 1,
        side: kid.side,
        isLeader: kid.isLeader
      });
    }
  }

  // If a rare habit still overruns the bitmap, scale about the trunk base — never clip.
  (function fitTreeInView() {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      minX = Math.min(minX, sx0[i] - sw0[i], sx1[i] - sw1[i]);
      maxX = Math.max(maxX, sx0[i] + sw0[i], sx1[i] + sw1[i]);
      minY = Math.min(minY, sy0[i], sy1[i]);
      maxY = Math.max(maxY, sy0[i], sy1[i]);
    }
    // Reserve room for foliage beyond tip coords.
    const leafReach = 24;
    minX -= leafReach;
    maxX += leafReach;
    minY -= leafReach;
    const roomW = VW - VIEW_PAD * 2;
    const roomH = VH - VIEW_PAD * 2;
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const scale = Math.min(1, roomW / bw, roomH / bh);
    if (scale >= 0.995) return;
    function mapX(x) {
      return TRUNK_X + (x - TRUNK_X) * scale;
    }
    function mapY(y) {
      return TRUNK_Y + (y - TRUNK_Y) * scale;
    }
    for (let i = 0; i < n; i++) {
      sx0[i] = mapX(sx0[i]);
      sy0[i] = mapY(sy0[i]);
      sx1[i] = mapX(sx1[i]);
      sy1[i] = mapY(sy1[i]);
      sw0[i] *= scale;
      sw1[i] *= scale;
    }
  })();

  // Leaves after optional fit so tip coords match the drawn stems.
  let leaves = 0;
  let falling = 0;
  let tipOrdinal = 0;
  const tipIds = [];
  const leafMinDist = 9;
  function leafTooClose(x, y) {
    for (let j = 0; j < leaves; j++) {
      const dx = lx[j] - x;
      const dy = ly[j] - y;
      if (dx * dx + dy * dy < leafMinDist * leafMinDist) return true;
    }
    return false;
  }
  for (let i = 0; i < n; i++) {
    if (sdep[i] === DEPTH) tipIds.push(i);
    // Outer wood only — cuts inner pile-up on the trunk.
    if (sdep[i] < 2) continue;
    const ang = sang[i];
    const per = sdep[i] >= 5 ? 3 : 2;
    const base = Math.max(10, 17 - sdep[i] * 1.0);
    for (let k = 0; k < per; k++) {
      if (leaves >= LEAF_N) break;
      const back = k * 2.2;
      const px = sx1[i] - Math.sin(ang) * back;
      const py = sy1[i] + Math.cos(ang) * back;
      if (leafTooClose(px, py)) continue;
      lx[leaves] = px;
      ly[leaves] = py;
      lrot[leaves] = ang + (k - (per - 1) / 2) * 0.55;
      llen[leaves] = base + (k % 3) * 1.6;
      lshow[leaves] = Math.max(0, Math.min(sEnd[i] - 0.02, 1 - 0.035));
      lcol[leaves] = (sdep[i] + k) % LEAF.length;
      ldep[leaves] = sdep[i];
      if (sdep[i] === DEPTH && k === 0 && tipOrdinal % 8 === 0) {
        lfall[leaves] = 1;
        falling += 1;
      } else {
        lfall[leaves] = 0;
      }
      leaves += 1;
    }
    if (leaves >= LEAF_N) break;
    if (sdep[i] === DEPTH) tipOrdinal += 1;
  }

  let faller = 0;
  for (let i = 0; i < leaves; i++) {
    if (!lfall[i]) continue;
    // Fall straight down from the tip — no sideways tween to a staged pile.
    llandx[i] = lx[i];
    llandy[i] = TRUNK_Y - 2 + (faller % 3) * 1.6;
    llandr[i] = lrot[i] + (faller % 2 === 0 ? 1.15 : -1.35);
    faller += 1;
  }

  const state = {
    stems: n,
    leaves: leaves,
    falling: falling,
    habit: habit,
    seed: seedBits[0],
    leanSign: leanSign != null ? leanSign : (trunkLean >= 0 ? 1 : -1),
    branchiness: branchiness,
    asymmetry: asymmetry,
    sideBias: sideBias,
    motion: reduce ? "reduced" : "growing",
    alive: !reduce,
    u: reduce ? 1 : 0
  };
  canvas._grow = state;

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }
  function easeOut(t) {
    return 1 - (1 - t) * (1 - t);
  }
  function easeIn(t) {
    return t * t;
  }

  function layout() {
    const dpr = window.devicePixelRatio || 1;
    const cssH = canvas.clientHeight;
    if (cssH < 2) return false;
    const cssW = cssH * (VW / VH);
    if (Math.abs(canvas.clientWidth - cssW) > 0.5) canvas.style.width = cssW + "px";
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (w < 2 || h < 2) return false;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(w / VW, 0, 0, h / VH, 0, 0);
    return true;
  }

  function drawStem(x0, y0, x1, y1, r0, r1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    ctx.beginPath();
    ctx.moveTo(x0 + px * r0, y0 + py * r0);
    ctx.lineTo(x1 + px * r1, y1 + py * r1);
    ctx.lineTo(x1 - px * r1, y1 - py * r1);
    ctx.lineTo(x0 - px * r0, y0 - py * r0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x0, y0, r0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x1, y1, Math.max(0.2, r1), 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLeaf(x, y, angle, len) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(len * 0.42, -len * 0.18, len * 0.36, -len * 0.82, 0, -len);
    ctx.bezierCurveTo(-len * 0.36, -len * 0.82, -len * 0.42, -len * 0.18, 0, 0);
    ctx.fill();
    ctx.restore();
  }

  function paintStemAt(i, u) {
    const grow = sEnd[i] - sStart[i] || 0.001;
    const p = clamp01((u - sStart[i]) / grow);
    if (p <= 0) return;
    const e = easeOut(p);
    ctx.fillStyle = BARK[Math.min(sdep[i], BARK.length - 1)];
    drawStem(
      sx0[i],
      sy0[i],
      sx0[i] + (sx1[i] - sx0[i]) * e,
      sy0[i] + (sy1[i] - sy0[i]) * e,
      sw0[i],
      sw0[i] + (sw1[i] - sw0[i]) * e
    );
  }

  function paintLeafAt(i, u) {
    if (u < lshow[i]) return;
    const bloom = easeOut(clamp01((u - lshow[i]) / 0.035));
    if (bloom <= 0) return;
    const begin = Math.max(0.84, lshow[i]);
    const fallingNow = lfall[i] && u >= begin;
    ctx.fillStyle = LEAF[lcol[i]];
    if (!fallingNow) {
      drawLeaf(lx[i], ly[i], lrot[i], llen[i] * (0.35 + 0.65 * bloom));
      return;
    }
    const t = easeIn(clamp01((u - begin) / (1 - begin)));
    const x = llandx[i];
    const y = ly[i] + (llandy[i] - ly[i]) * t;
    drawLeaf(x, y, lrot[i] + (llandr[i] - lrot[i]) * t, llen[i]);
  }

  function draw(u) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (let d = DEPTH; d >= 0; d--) {
      for (let i = 0; i < leaves; i++) {
        if (ldep[i] === d) paintLeafAt(i, u);
      }
      for (let i = 0; i < n; i++) {
        if (sdep[i] === d) paintStemAt(i, u);
      }
    }
  }

  let raf = 0;
  let stopped = false;
  const watcher = new ResizeObserver(() => {
    if (stopped) return;
    if (layout()) draw(state.u);
  });
  watcher.observe(canvas);

  function stop() {
    if (stopped) return;
    stopped = true;
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    watcher.disconnect();
    canvas.removeEventListener("click", onClick);
    canvas.removeEventListener("keydown", onKey);
    if (canvas._growStop === stop) canvas._growStop = null;
  }

  function onClick(e) {
    e.preventDefault();
    stop();
    growHillTree(canvas, Object.assign({}, options, { delay: 0 }));
  }

  function onKey(e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    stop();
    growHillTree(canvas, Object.assign({}, options, { delay: 0 }));
  }

  if (clickable) {
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("keydown", onKey);
  }
  canvas._growStop = stop;

  if (reduce) {
    if (layout()) draw(1);
    return;
  }

  let t0 = 0;
  function frame(now) {
    if (stopped) return;
    if (!layout()) {
      raf = requestAnimationFrame(frame);
      return;
    }
    if (!t0) t0 = now + START_DELAY;
    if (now < t0) {
      draw(0);
      raf = requestAnimationFrame(frame);
      return;
    }
    const u = Math.min(1, (now - t0) / DURATION);
    state.u = u;
    draw(u);
    if (u < 1) raf = requestAnimationFrame(frame);
    else {
      state.alive = false;
      state.motion = "held";
      raf = 0;
    }
  }
  raf = requestAnimationFrame(frame);
}
/** Deterministic catalog: habit × lean × branchiness × asymmetry × side bias. */
function forestAlternationCatalog() {
  const habits = [
    { habit: 0, habitLabel: "tall" },
    { habit: 0.25, habitLabel: "upright" },
    { habit: 0.5, habitLabel: "balanced" },
    { habit: 0.75, habitLabel: "spreading" },
    { habit: 1, habitLabel: "wide" }
  ];
  const leans = [
    { leanSign: -1, leanLabel: "lean-left" },
    { leanSign: 1, leanLabel: "lean-right" }
  ];
  const densities = [
    { branchiness: 0.25, densityLabel: "airy" },
    { branchiness: 0.85, densityLabel: "lush" }
  ];
  const shapes = [
    { asymmetry: 0.25, shapeLabel: "even-sided" },
    { asymmetry: 0.85, shapeLabel: "lopsided" }
  ];
  const out = [];
  let i = 0;
  for (const h of habits) {
    for (const l of leans) {
      for (const d of densities) {
        for (const s of shapes) {
          i += 1;
          const sideBias = i % 2 === 0 ? l.leanSign : -l.leanSign;
          out.push({
            id: i,
            habit: h.habit,
            habitLabel: h.habitLabel,
            leanSign: l.leanSign,
            leanLabel: l.leanLabel,
            branchiness: d.branchiness,
            densityLabel: d.densityLabel,
            asymmetry: s.asymmetry,
            shapeLabel: s.shapeLabel,
            sideBias: sideBias,
            sideLabel: sideBias < 0 ? "bias-left" : "bias-right",
            seed: (i * 2654435761) >>> 0,
            label: [
              h.habitLabel,
              l.leanLabel,
              d.densityLabel,
              s.shapeLabel,
              sideBias < 0 ? "bias-left" : "bias-right"
            ].join(" · ")
          });
        }
      }
    }
  }
  return out;
}

if (typeof window !== "undefined") {
  window.growHillTree = growHillTree;
  window.forestAlternationCatalog = forestAlternationCatalog;
}
