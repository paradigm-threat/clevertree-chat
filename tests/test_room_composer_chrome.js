/**
 * Static guards for composer chrome expand/collapse race fixes.
 * Companion to tests/e2e/room-composer-chrome.spec.ts.
 */
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const roomJs = fs.readFileSync(
  path.join(root, "fronts/room/clevertree-room.js"),
  "utf8"
);

assert.ok(
  /function suppressHistoryCollapse\s*\(/.test(roomJs),
  "suppressHistoryCollapse helper required"
);
assert.ok(
  /suppressHistoryCollapse\(CHROME_MS\s*\+\s*280\)/.test(roomJs),
  "setChromeState / focusComposer must suppress history-scroll collapse across chrome anim"
);
assert.ok(
  /suppressHistoryScrollCollapse\s*\|\|\s*state\.chromeAnimTimer/.test(roomJs) ||
    /state\.suppressHistoryScrollCollapse\s*\|\|\s*state\.chromeAnimTimer/.test(
      roomJs
    ),
  "history scroll handler must ignore layout reflow during chrome anim"
);
assert.ok(
  /suppressHistoryCollapse\(160\)/.test(roomJs),
  "keepComposerInView must suppress before programmatic history scroll"
);
assert.ok(
  /pointerdown/.test(roomJs) &&
    /draft\.addEventListener\(\s*["']pointerdown["']/.test(roomJs),
  "draft pointerdown should expand before focus races on WebViews"
);
assert.ok(
  /document\.activeElement\s*!==\s*draft/.test(roomJs),
  "applyComposerClass should not re-focus when already focused"
);
assert.ok(
  /function holdComposer\s*\(/.test(roomJs) &&
    /holdComposerOpen/.test(roomJs),
  "holdComposer must block scroll-collapse while focusing the draft"
);
assert.ok(
  /function isLandscapeChrome\s*\(/.test(roomJs) &&
    /data-chrome/.test(roomJs) &&
    /gutter-si/.test(roomJs) &&
    /PANEL_W_KEY/.test(roomJs) &&
    /clevertree\.room\.panelWidths/.test(roomJs),
  "row chrome mode + resize gutters + persisted panel widths required"
);
assert.ok(
  /data-chrome", row \? "row" : "stack"/.test(roomJs) ||
    /"row" : "stack"/.test(roomJs),
  "landscape/desktop must use data-chrome=row with persisted % panels"
);
assert.ok(
  /draft\.focus\(\)/.test(roomJs) &&
    /holdComposer\(CHROME_MS/.test(roomJs),
  "focusComposer must focus draft in-gesture before chrome expand"
);
assert.ok(
  /function wireChromeSwipe\s*\(/.test(roomJs) &&
    /wireChromeSwipe\(aiPanel,\s*["']down["']\)/.test(roomJs) &&
    /wireChromeSwipe\(composerEl,\s*["']up["']\)/.test(roomJs) &&
    !/wireChromeSwipe\(history\)/.test(roomJs),
  "swipes bind to SI/composer shells only — not scrolling history"
);
assert.ok(
  /function keepComposerOpenInRow\s*\(/.test(roomJs) &&
    /keepComposerOpenInRow\(\)/.test(roomJs),
  "landscape/desktop must keep composer open when chrome collapses"
);
assert.ok(
  /function normalizeMirrors\s*\(/.test(roomJs) &&
    /function roomAssetUrl\s*\(/.test(roomJs) &&
    /roomAssetUrl\(\s*["']channel-policy\.json["']\s*\)/.test(roomJs),
  "mirrors must normalize bare hosts; channel-policy loads from script URL"
);
assert.ok(
  /data-role="si-title">'\s*\+\s*title/.test(roomJs) ||
    /si-title">' \+[\s\S]{0,20}title/.test(roomJs),
  "SI rail title must seed from opts.title on mount"
);

const roomCss = fs.readFileSync(
  path.join(root, "fronts/room/clevertree-room.css"),
  "utf8"
);
assert.ok(
  /data-chrome="row"/.test(roomCss) &&
    /--ct-si-w:\s*33%/.test(roomCss) &&
    /--ct-co-w:\s*33%/.test(roomCss) &&
    /col-resize/.test(roomCss),
  "row CSS must default to resizable ~33% panel vars"
);

console.log("test_room_composer_chrome.js: ok");
