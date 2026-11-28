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
  /data-role="chat-log-title">'\s*\+\s*title/.test(roomJs) ||
    /chat-log-title">' \+[\s\S]{0,40}title/.test(roomJs),
  "chat-log head title must seed from opts.title on mount"
);
assert.ok(
  /data-role="chat-log-head"/.test(roomJs) &&
    /data-role="channel-switch"/.test(roomJs) &&
    /si-rail-head[\s\S]{0,400}si-tabs/.test(roomJs) &&
    !/data-role="si-title"/.test(roomJs),
  "SI head is menu+tabs; channel switch lives on chat-log-head"
);

const roomCss = fs.readFileSync(
  path.join(root, "fronts/room/clevertree-room.css"),
  "utf8"
);
assert.ok(
  /data-chrome="row"/.test(roomCss) &&
    /--ct-si-w:\s*60%/.test(roomCss) &&
    /chat-stack/.test(roomCss) &&
    /col-resize/.test(roomCss),
  "row CSS must default to resizable ~60% SI + chat-stack"
);
assert.ok(
  /data-chrome="row"\] \.si-panel\.si-collapsed \.si-strip-body/.test(roomCss) &&
    /isLandscapeChrome\(\)\) nextSi = true/.test(roomJs),
  "row/desktop must keep SI body visible (no header-only collapse)"
);
assert.ok(
  /data-role="chat-stack"/.test(roomJs),
  "room shell must wrap chat log + composer in chat-stack"
);
assert.ok(
  /data-role="ext-open"/.test(roomJs) &&
    /Open Chat/.test(roomJs) &&
    /data-ext/.test(roomJs) &&
    /setExtHandoff/.test(roomJs) &&
    /extensionOnly:\s*true/.test(roomJs) &&
    /probeExtHandoff/.test(roomJs) &&
    !/setExtPanelOpen/.test(roomJs) &&
    !/Toggle Extension/.test(roomJs) &&
    !/Chat lives in the Clevertree extension/.test(roomJs),
  "extension handoff: Open Chat stays in SI rail whenever extension is present"
);
assert.ok(
  /data-ext="handoff"/.test(roomCss) &&
    /\.si-ext-open/.test(roomCss) &&
    /chat-stack/.test(roomCss),
  "handoff CSS must expand SI full-bleed and style Open Chat in the rail"
);

assert.ok(
  /data-role="nick-input"/.test(roomJs) &&
    /clevertree\.nick/.test(roomJs) &&
    /action:\s*["']name["']/.test(roomJs) &&
    /currentNick\s*\(/.test(roomJs) &&
    !/nick:\s*opts\.nick\s*\|\|\s*["']you["']/.test(roomJs),
  "composer nick field + localStorage; posts must not hard-code nick you"
);
assert.ok(
  /data-role="identity-section"/.test(roomJs) &&
    /passkey-register/.test(roomJs) &&
    /nick-passphrase-reclaim/.test(roomJs),
  "room menu Identity section: passkey + nick passphrase"
);
assert.ok(
  /addEventListener\("input"/.test(roomJs) &&
    /addEventListener\("change"/.test(roomJs) &&
    /persistNickToServer\(nick\)/.test(roomJs) &&
    /aria-hidden/.test(roomJs),
  "nick input persists on change/blur; send also persists; lock badge aria-hidden"
);

console.log("test_room_composer_chrome.js: ok");
