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
  const DEPTH = 8;
  const STEM_N = 520;
  const LEAF_N = 2600;
  // Alternate wide forks with thinner, slightly randomized ones so every tree
  // carries both kinds of complexity; habit still scales tall vs spreading.
  const RANGE_DEG = [32, 11, 34, 13, 36, 15, 32, 16];
  const LENGTHS = [62, 50, 40, 30, 22, 16, 11, 8];
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

  const ix = new Float32Array(6);
  const iy = new Float32Array(6);
  const ishow = new Float32Array(6);

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
  const rootReverse = typeof options.rootReverse === "boolean"
    ? options.rootReverse
    : null;
  const forceFlip = typeof options.forceFlip === "boolean"
    ? options.forceFlip
    : null;
  const widePhase = options.widePhase ? 1 : 0;
  const showIcons = options.icons !== false;
  const clickable = options.clickable !== false;
  const upScale = 0.88 + 0.52 * (1 - habit);
  const sideScale = 0.88 + 0.52 * habit;
  function clampHeading(angle) {
    const max = 1.2 + 0.65 * habit;
    return angle < -max ? -max : angle > max ? max : angle;
  }
  function stemLength(base, angle, spur) {
    const side = Math.abs(Math.sin(angle));
    const habitScale = upScale * (1 - side) + sideScale * side;
    const own = 0.94 + 0.22 * rnd();
    const spurScale = spur ? 0.72 + 0.14 * rnd() : 1;
    return base * habitScale * own * spurScale;
  }
  function turnMag(spread, spur, wideFork) {
    if (spur) return (0.4 + 0.2 * rnd()) * spread;
    if (wideFork) return (0.88 + 0.28 * rnd()) * spread;
    return (0.5 + 0.35 * rnd()) * spread;
  }

  const depthIndex = new Uint16Array(DEPTH + 1);
  let n = 0;
  function addStem(s) {
    const x1 = s.x + Math.sin(s.angle) * s.length;
    const y1 = s.y - Math.cos(s.angle) * s.length;
    const tipRatio = s.depth === 0 ? 0.55 : 0.68;
    let r1 = s.radius * tipRatio;
    if (r1 < 0.35) r1 = 0.35;
    const di = depthIndex[s.depth]++;
    const count = s.depth === 0 ? 1 : Math.pow(2, s.depth - 1);
    const span = count <= 1 ? 0 : di / (count - 1);
    const start = s.depth === 0 ? 0 : Math.min(0.84, s.depth * 0.1 + span * 0.08);
    const end = Math.min(1, start + 0.16);
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
    return { x: x1, y: y1, radius: r1 };
  }

  const trunkLean = (leanSign != null ? leanSign * (2.2 + rnd() * 1.8) : (rnd() * 2 - 1) * 4) * Math.PI / 180;
  const trunkLen = stemLength(82, trunkLean, false);
  const trunk = addStem({
    x: TRUNK_X,
    y: TRUNK_Y,
    angle: trunkLean,
    length: trunkLen,
    radius: 15,
    depth: 0
  });
  const queue = [{
    x: trunk.x,
    y: trunk.y,
    angle: trunkLean,
    radius: trunk.radius,
    depth: 0,
    turnSign: trunkLean >= 0 ? 1 : -1
  }];
  while (queue.length) {
    const s = queue.shift();
    if (s.depth >= DEPTH) continue;
    const wideFork = (s.depth + widePhase) % 2 === 0;
    const spread = RANGE_DEG[s.depth] * Math.PI / 180;
    const habitSpread = spread * (wideFork ? 0.85 + 0.45 * habit : 0.9 + 0.15 * (1 - habit));
    const kids = [];
    if (s.depth === 0) {
      const left = turnMag(habitSpread, false, true);
      const right = turnMag(habitSpread, false, true);
      kids.push({ sign: -1, mag: left, spur: false });
      kids.push({ sign: 1, mag: right, spur: false });
      if (rootReverse != null ? rootReverse : rnd() < 0.5) kids.reverse();
    } else {
      const flip = forceFlip != null ? forceFlip : rnd() >= 0.2;
      const mainSign = flip ? -s.turnSign : s.turnSign;
      kids.push({ sign: mainSign, mag: turnMag(habitSpread, !flip, wideFork), spur: !flip });
      kids.push({ sign: s.turnSign, mag: turnMag(habitSpread, true, wideFork), spur: true });
      if (rnd() < 0.5) kids.reverse();
    }
    for (let k = 0; k < kids.length; k++) {
      const kid = kids[k];
      const nextAngle = clampHeading(s.angle + kid.sign * kid.mag);
      const length = stemLength(LENGTHS[s.depth], nextAngle, kid.spur);
      const made = addStem({
        x: s.x,
        y: s.y,
        angle: nextAngle,
        length: length,
        radius: Math.max(0.45, s.radius * 0.72),
        depth: s.depth + 1
      });
      queue.push({
        x: made.x,
        y: made.y,
        angle: nextAngle,
        radius: made.radius,
        depth: s.depth + 1,
        turnSign: kid.sign
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
  for (let i = 0; i < n; i++) {
    if (sdep[i] === DEPTH) tipIds.push(i);
    if (sdep[i] < 2) continue;
    const ang = sang[i];
    const per = sdep[i] >= 5 ? 5 : 4;
    const base = Math.max(11, 20 - sdep[i] * 1.1);
    for (let k = 0; k < per; k++) {
      const back = k * 1.3;
      lx[leaves] = sx1[i] - Math.sin(ang) * back;
      ly[leaves] = sy1[i] + Math.cos(ang) * back;
      lrot[leaves] = ang + (k - (per - 1) / 2) * 0.48;
      llen[leaves] = base + (k % 3) * 1.8;
      lshow[leaves] = Math.max(0, Math.min(sEnd[i] - 0.02, 1 - 0.035));
      lcol[leaves] = (sdep[i] + k) % LEAF.length;
      ldep[leaves] = sdep[i];
      if (sdep[i] === DEPTH && k === 0 && tipOrdinal % 6 === 0) {
        lfall[leaves] = 1;
        falling += 1;
      } else {
        lfall[leaves] = 0;
      }
      leaves += 1;
    }
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

  // Sit icons on mid-depth forks (branch area), not tip foliage.
  const branchSites = [];
  for (let i = 0; i < n; i++) {
    if (sdep[i] < 3 || sdep[i] > 5) continue;
    const t = 0.58;
    branchSites.push({
      id: i,
      x: sx0[i] + (sx1[i] - sx0[i]) * t,
      y: sy0[i] + (sy1[i] - sy0[i]) * t
    });
  }
  branchSites.sort((a, b) => a.x - b.x);
  const iconBandY = TRUNK_Y - VH * 0.4;
  for (let b = 0; b < 6; b++) {
    const lo = Math.floor(branchSites.length * b / 6);
    const hi = Math.max(lo + 1, Math.floor(branchSites.length * (b + 1) / 6));
    let best = lo;
    let bestScore = Infinity;
    for (let t = lo; t < hi; t++) {
      const site = branchSites[t];
      const score = Math.abs(site.y - iconBandY) + Math.abs((t - lo) / (hi - lo) - 0.5) * 8;
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    const site = branchSites[best] || { id: 0, x: TRUNK_X, y: iconBandY };
    ix[b] = Math.max(VIEW_PAD, Math.min(VW - VIEW_PAD, site.x));
    iy[b] = Math.max(VIEW_PAD, Math.min(VH - VIEW_PAD, site.y));
    ishow[b] = Math.max(0, sEnd[site.id] - 0.03);
  }

  const state = {
    stems: n,
    leaves: leaves,
    falling: falling,
    habit: habit,
    seed: seedBits[0],
    leanSign: leanSign != null ? leanSign : (trunkLean >= 0 ? 1 : -1),
    rootReverse: rootReverse,
    forceFlip: forceFlip,
    widePhase: widePhase,
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

  function iconFolder() {
    ctx.beginPath();
    ctx.moveTo(-6.4, -1);
    ctx.lineTo(-1.7, -1);
    ctx.lineTo(-0.2, -3.1);
    ctx.lineTo(6.4, -3.1);
    ctx.lineTo(6.4, 5.2);
    ctx.lineTo(-6.4, 5.2);
    ctx.closePath();
    ctx.fillStyle = "#fff6d2";
    ctx.strokeStyle = "#c89616";
    ctx.lineWidth = 1.15;
    ctx.fill();
    ctx.stroke();
  }

  function iconNode() {
    ctx.beginPath();
    ctx.arc(0, 0, 6.3, 0, Math.PI * 2);
    ctx.fillStyle = "#fff6d2";
    ctx.fill();
    ctx.strokeStyle = "#e2b423";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = "#c89616";
    ctx.lineWidth = 1.25;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 4.6);
    ctx.lineTo(0, -0.2);
    ctx.moveTo(0, 0.6);
    ctx.lineTo(-4.6, -4.2);
    ctx.moveTo(0, 0.1);
    ctx.lineTo(4.7, -4.4);
    ctx.stroke();
    ctx.fillStyle = "#e2b423";
    const nodes = [[0, 4.6], [-4.6, -4.2], [4.7, -4.4]];
    for (let i = 0; i < nodes.length; i++) {
      ctx.beginPath();
      ctx.arc(nodes[i][0], nodes[i][1], 1.25, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function iconGear() {
    ctx.beginPath();
    const teeth = 8;
    const rIn = 3.05;
    const rOut = 5.45;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2 - Math.PI / 2;
      const step = (Math.PI * 2) / teeth;
      const pt = (ang, r, move) => {
        const x = Math.cos(ang) * r;
        const y = Math.sin(ang) * r;
        if (move) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      };
      pt(a, rIn, i === 0);
      pt(a + step * 0.28, rIn, false);
      pt(a + step * 0.38, rOut, false);
      pt(a + step * 0.9, rOut, false);
      pt(a + step, rIn, false);
    }
    ctx.closePath();
    ctx.moveTo(1.45, 0);
    ctx.arc(0, 0, 1.45, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fillStyle = "#fff6d2";
    ctx.strokeStyle = "#c89616";
    ctx.lineWidth = 1.05;
    ctx.fill("evenodd");
    ctx.stroke();
  }

  function iconCheck() {
    ctx.beginPath();
    ctx.arc(0, 0, 6.2, 0, Math.PI * 2);
    ctx.fillStyle = "#fff6d2";
    ctx.fill();
    ctx.strokeStyle = "#e2b423";
    ctx.lineWidth = 1.05;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-4.4, 0.3);
    ctx.lineTo(-1.3, 3.6);
    ctx.lineTo(4.8, -3.6);
    ctx.strokeStyle = "#c89616";
    ctx.lineWidth = 1.7;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  function iconClock() {
    ctx.beginPath();
    ctx.arc(0, 0, 5.7, 0, Math.PI * 2);
    ctx.fillStyle = "#fff6d2";
    ctx.fill();
    ctx.strokeStyle = "#c89616";
    ctx.lineWidth = 1.15;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -2.5);
    ctx.lineTo(0, 0.5);
    ctx.lineTo(2.3, 2.1);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.fillStyle = "#e2b423";
    ctx.beginPath();
    ctx.arc(0, 0, 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  function iconQuote() {
    ctx.beginPath();
    ctx.moveTo(-5.1, -3.5);
    ctx.lineTo(4.2, -3.5);
    ctx.quadraticCurveTo(6.3, -3.5, 6.3, -1.6);
    ctx.lineTo(6.3, 2.1);
    ctx.quadraticCurveTo(6.3, 4, 4.2, 4);
    ctx.lineTo(-0.4, 4);
    ctx.lineTo(-3.4, 6.7);
    ctx.lineTo(-3.4, 4);
    ctx.lineTo(-5.1, 4);
    ctx.quadraticCurveTo(-7.1, 4, -7.1, 2.1);
    ctx.lineTo(-7.1, -1.6);
    ctx.quadraticCurveTo(-7.1, -3.5, -5.1, -3.5);
    ctx.closePath();
    ctx.fillStyle = "#fff6d2";
    ctx.strokeStyle = "#c89616";
    ctx.lineWidth = 1.1;
    ctx.lineJoin = "round";
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-2.5, -0.5);
    ctx.lineTo(1.3, -0.5);
    ctx.moveTo(-2.5, 1.5);
    ctx.lineTo(2.3, 1.5);
    ctx.stroke();
  }

  const icons = [iconFolder, iconNode, iconGear, iconCheck, iconClock, iconQuote];

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
    if (showIcons) {
      for (let b = 0; b < 6; b++) {
        const p = easeOut(clamp01((u - ishow[b]) / 0.05));
        if (p <= 0) continue;
        ctx.save();
        ctx.translate(ix[b], iy[b]);
        const s = p * 1.75;
        ctx.scale(s, s);
        icons[b]();
        ctx.restore();
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
/** Deterministic catalog covering habit, lean, wide-phase, flip, and root order. */
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
  const phases = [
    { widePhase: 0, phaseLabel: "wide-on-even" },
    { widePhase: 1, phaseLabel: "wide-on-odd" }
  ];
  const flips = [
    { forceFlip: true, flipLabel: "cross-fork" },
    { forceFlip: false, flipLabel: "continue-fork" }
  ];
  const out = [];
  let i = 0;
  for (const h of habits) {
    for (const l of leans) {
      for (const p of phases) {
        for (const f of flips) {
          i += 1;
          const rootReverse = i % 2 === 0;
          out.push({
            id: i,
            habit: h.habit,
            habitLabel: h.habitLabel,
            leanSign: l.leanSign,
            leanLabel: l.leanLabel,
            widePhase: p.widePhase,
            phaseLabel: p.phaseLabel,
            forceFlip: f.forceFlip,
            flipLabel: f.flipLabel,
            rootReverse: rootReverse,
            rootLabel: rootReverse ? "right-first" : "left-first",
            // Stable seed per cell so regen keeps the same micro-noise.
            seed: (i * 2654435761) >>> 0,
            icons: false,
            label: [
              h.habitLabel,
              l.leanLabel,
              p.phaseLabel,
              f.flipLabel,
              rootReverse ? "right-first" : "left-first"
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
