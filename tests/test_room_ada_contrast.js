/**
 * Static ADA guards for the shared room stylesheet.
 * Catches white-on-mint Send regressions before Playwright/axe.
 */
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const css = fs.readFileSync(
  path.join(root, "fronts/room/clevertree-room.css"),
  "utf8"
);
const darkTokens = fs.readFileSync(
  path.join(root, "fronts/room/themes/dark.css"),
  "utf8"
);

function relLum(hex) {
  const h = String(hex).replace("#", "");
  const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = rgb.map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(a, b) {
  const L1 = relLum(a);
  const L2 = relLum(b);
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

// Forbidden pattern that failed on dark theme (white text on --green mint).
assert.ok(
  !/\.room\s+\.send\{[^}]*color:\s*white[^}]*background:\s*var\(--green\)/i.test(
    css
  ),
  "Send must not use color:white on background:var(--green) (fails on dark mint brand)"
);
assert.ok(
  !/\.room\s+\.send\{[^}]*background:\s*var\(--green\)[^}]*color:\s*white/i.test(
    css
  ),
  "Send must not use background:var(--green) with color:white"
);

// Preferred dark-on-light send styling is present.
assert.ok(
  /\.room\s+\.send\{[^}]*color:\s*var\(--ink\)/i.test(css) ||
    /color:var\(--ink\);background:var\(--green2\)/.test(css),
  "Send should use dark ink on light sage in the light/default theme"
);
assert.ok(
  /\[data-theme="dark"\][^{]*\.send[\s\S]{0,200}ct-action-ink/i.test(css),
  "Dark theme Send should use --ct-action-ink (dark) on --ct-action (light mint)"
);

// Token pair used by dark Send must meet WCAG AA (4.5:1) for normal text.
assert.ok(
  /--ct-action:\s*#a8d4b4/i.test(darkTokens),
  "dark --ct-action expected"
);
assert.ok(
  /--ct-action-ink:\s*#14291d/i.test(darkTokens),
  "dark --ct-action-ink expected"
);
const ratio = contrast("#14291d", "#a8d4b4");
assert.ok(
  ratio >= 4.5,
  `dark action ink/action contrast ${ratio.toFixed(2)} must be ≥ 4.5`
);

// White on dark mint would fail — keep this guard documented.
assert.ok(
  contrast("#ffffff", "#a8d4b4") < 3,
  "sanity: white-on-mint is a known fail; tests should keep rejecting it"
);

console.log("test_room_ada_contrast.js: ok");
