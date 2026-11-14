/* Shared hillside tree grower for the home hero and /trees forest. */

var CLEVERTREE_ALWAYS_ANIMATE_KEY = "clevertree-always-animate";

function treeWindAllowed() {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  } catch (e) {}
  try {
    if (window.matchMedia("(max-width: 700px)").matches) return false;
    if (window.matchMedia("(pointer: coarse)").matches &&
        window.matchMedia("(max-width: 800px)").matches) return false;
  } catch (e2) {}
  if (typeof navigator !== "undefined") {
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) return false;
    if (navigator.deviceMemory && navigator.deviceMemory <= 4) return false;
  }
  return true;
}

function normalizeWind(wind) {
  if (wind === false || wind === 0 || wind === "calm" || wind === "off") return "calm";
  if (wind === "strong" || wind === 1) return "strong";
  if (typeof wind === "number") {
    if (wind <= 0) return "calm";
    if (wind >= 0.75) return "strong";
    return "gentle";
  }
  return "gentle";
}

function effectiveWind(requested, opts) {
  const o = opts || {};
  if (o.performance === true || requested === false) return "calm";
  if (!treeWindAllowed()) return "calm";
  return normalizeWind(requested != null ? requested : o.wind);
}

function treeAlwaysAnimatePreferred() {
  try {
    return localStorage.getItem(CLEVERTREE_ALWAYS_ANIMATE_KEY) === "1";
  } catch (e) {
    return false;
  }
}

function setTreeAlwaysAnimatePreferred(on) {
  try {
    localStorage.setItem(CLEVERTREE_ALWAYS_ANIMATE_KEY, on ? "1" : "0");
  } catch (e) {}
}

function windAmpFor(level) {
  if (level === "strong") return 0.2;
  if (level === "gentle") return 0.055;
  return 0;
}

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
  const sParent = new Int16Array(STEM_N);
  const sAlong = new Float32Array(STEM_N);
  const sStart = new Float32Array(STEM_N);
  const sEnd = new Float32Array(STEM_N);
  const sWidthStart = new Float32Array(STEM_N);
  const sWidthEnd = new Float32Array(STEM_N);

  const lx = new Float32Array(LEAF_N);
  const ly = new Float32Array(LEAF_N);
  const lox = new Float32Array(LEAF_N);
  const loy = new Float32Array(LEAF_N);
  const lrot = new Float32Array(LEAF_N);
  const llen = new Float32Array(LEAF_N);
  const lshow = new Float32Array(LEAF_N);
  const llandx = new Float32Array(LEAF_N);
  const llandy = new Float32Array(LEAF_N);
  const llandr = new Float32Array(LEAF_N);
  const lcol = new Uint8Array(LEAF_N);
  const lfall = new Uint8Array(LEAF_N);
  const ldep = new Uint8Array(LEAF_N);
  const lstem = new Uint16Array(LEAF_N);
  const bx0 = new Float32Array(STEM_N);
  const by0 = new Float32Array(STEM_N);
  const bx1 = new Float32Array(STEM_N);
  const by1 = new Float32Array(STEM_N);
  const bang = new Float32Array(STEM_N);

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
  // Grow-in drawing animation is the default. Wind sway is off (performance).
  // One-shot buffer paint: reduce motion, performance:true, or animate:false.
  const staticOnly = !!reduce || options.performance === true || options.animate === false;
  const windLevel = "calm";
  const windAmp = 0;
  const alwaysAnimate = false;
  const pauseAfterMs = Infinity;
  const swayMaxFps = 0;
  const getWindTime = typeof options.getWindTime === "function"
    ? options.getWindTime
    : function () { return performance.now(); };
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

  let n = 0;
  function addStem(s) {
    if (n >= STEM_N) return null;
    const x1 = s.x + Math.sin(s.angle) * s.length;
    const y1 = s.y - Math.cos(s.angle) * s.length;
    const tipRatio = s.depth === 0 ? 0.68 : (s.spur ? 0.62 : 0.78);
    let r1 = s.radius * tipRatio;
    if (r1 < 0.55) r1 = 0.55;
    const idx = n;
    sx0[idx] = s.x;
    sy0[idx] = s.y;
    sx1[idx] = x1;
    sy1[idx] = y1;
    sw0[idx] = s.radius;
    sw1[idx] = r1;
    sang[idx] = s.angle;
    sdep[idx] = s.depth;
    sParent[idx] = s.parent != null ? s.parent : -1;
    sAlong[idx] = s.along != null ? s.along : 1;
    // Timing filled after the stem graph exists.
    sStart[idx] = 0;
    sEnd[idx] = 0;
    sWidthStart[idx] = 0;
    sWidthEnd[idx] = 0;
    n += 1;
    return { x: x1, y: y1, radius: r1, bx: s.x, by: s.y, index: idx };
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
    spur: false,
    parent: -1,
    along: 1
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
    isLeader: true,
    stemIndex: trunk.index
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
      along: 1,
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
      along: 1,
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
        along: 1,
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
        along: along,
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
        along: 1,
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
        spur: kid.spur,
        parent: s.stemIndex,
        along: kid.along
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
        isLeader: kid.isLeader,
        stemIndex: made.index
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

  // Length-then-children: kids wait until parent length passes their attach + delay.
  // Width thickens after length so the parent paints over the fork.
  (function retargetStemTiming() {
    for (let i = 0; i < n; i++) {
      const lenDur = (sdep[i] === 0 ? 0.14 : 0.1) + (0.02 * rnd());
      let lenStart;
      if (sParent[i] < 0) {
        lenStart = 0;
      } else {
        const p = sParent[i];
        const delay = 0.012 + rnd() * 0.04;
        const along = Math.max(0.05, Math.min(1, sAlong[i]));
        lenStart = sStart[p] + along * (sEnd[p] - sStart[p]) + delay;
      }
      const lenEnd = lenStart + lenDur;
      sStart[i] = lenStart;
      sEnd[i] = lenEnd;
      const wDur = 0.045 + rnd() * 0.035;
      sWidthStart[i] = lenEnd;
      sWidthEnd[i] = lenEnd + wDur;
    }
    let maxT = 0;
    for (let i = 0; i < n; i++) {
      if (sWidthEnd[i] > maxT) maxT = sWidthEnd[i];
    }
    if (maxT > 1) {
      const scale = 1 / maxT;
      for (let i = 0; i < n; i++) {
        sStart[i] *= scale;
        sEnd[i] *= scale;
        sWidthStart[i] *= scale;
        sWidthEnd[i] *= scale;
      }
    }
  })();

  // Leaves after optional fit so tip coords match the drawn stems.
  let leaves = 0;
  let falling = 0;
  let tipOrdinal = 0;
  const tipIds = [];
  // Dense small foliage dabs — fuller canopy without giant see-through petals.
  const leafMinDist = 3.2;
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
    if (sdep[i] < 2) continue;
    const ang = sang[i];
    const per = sdep[i] >= 5 ? 7 : (sdep[i] >= 3 ? 5 : 4);
    const base = Math.max(4.2, 7.5 - sdep[i] * 0.35);
    for (let k = 0; k < per; k++) {
      if (leaves >= LEAF_N) break;
      const back = (k % 4) * 1.15;
      const side = ((k % 5) - 2) * 1.4;
      const px = sx1[i] - Math.sin(ang) * back + Math.cos(ang) * side;
      const py = sy1[i] + Math.cos(ang) * back + Math.sin(ang) * side * 0.35;
      if (leafTooClose(px, py)) continue;
      lx[leaves] = px;
      ly[leaves] = py;
      lox[leaves] = px - sx1[i];
      loy[leaves] = py - sy1[i];
      lstem[leaves] = i;
      lrot[leaves] = ang + (k - (per - 1) / 2) * 0.35 + (k % 3 - 1) * 0.4;
      llen[leaves] = base + (k % 4) * 0.55;
      // Bloom just after this stem's length finishes — never on an invisible twig.
      lshow[leaves] = Math.max(0, Math.min(sEnd[i] + 0.01, 0.98));
      lcol[leaves] = (sdep[i] + k) % LEAF.length;
      ldep[leaves] = sdep[i];
      // No falling-leaf cycle — it kept RAF alive after grow and lagged the page.
      lfall[leaves] = 0;
      leaves += 1;
    }
    if (leaves >= LEAF_N) break;
    if (sdep[i] === DEPTH) tipOrdinal += 1;
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
    wind: windLevel,
    alwaysAnimate: alwaysAnimate,
    motion: reduce ? "reduced" : "growing",
    alive: !reduce,
    u: reduce ? 1 : 0
  };
  canvas._grow = state;
  canvas._swayVisible = true;

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
    // Small overlapping dabs read as a leafy puff, not a giant petal.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const s = Math.max(2.2, len);
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.15, s * 0.55, s * 0.7, 0, 0, Math.PI * 2);
    ctx.ellipse(-s * 0.35, -s * 0.45, s * 0.38, s * 0.48, -0.5, 0, Math.PI * 2);
    ctx.ellipse(s * 0.32, -s * 0.4, s * 0.36, s * 0.46, 0.45, 0, Math.PI * 2);
    ctx.ellipse(0, -s * 0.75, s * 0.3, s * 0.34, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function windPushX(now, salt) {
    if (windAmp <= 0) return 0;
    const t = now * 0.001;
    return Math.sin(t * 1.35 + salt) * (windAmp * 55) +
      Math.sin(t * 0.55 + salt * 1.7) * (windAmp * 25);
  }

  function computeBend(now) {
    const t = now * 0.001;
    for (let i = 0; i < n; i++) {
      const depthFade = sdep[i] / Math.max(1, DEPTH);
      const local = Math.sin(t * 1.2 + i * 0.17) * windAmp * (0.25 + 0.75 * depthFade);
      const gust = Math.sin(t * 0.35 + sdep[i] * 0.4) * windAmp * 0.35 * depthFade;
      bang[i] = sang[i] + local + gust;
      const len = Math.hypot(sx1[i] - sx0[i], sy1[i] - sy0[i]);
      let x0;
      let y0;
      if (sParent[i] < 0) {
        x0 = sx0[i];
        y0 = sy0[i];
      } else {
        const p = sParent[i];
        const along = Math.max(0, Math.min(1, sAlong[i]));
        x0 = bx0[p] + (bx1[p] - bx0[p]) * along;
        y0 = by0[p] + (by1[p] - by0[p]) * along;
      }
      bx0[i] = x0;
      by0[i] = y0;
      bx1[i] = x0 + Math.sin(bang[i]) * len;
      by1[i] = y0 - Math.cos(bang[i]) * len;
    }
  }

  function copyRestPose() {
    for (let i = 0; i < n; i++) {
      bx0[i] = sx0[i];
      by0[i] = sy0[i];
      bx1[i] = sx1[i];
      by1[i] = sy1[i];
      bang[i] = sang[i];
    }
  }

  function paintStemAt(i, u, bent) {
    const lenGrow = sEnd[i] - sStart[i] || 0.001;
    const lenP = clamp01((u - sStart[i]) / lenGrow);
    if (lenP <= 0) return;
    const e = easeOut(lenP);
    const wGrow = sWidthEnd[i] - sWidthStart[i] || 0.001;
    let widthP;
    if (u < sWidthStart[i]) {
      widthP = 0.42 + 0.28 * e;
    } else {
      widthP = 0.7 + 0.3 * easeOut(clamp01((u - sWidthStart[i]) / wGrow));
    }
    ctx.fillStyle = BARK[Math.min(sdep[i], BARK.length - 1)];
    const x0 = bent ? bx0[i] : sx0[i];
    const y0 = bent ? by0[i] : sy0[i];
    const x1 = bent ? bx1[i] : sx1[i];
    const y1 = bent ? by1[i] : sy1[i];
    const r0 = sw0[i] * widthP;
    const r1 = (sw0[i] + (sw1[i] - sw0[i]) * e) * widthP;
    drawStem(
      x0,
      y0,
      x0 + (x1 - x0) * e,
      y0 + (y1 - y0) * e,
      r0,
      Math.max(0.2, r1)
    );
  }

  function leafAttach(i) {
    const s = lstem[i];
    return {
      x: bx1[s] + lox[i],
      y: by1[s] + loy[i],
      ang: bang[s]
    };
  }

  function paintLeafAt(i, u, now, bent) {
    if (u < lshow[i]) return;
    const bloom = easeOut(clamp01((u - lshow[i]) / 0.035));
    if (bloom <= 0) return;
    ctx.fillStyle = LEAF[lcol[i]];
    const attach = bent ? leafAttach(i) : { x: lx[i], y: ly[i], ang: lrot[i] };
    const flutter = windAmp > 0
      ? Math.sin(now * 0.004 + i * 0.9) * windAmp * 8
      : 0;
    drawLeaf(
      attach.x + flutter,
      attach.y + Math.abs(flutter) * 0.15,
      lrot[i] + flutter * 0.04,
      llen[i] * (u < 1 ? (0.35 + 0.65 * bloom) : 1)
    );
  }

  function draw(u, now, bent) {
    const tNow = now != null ? now : 0;
    if (bent && windAmp > 0) computeBend(tNow);
    else copyRestPose();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (let d = DEPTH; d >= 0; d--) {
      for (let i = 0; i < leaves; i++) {
        if (ldep[i] === d) paintLeafAt(i, u, tNow, bent);
      }
      for (let i = 0; i < n; i++) {
        if (sdep[i] === d) paintStemAt(i, u, bent);
      }
    }
  }

  let raf = 0;
  let stopped = false;
  let swayPaused = false;
  let animStartedAt = 0;
  let pauseAfterDisabled = alwaysAnimate || pauseAfterMs === Infinity;
  let lastSwayPaint = 0;
  const watcher = new ResizeObserver(() => {
    if (stopped) return;
    if (!layout()) return;
    // No wind sway — redraw current grow progress or the finished tree.
    if (state.motion === "grow") {
      draw(state.u, 0, false);
      return;
    }
    draw(1, 0, false);
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
    canvas._growResumeSway = null;
  }

  function onClick(e) {
    e.preventDefault();
    notifyPaused(false);
    stop();
    growHillTree(canvas, Object.assign({}, options, { delay: 0 }));
  }

  function onKey(e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    notifyPaused(false);
    stop();
    growHillTree(canvas, Object.assign({}, options, { delay: 0 }));
  }

  if (clickable) {
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("keydown", onKey);
  }
  canvas._growStop = stop;

  function notifyPaused(paused) {
    if (typeof options.onSwayPause === "function") {
      try { options.onSwayPause(!!paused, state); } catch (e) {}
    }
  }

  /** One-shot paint of the finished tree into the canvas bitmap. No RAF. */
  function paintStatic() {
    copyRestPose();
    if (layout()) draw(1, 0, false);
    state.u = 1;
    state.motion = "static";
    state.alive = false;
    notifyPaused(false);
  }

  function hitPauseDeadline(t) {
    if (pauseAfterDisabled || pauseAfterMs === Infinity) return false;
    if (!animStartedAt) return false;
    return (t - animStartedAt) >= pauseAfterMs;
  }

  function pauseMotion(t) {
    // Only after the timed window — and only once motion is actually stopped.
    swayPaused = true;
    state.motion = "paused";
    state.alive = false;
    state.u = 1;
    // Settled frame: no wind bend / fall cycles so the scene looks stopped.
    draw(1, t, false);
    raf = 0;
    notifyPaused(true);
  }

  function swayFrame(now) {
    if (stopped) return;
    if (swayPaused) {
      raf = 0;
      return;
    }
    if (document.hidden || canvas._swayVisible === false) {
      raf = requestAnimationFrame(swayFrame);
      return;
    }
    if (!layout()) {
      raf = requestAnimationFrame(swayFrame);
      return;
    }
    const t = getWindTime();
    if (hitPauseDeadline(t)) {
      pauseMotion(t);
      return;
    }
    if (swayMaxFps > 0) {
      const minDelta = 1000 / swayMaxFps;
      if (t - lastSwayPaint < minDelta) {
        raf = requestAnimationFrame(swayFrame);
        return;
      }
      lastSwayPaint = t;
    }
    state.u = 1;
    state.motion = "sway";
    state.alive = true;
    draw(1, t, windAmp > 0);
    raf = requestAnimationFrame(swayFrame);
  }

  function startSway() {
    if (stopped) return;
    if (windAmp <= 0 && !falling) {
      state.motion = "held";
      state.alive = false;
      if (layout()) draw(1, getWindTime(), false);
      return;
    }
    const t = getWindTime();
    if (hitPauseDeadline(t)) {
      pauseMotion(t);
      return;
    }
    swayPaused = false;
    state.motion = "sway";
    state.alive = true;
    if (!raf) raf = requestAnimationFrame(swayFrame);
  }

  canvas._growResumeSway = function resumeSway(opts2) {
    const o = opts2 || {};
    if (o.always === true) {
      setTreeAlwaysAnimatePreferred(true);
      state.alwaysAnimate = true;
      pauseAfterDisabled = true;
    }
    swayPaused = false;
    notifyPaused(false);
    startSway();
  };

  // Low-performance / reduced-motion: one-shot buffer paint.
  if (staticOnly) {
    paintStatic();
    return;
  }

  // Grow-in drawing animation, then hold (no wind sway).
  notifyPaused(false);
  state.motion = "grow";

  let t0 = 0;
  function frame(now) {
    if (stopped) return;
    if (!layout()) {
      raf = requestAnimationFrame(frame);
      return;
    }
    if (!t0) {
      t0 = now + START_DELAY;
      animStartedAt = t0;
    }
    if (now < t0) {
      draw(0, now, false);
      raf = requestAnimationFrame(frame);
      return;
    }
    const u = Math.min(1, (now - t0) / DURATION);
    state.u = u;
    state.motion = "grow";
    draw(u, now, false);
    if (u < 1) {
      raf = requestAnimationFrame(frame);
    } else {
      raf = 0;
      // Hold finished frame — startSway is a no-op when windAmp is 0.
      startSway();
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
  window.treeWindAllowed = treeWindAllowed;
  window.effectiveWind = effectiveWind;
  window.treeAlwaysAnimatePreferred = treeAlwaysAnimatePreferred;
  window.setTreeAlwaysAnimatePreferred = setTreeAlwaysAnimatePreferred;
  window.CLEVERTREE_ALWAYS_ANIMATE_KEY = CLEVERTREE_ALWAYS_ANIMATE_KEY;
}
