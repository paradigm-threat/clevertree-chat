/**
 * Relay sidepanel preview hardening checks (no browser).
 * - Must not assign window.chrome (Cursor/Electron expose a non-writable stub).
 * - Must mount immediately so local HTTP preview works if collection fetch stalls.
 * - Shared room module must export mount + pickMirror.
 */
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const vm = require("vm");

const root = path.join(__dirname, "..");
const sidepanel = fs.readFileSync(
  path.join(root, "fronts/relay-extension/sidepanel.js"),
  "utf8"
);
const roomJs = fs.readFileSync(
  path.join(root, "fronts/room/clevertree-room.js"),
  "utf8"
);
const tagsJs = fs.readFileSync(
  path.join(root, "fronts/room/context-tags.js"),
  "utf8"
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "fronts/relay-extension/manifest.json"), "utf8")
);

assert.ok(/var ext =/.test(sidepanel), "sidepanel must use local ext alias");
assert.ok(!/window\.chrome\s*=/.test(sidepanel), "must not assign window.chrome");
assert.ok(
  /mountRoom\(\);\s*\n\s*setRefreshUi\(\);/.test(sidepanel),
  "must mount room immediately for preview"
);
assert.ok(
  /GATHER_START/.test(sidepanel),
  "Refresh must send GATHER_START"
);
assert.ok(
  !/showGather:\s*true/.test(sidepanel),
  "gather must not be enabled inside room opts"
);
assert.equal(manifest.side_panel.default_path, "sidepanel.html");
assert.ok(
  (manifest.host_permissions || []).some((h) => /nextdoor\.com/.test(h)),
  "extension needs nextdoor host permission"
);

const sandbox = {
  console,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  localStorage: { getItem: () => null, setItem() {} },
  document: { createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }) },
};
sandbox.self = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(tagsJs, sandbox, { filename: "context-tags.js" });
vm.runInContext(roomJs, sandbox, { filename: "clevertree-room.js" });
assert.equal(typeof sandbox.CleverTreeRoom.mount, "function");
assert.equal(typeof sandbox.CleverTreeRoom.pickMirror, "function");
assert.ok(Array.isArray(sandbox.CleverTreeRoom.BOT_NICKS));
assert.ok(sandbox.CleverTreeContextTags);
assert.equal(
  typeof sandbox.CleverTreeContextTags.autoTag,
  "function"
);

const tagged = sandbox.CleverTreeContextTags.autoTag("hello", {
  collection: "savannah-cat-rescue",
});
assert.ok(/\[\[c:savannah-cat-rescue\]\]/.test(tagged), tagged);
const html = sandbox.CleverTreeContextTags.renderHtml(tagged);
assert.ok(!/\[\[c:/.test(html), "raw tags hidden in render");
assert.ok(/ct-tag|chip|savannah/i.test(html), html);

console.log("test_relay_sidepanel_preview.js: ok");
