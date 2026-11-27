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

console.log("test_room_composer_chrome.js: ok");
