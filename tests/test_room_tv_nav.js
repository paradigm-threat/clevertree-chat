/**
 * Android TV remote / D-pad room mode — including spatial grid focus.
 */
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const vm = require("vm");

const root = path.join(__dirname, "..");
const roomJs = fs.readFileSync(
  path.join(root, "fronts/room/clevertree-room.js"),
  "utf8"
);
const builtins = fs.readFileSync(
  path.join(root, "fronts/room/ct-builtins.js"),
  "utf8"
);
const live = fs.readFileSync(path.join(root, "fronts/room/live.html"), "utf8");
const css = fs.readFileSync(
  path.join(root, "fronts/room/clevertree-room.css"),
  "utf8"
);

assert.ok(/tv:\s*tv/.test(live) || /opts\.tv\s*=\s*tv/.test(live), "live.html passes tv opt");
assert.ok(/q\.get\("tv"\)\s*===\s*"1"/.test(live), "live.html reads tv=1 query");

assert.ok(/tvMode/.test(roomJs), "room JS has tvMode");
assert.ok(/tvBoot/.test(roomJs), "room JS exports tvBoot");
assert.ok(/tvInjectTranscript/.test(roomJs), "room JS exports tvInjectTranscript");
assert.ok(/tvMediaCommand/.test(roomJs), "room JS exports tvMediaCommand");
assert.ok(/data-role="dictate"/.test(roomJs), "composer has Dictate control for remote mic");
assert.ok(/AndroidRoom\.startDictate/.test(roomJs), "Dictate calls native bridge");
assert.ok(/focusFirstInCluster/.test(roomJs), "TV spatial nav focuses SI/chat clusters");
assert.ok(/ArrowLeft/.test(roomJs) && /ArrowRight/.test(roomJs), "TV arrow key handler");
assert.ok(/tvMoveSpatial/.test(roomJs), "TV uses spatial focus move");
assert.ok(/pickSpatialFocusTarget/.test(roomJs), "spatial picker exported");

assert.ok(
  /ArrowLeft/.test(builtins) && /ct-car-card/.test(builtins),
  "carousel cards support arrow Left/Right focus move"
);
assert.ok(/ArrowUp/.test(builtins) && /ArrowDown/.test(builtins), "carousel handles Up/Down");

assert.ok(
  /data-tv="1"/.test(css) || /\[data-tv="1"\]/.test(css),
  "TV focus ring CSS present"
);

const sandbox = {
  window: {},
  document: { documentElement: { getAttribute: () => null } },
  localStorage: {
    _d: {},
    getItem(k) {
      return this._d[k] || null;
    },
    setItem(k, v) {
      this._d[k] = String(v);
    },
    removeItem(k) {
      delete this._d[k];
    },
  },
  console,
  setTimeout,
  clearTimeout,
  URL,
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.runInNewContext(roomJs, sandbox);
const Room = sandbox.CleverTreeRoom || sandbox.window.CleverTreeRoom;
assert.ok(Room && Room.pickSpatialFocusTarget, "CleverTreeRoom.pickSpatialFocusTarget");

/* 2×2 grid — Down from top-left must go to bottom-left, not top-right. */
const grid = [
  { left: 0, top: 0, width: 100, height: 100 },
  { left: 120, top: 0, width: 100, height: 100 },
  { left: 0, top: 120, width: 100, height: 100 },
  { left: 120, top: 120, width: 100, height: 100 },
];
assert.strictEqual(
  Room.pickSpatialFocusTarget(grid, 0, 0, 1),
  2,
  "Down from (0,0) → (0,1)"
);
assert.strictEqual(
  Room.pickSpatialFocusTarget(grid, 0, 1, 0),
  1,
  "Right from (0,0) → (1,0)"
);
assert.strictEqual(
  Room.pickSpatialFocusTarget(grid, 1, 0, 1),
  3,
  "Down from (1,0) → (1,1)"
);
assert.strictEqual(
  Room.pickSpatialFocusTarget(grid, 2, 0, -1),
  0,
  "Up from (0,1) → (0,0)"
);
assert.strictEqual(
  Room.pickSpatialFocusTarget(grid, 0, 0, -1),
  -1,
  "Up from top row → none"
);
assert.strictEqual(
  Room.pickHorizontalWrapTarget(grid, 1, 1),
  0,
  "Right wrap on top row → leftmost"
);

console.log("test_room_tv_nav.js: ok");
