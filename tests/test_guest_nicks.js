/**
 * Guest forest nick list + mint helpers.
 */
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const vm = require("vm");

const root = path.join(__dirname, "..");
const guestJs = fs.readFileSync(
  path.join(root, "fronts/room/guest-nicks.js"),
  "utf8"
);
const guestJson = JSON.parse(
  fs.readFileSync(path.join(root, "fronts/room/guest-nicks.json"), "utf8")
);
const roomJs = fs.readFileSync(
  path.join(root, "fronts/room/clevertree-room.js"),
  "utf8"
);

assert.strictEqual(guestJson.schema, "clevertree.guest-nicks.v1");
assert.ok(
  Array.isArray(guestJson.stems) && guestJson.stems.length >= 400,
  "guest stem list must be large (≥400)"
);

const sandbox = { module: { exports: {} }, globalThis: {} };
vm.runInNewContext(guestJs, sandbox);
const fromJs = sandbox.globalThis.ClevertreeGuestNicks || sandbox.module.exports;
assert.ok(fromJs && fromJs.stems && fromJs.stems.length >= 400);
assert.strictEqual(fromJs.stems.length, guestJson.stems.length);

const reserved = new Set([
  "you",
  "anon",
  "anonymous",
  "visitor",
  "si",
  "system",
  "admin",
  "root",
  "bot",
]);
const seen = new Set();
for (const s of guestJson.stems) {
  assert.ok(/^[A-Za-z]/.test(s), "stem starts with letter: " + s);
  const lc = String(s).toLowerCase();
  assert.ok(!reserved.has(lc), "stem reserved: " + s);
  assert.ok(!seen.has(lc), "duplicate stem: " + s);
  seen.add(lc);
}

assert.ok(/mintGuestNickLocal/.test(roomJs), "room exports mint helper");
assert.ok(/ensureGuestNickReady/.test(roomJs), "room mints before send");
assert.ok(/isPlaceholderNick/.test(roomJs), "placeholder nick guard");
assert.ok(
  /guest-nicks\.js/.test(
    fs.readFileSync(path.join(root, "fronts/room/live.html"), "utf8")
  ),
  "live.html loads guest-nicks.js"
);

// Exercise mint via exported API when room is loadable in vm (IIFE needs window-ish)
const roomSandbox = {
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
  fetch: undefined,
};
roomSandbox.globalThis = roomSandbox;
roomSandbox.window = roomSandbox;
vm.runInNewContext(guestJs + "\n" + roomJs, roomSandbox);
const Room = roomSandbox.CleverTreeRoom || roomSandbox.window.CleverTreeRoom;
assert.ok(Room, "CleverTreeRoom global");
assert.ok(Room.isPlaceholderNick("anon"));
assert.ok(Room.isPlaceholderNick("you"));
assert.ok(!Room.isPlaceholderNick("Fern7k"));
const a = Room.mintGuestNickLocal();
const b = Room.mintGuestNickLocal();
assert.ok(a && a.length >= 3 && a.length <= 32);
assert.ok(/^[A-Za-z]/.test(a));
assert.ok(b && b.length >= 3);
// Not required unique every time, but should look like stem+suffix
assert.ok(/[a-z0-9]{2,3}$/i.test(a), "suffix present: " + a);

console.log("test_guest_nicks.js: ok (" + guestJson.stems.length + " stems)");
