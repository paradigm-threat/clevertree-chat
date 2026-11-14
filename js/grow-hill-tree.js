/* Shared hillside tree grower for the home hero and /forest horizon. */

var CLEVERTREE_ALWAYS_ANIMATE_KEY = "clevertree-always-animate";

/** Foliage ranges along green → fall (no pink blossoms / blue-teal). */
var TREE_LEAF_PALETTES = {
  pine: ["#0f3d28", "#145234", "#1a6840", "#217a4a", "#288854", "#2f9660"],
  oak: ["#1a5c22", "#226a28", "#2b7a2e", "#348a34", "#3f9a38", "#4eaa3c"],
  maple: ["#2a7a28", "#3a8e2c", "#4aa230", "#5ab434", "#6ec438", "#84d242"],
  summer: ["#1f6b28", "#247a24", "#2f8a28", "#3e9a32", "#4ea628", "#62b41e", "#78c422"],
  birch: ["#6a9a3a", "#7aac42", "#8abe4a", "#9ad052", "#a8d85e", "#b6e06a"],
  aspen: ["#7ab034", "#8cbc3c", "#9ec844", "#b0d44c", "#c0dc58", "#d0e464"],
  autumn: ["#8a4a18", "#a85a1c", "#c46a20", "#d87828", "#c05028", "#a03820"],
  fall: ["#b84818", "#c85820", "#d86828", "#e07830", "#c04028", "#982828"]
};

/** Deeper night ramps for /forest under prefers-color-scheme: dark. */
var TREE_LEAF_PALETTES_NIGHT = {
  pine: ["#061a12", "#0a2818", "#0e3620", "#124428", "#165230", "#1a6038"],
  oak: ["#0c2e14", "#123a18", "#18461c", "#1e5220", "#245e24", "#2a6a28"],
  maple: ["#143c18", "#1a4a1c", "#205820", "#286628", "#307430", "#3a8238"],
  summer: ["#0e3414", "#124018", "#184c1c", "#1e581e", "#266424", "#2e7028"],
  birch: ["#3a5820", "#446628", "#4e7430", "#588238", "#629040", "#6c9e48"],
  aspen: ["#446820", "#4e7628", "#588430", "#629238", "#6ca040", "#76ae48"],
  autumn: ["#5a3010", "#6a3a14", "#7a4418", "#8a4e1c", "#7a3818", "#6a2814"],
  fall: ["#6a2810", "#7a3014", "#8a3818", "#9a401c", "#7a2818", "#5a2014"]
};

var TREE_LEAF_PALETTE_NAMES = Object.keys(TREE_LEAF_PALETTES);

var TREE_VW = 520;
var TREE_VH = 400;
var TREE_DEPTH = 7;
var TREE_STEM_N = 2200;
var TREE_LEAF_N = 12000;
var TREE_TRUNK_X = TREE_VW * 0.5;
var TREE_TRUNK_Y = TREE_VH - 8;
var TREE_VIEW_PAD = 28;
var TREE_RANGE_DEG = [34, 32, 36, 34, 38, 34, 32, 28];
var TREE_LENGTHS = [64, 56, 48, 40, 32, 24, 16, 11];
var TREE_BARK = ["#5c3d22", "#684628", "#755230", "#825e38", "#8f6a42", "#9c764c"];

function prefersDarkScheme() {
  if (typeof document !== "undefined" && document.documentElement) {
    var forced = document.documentElement.getAttribute("data-theme");
    if (forced === "dark") return true;
    if (forced === "light") return false;
  }
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch (e) {
    return false;
  }
}

function resolveLeafPalette(options) {
  const o = options || {};
  if (Array.isArray(o.leafColors) && o.leafColors.length) {
    return o.leafColors.slice();
  }
  const name = typeof o.leafPalette === "string" ? o.leafPalette : "";
  const forceDay = o.dayLeaves === true;
  const useNight = !forceDay && prefersDarkScheme();
  const table = useNight ? TREE_LEAF_PALETTES_NIGHT : TREE_LEAF_PALETTES;
  if (name && table[name]) {
    return table[name].slice();
  }
  if (name && TREE_LEAF_PALETTES[name]) {
    return (useNight && TREE_LEAF_PALETTES_NIGHT[name]
      ? TREE_LEAF_PALETTES_NIGHT[name]
      : TREE_LEAF_PALETTES[name]).slice();
  }
  return (useNight ? TREE_LEAF_PALETTES_NIGHT : TREE_LEAF_PALETTES).summer.slice();
}

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

function clamp01Tree(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function easeOutTree(t) {
  return 1 - (1 - t) * (1 - t);
}

function applyTreeTransform(ctx, transform) {
  if (!transform) return;
  if (transform.m) {
    var m = transform.m;
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    return;
  }
  var sx = transform.sx != null ? transform.sx : (transform.scale != null ? transform.scale : 1);
  var sy = transform.sy != null ? transform.sy : sx;
  ctx.setTransform(sx, 0, 0, sy, transform.tx || 0, transform.ty || 0);
}

/**
 * Soft elliptical ground shade at the trunk base (local VW×VH space).
 * Grows with u; no cast silhouette.
 */
function paintTreeShade(ctx, transform, u, opts) {
  var o = opts || {};
  var uu = clamp01Tree(u == null ? 1 : u);
  if (uu <= 0) return;
  var night = !!o.night;
  var rx = (o.rx != null ? o.rx : 100) * uu;
  var ry = (o.ry != null ? o.ry : 30) * uu;
  var alpha = (night ? 0.32 : 0.24) * uu;
  ctx.save();
  applyTreeTransform(ctx, transform);
  var cx = TREE_TRUNK_X;
  var cy = TREE_TRUNK_Y + 6;
  var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
  if (night) {
    g.addColorStop(0, "rgba(0, 0, 0, " + alpha + ")");
    g.addColorStop(0.55, "rgba(0, 0, 0, " + (alpha * 0.45) + ")");
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
  } else {
    g.addColorStop(0, "rgba(18, 36, 16, " + alpha + ")");
    g.addColorStop(0.55, "rgba(18, 36, 16, " + (alpha * 0.4) + ")");
    g.addColorStop(1, "rgba(18, 36, 16, 0)");
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Build stem/leaf buffers for one tree. Shared by home hero and forest stand.
 * options.lod === "far" uses a lighter graph for distant canopy trees.
 */
function buildTreeModel(opts) {
  const options = opts && typeof opts === "object" ? opts : {};
  const farLod = options.lod === "far";
  const VW = TREE_VW;
  const VH = TREE_VH;
  const DEPTH = farLod ? 5 : TREE_DEPTH;
  const STEM_N = farLod ? 700 : TREE_STEM_N;
  const LEAF_N = farLod ? 2800 : TREE_LEAF_N;
  const RANGE_DEG = TREE_RANGE_DEG;
  const LENGTHS = TREE_LENGTHS;
  const TRUNK_X = TREE_TRUNK_X;
  const TRUNK_Y = TREE_TRUNK_Y;
  const VIEW_PAD = TREE_VIEW_PAD;

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
  const lcol = new Uint8Array(LEAF_N);
  const ldep = new Uint8Array(LEAF_N);
  const lstem = new Uint16Array(LEAF_N);
  const bx0 = new Float32Array(STEM_N);
  const by0 = new Float32Array(STEM_N);
  const bx1 = new Float32Array(STEM_N);
  const by1 = new Float32Array(STEM_N);
  const bang = new Float32Array(STEM_N);

  const BARK = TREE_BARK;
  const LEAF = resolveLeafPalette(options);

  const seedBits = new Uint32Array(1);
  if (options.seed != null) {
    seedBits[0] = options.seed >>> 0;
  } else if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(seedBits);
  } else {
    seedBits[0] = (Math.random() * 0xffffffff) >>> 0;
  }
  let seed = (seedBits[0] % 2147483646) + 1;
  function rnd() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }
  const habit = options.habit != null
    ? Math.max(0, Math.min(1, Number(options.habit)))
    : rnd();
  const leanSign = options.leanSign === -1 || options.leanSign === 1
    ? options.leanSign
    : null;
  const branchiness = options.branchiness != null
    ? Math.max(0, Math.min(1, Number(options.branchiness)))
    : 0.35 + rnd() * 0.55;
  const asymmetry = options.asymmetry != null
    ? Math.max(0, Math.min(1, Number(options.asymmetry)))
    : 0.35 + rnd() * 0.55;
  const sideBias = options.sideBias === -1 || options.sideBias === 1
    ? options.sideBias
    : (leanSign != null ? leanSign : (rnd() < 0.5 ? -1 : 1));

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
    sStart[idx] = 0;
    sEnd[idx] = 0;
    sWidthStart[idx] = 0;
    sWidthEnd[idx] = 0;
    n += 1;
    return { x: x1, y: y1, radius: r1, bx: s.x, by: s.y, index: idx };
  }

  const trunkLean = (leanSign != null ? leanSign * (2.2 + rnd() * 1.8) : (rnd() * 2 - 1) * 4) * Math.PI / 180;
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
    if (!s.isLeader && s.depth >= 3 && rnd() > 0.35 + 0.6 * branchiness) continue;
    const spread = RANGE_DEG[Math.min(s.depth, RANGE_DEG.length - 1)] * Math.PI / 180;
    const latOpen = (0.82 + 0.48 * habit) * (0.8 + 0.3 * asymmetry);
    const leaderKeep = 0.06 + 0.12 * (1 - habit);
    const kids = [];

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

  let leaves = 0;
  const leafMinDist = farLod ? 5.5 : 3.2;
  function leafTooClose(x, y) {
    if (farLod) return false;
    for (let j = 0; j < leaves; j++) {
      const dx = lx[j] - x;
      const dy = ly[j] - y;
      if (dx * dx + dy * dy < leafMinDist * leafMinDist) return true;
    }
    return false;
  }
  for (let i = 0; i < n; i++) {
    if (sdep[i] < 2) continue;
    const ang = sang[i];
    let per = sdep[i] >= 5 ? 7 : (sdep[i] >= 3 ? 5 : 4);
    if (farLod) per = Math.max(2, Math.round(per * 0.45));
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
      lshow[leaves] = Math.max(0, Math.min(sEnd[i] + 0.01, 0.98));
      lcol[leaves] = (sdep[i] + k) % LEAF.length;
      ldep[leaves] = sdep[i];
      leaves += 1;
    }
    if (leaves >= LEAF_N) break;
  }

  return {
    VW: VW,
    VH: VH,
    DEPTH: DEPTH,
    TRUNK_X: TRUNK_X,
    TRUNK_Y: TRUNK_Y,
    n: n,
    leaves: leaves,
    sx0: sx0,
    sy0: sy0,
    sx1: sx1,
    sy1: sy1,
    sw0: sw0,
    sw1: sw1,
    sang: sang,
    sdep: sdep,
    sParent: sParent,
    sAlong: sAlong,
    sStart: sStart,
    sEnd: sEnd,
    sWidthStart: sWidthStart,
    sWidthEnd: sWidthEnd,
    lx: lx,
    ly: ly,
    lox: lox,
    loy: loy,
    lrot: lrot,
    llen: llen,
    lshow: lshow,
    lcol: lcol,
    ldep: ldep,
    lstem: lstem,
    bx0: bx0,
    by0: by0,
    bx1: bx1,
    by1: by1,
    bang: bang,
    BARK: BARK,
    LEAF: LEAF,
    habit: habit,
    seed: seedBits[0],
    leanSign: leanSign != null ? leanSign : (trunkLean >= 0 ? 1 : -1),
    branchiness: branchiness,
    asymmetry: asymmetry,
    sideBias: sideBias,
    leafPalette: (options && options.leafPalette) || "summer",
    lod: farLod ? "far" : "full"
  };
}

function drawStemPath(ctx, x0, y0, x1, y1, r0, r1) {
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

function drawLeafPath(ctx, x, y, angle, len) {
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

function copyTreeRestPose(model) {
  const n = model.n;
  for (let i = 0; i < n; i++) {
    model.bx0[i] = model.sx0[i];
    model.by0[i] = model.sy0[i];
    model.bx1[i] = model.sx1[i];
    model.by1[i] = model.sy1[i];
    model.bang[i] = model.sang[i];
  }
}

/**
 * Paint a built tree into ctx. Does not clear the surface.
 * transform maps local VW×VH into the destination (omit for identity under current CTM).
 * paintOpts.clear === true clears the canvas bitmap first (home hero).
 */
function paintTreeModel(ctx, model, u, transform, paintOpts) {
  if (!ctx || !model) return;
  const o = paintOpts || {};
  const uu = clamp01Tree(u == null ? 1 : u);
  const n = model.n;
  const leaves = model.leaves;
  const DEPTH = model.DEPTH;
  const BARK = model.BARK;
  const LEAF = model.LEAF;

  if (o.clear && ctx.canvas) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }

  copyTreeRestPose(model);

  ctx.save();
  applyTreeTransform(ctx, transform);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  function paintStemAt(i) {
    const lenGrow = model.sEnd[i] - model.sStart[i] || 0.001;
    const lenP = clamp01Tree((uu - model.sStart[i]) / lenGrow);
    if (lenP <= 0) return;
    const e = easeOutTree(lenP);
    const wGrow = model.sWidthEnd[i] - model.sWidthStart[i] || 0.001;
    let widthP;
    if (uu < model.sWidthStart[i]) {
      widthP = 0.42 + 0.28 * e;
    } else {
      widthP = 0.7 + 0.3 * easeOutTree(clamp01Tree((uu - model.sWidthStart[i]) / wGrow));
    }
    ctx.fillStyle = BARK[Math.min(model.sdep[i], BARK.length - 1)];
    const x0 = model.sx0[i];
    const y0 = model.sy0[i];
    const x1 = model.sx1[i];
    const y1 = model.sy1[i];
    const r0 = model.sw0[i] * widthP;
    const r1 = (model.sw0[i] + (model.sw1[i] - model.sw0[i]) * e) * widthP;
    drawStemPath(
      ctx,
      x0,
      y0,
      x0 + (x1 - x0) * e,
      y0 + (y1 - y0) * e,
      r0,
      Math.max(0.2, r1)
    );
  }

  function paintLeafAt(i) {
    if (uu < model.lshow[i]) return;
    const bloom = easeOutTree(clamp01Tree((uu - model.lshow[i]) / 0.035));
    if (bloom <= 0) return;
    ctx.fillStyle = LEAF[model.lcol[i]];
    drawLeafPath(
      ctx,
      model.lx[i],
      model.ly[i],
      model.lrot[i],
      model.llen[i] * (uu < 1 ? (0.35 + 0.65 * bloom) : 1)
    );
  }

  for (let d = DEPTH; d >= 0; d--) {
    for (let i = 0; i < leaves; i++) {
      if (model.ldep[i] === d) paintLeafAt(i);
    }
    for (let i = 0; i < n; i++) {
      if (model.sdep[i] === d) paintStemAt(i);
    }
  }
  ctx.restore();
}

function growHillTree(canvas, opts) {
  const options = opts && typeof opts === "object" ? opts : {};
  const reduce = !!options.reduce;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  if (typeof canvas._growStop === "function") canvas._growStop();
  canvas._growOpts = options;

  const VW = TREE_VW;
  const VH = TREE_VH;
  const DURATION = options.duration > 0 ? options.duration : 30000;
  const START_DELAY = options.delay > 0 ? options.delay : 0;
  const clickable = options.clickable !== false;
  const staticOnly = !!reduce || options.performance === true || options.animate === false;
  const shade = options.shade !== false;
  const nightShade = options.night === true || (!options.dayLeaves && prefersDarkScheme());

  const model = buildTreeModel(options);
  const state = {
    stems: model.n,
    leaves: model.leaves,
    falling: 0,
    habit: model.habit,
    seed: model.seed,
    leanSign: model.leanSign,
    branchiness: model.branchiness,
    asymmetry: model.asymmetry,
    sideBias: model.sideBias,
    wind: "calm",
    leafPalette: model.leafPalette,
    leafColors: model.LEAF,
    alwaysAnimate: false,
    motion: reduce ? "reduced" : "growing",
    alive: !reduce,
    u: reduce ? 1 : 0
  };
  canvas._grow = state;
  canvas._growModel = model;
  canvas._swayVisible = true;

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

  function draw(u) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    const xf = {
      m: [canvas.width / VW, 0, 0, canvas.height / VH, 0, 0]
    };
    if (shade) {
      paintTreeShade(ctx, xf, u, { night: nightShade });
    }
    paintTreeModel(ctx, model, u, xf, {});
  }

  let raf = 0;
  let stopped = false;
  const watcher = new ResizeObserver(function () {
    if (stopped) return;
    if (!layout()) return;
    draw(state.motion === "grow" ? state.u : 1);
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

  function notifyPaused(paused) {
    if (typeof options.onSwayPause === "function") {
      try { options.onSwayPause(!!paused, state); } catch (e) {}
    }
  }

  function paintStatic() {
    if (layout()) draw(1);
    state.u = 1;
    state.motion = "static";
    state.alive = false;
    notifyPaused(false);
  }

  function startSway() {
    if (stopped) return;
    state.motion = "held";
    state.alive = false;
    if (layout()) draw(1);
  }

  canvas._growResumeSway = function resumeSway() {
    startSway();
  };

  if (staticOnly) {
    paintStatic();
    return;
  }

  notifyPaused(false);
  state.motion = "grow";

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
    state.motion = "grow";
    draw(u);
    if (u < 1) {
      raf = requestAnimationFrame(frame);
    } else {
      raf = 0;
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
  window.buildTreeModel = buildTreeModel;
  window.paintTreeModel = paintTreeModel;
  window.paintTreeShade = paintTreeShade;
  window.applyTreeTransform = applyTreeTransform;
  window.TREE_VW = TREE_VW;
  window.TREE_VH = TREE_VH;
  window.TREE_TRUNK_X = TREE_TRUNK_X;
  window.TREE_TRUNK_Y = TREE_TRUNK_Y;
  window.forestAlternationCatalog = forestAlternationCatalog;
  window.treeWindAllowed = treeWindAllowed;
  window.effectiveWind = effectiveWind;
  window.treeAlwaysAnimatePreferred = treeAlwaysAnimatePreferred;
  window.setTreeAlwaysAnimatePreferred = setTreeAlwaysAnimatePreferred;
  window.CLEVERTREE_ALWAYS_ANIMATE_KEY = CLEVERTREE_ALWAYS_ANIMATE_KEY;
  window.TREE_LEAF_PALETTES = TREE_LEAF_PALETTES;
  window.TREE_LEAF_PALETTES_NIGHT = TREE_LEAF_PALETTES_NIGHT;
  window.TREE_LEAF_PALETTE_NAMES = TREE_LEAF_PALETTE_NAMES;
  window.resolveLeafPalette = resolveLeafPalette;
  window.prefersDarkScheme = prefersDarkScheme;
}
