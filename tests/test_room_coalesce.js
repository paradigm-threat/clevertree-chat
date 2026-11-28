const assert = require("assert");
const path = require("path");
const Room = require(path.join(__dirname, "../fronts/room/clevertree-room.js"));

assert.strictEqual(Room.COALESCE_KEY, "clevertree.room.coalesce");
assert.strictEqual(Room.COALESCE_DEFAULT_GAP_MIN, 15);
assert.deepStrictEqual(Room.COALESCE_MODES, [
  "normal",
  "combined",
  "paragraph",
]);

assert.strictEqual(Room.nicksMatch("Alice", "alice"), true);
assert.strictEqual(Room.nicksMatch("alice", "bob"), false);
assert.strictEqual(Room.speakersMatch({ nick: "you", self: true }, { nick: "you" }), true);

const t0 = 1_700_000_000_000;
assert.strictEqual(Room.messageTs({ sentAt: t0 }), t0);
assert.strictEqual(Room.messageTs({ ts: t0 / 1000 }), t0);
assert.strictEqual(Room.messageTs({ time: "" }), null);
assert.strictEqual(Room.messageTs({}), null);

const a = { nick: "you", self: true, text: "one", sentAt: t0 };
const b = { nick: "you", self: true, text: "two", sentAt: t0 + 60_000 };
const c = { nick: "other", text: "hi", sentAt: t0 + 90_000 };
const d = { nick: "you", self: true, text: "later", sentAt: t0 + 16 * 60_000 };

assert.strictEqual(
  Room.canCoalesce(a, b, { mode: "combined", gapMinutes: 15 }),
  true
);
assert.strictEqual(
  Room.canCoalesce(a, d, { mode: "combined", gapMinutes: 15 }),
  false
);
assert.strictEqual(
  Room.canCoalesce(a, c, { mode: "combined", gapMinutes: 15 }),
  false
);
assert.strictEqual(
  Room.canCoalesce(a, b, { mode: "normal", gapMinutes: 15 }),
  false
);

const groupsCombined = Room.groupMessagesForDisplay([a, b, c, d], {
  mode: "combined",
  gapMinutes: 15,
});
assert.strictEqual(groupsCombined.length, 3);
assert.strictEqual(groupsCombined[0].lines.length, 2);
assert.strictEqual(groupsCombined[0].lines[0].text, "one");
assert.strictEqual(groupsCombined[0].lines[1].text, "two");

const groupsNormal = Room.groupMessagesForDisplay([a, b], {
  mode: "normal",
  gapMinutes: 15,
});
assert.strictEqual(groupsNormal.length, 2);

const groupsPara = Room.groupMessagesForDisplay([a, b], {
  mode: "paragraph",
  gapMinutes: 15,
});
assert.strictEqual(groupsPara.length, 1);
assert.strictEqual(groupsPara[0].lines.length, 2);

/* Legacy enabled:true migrates to combined */
const migrated = Room.persistCoalescePrefs({ enabled: true, gapMinutes: 10 });
assert.strictEqual(migrated.mode, "combined");
assert.strictEqual(migrated.gapMinutes, 10);

console.log("test_room_coalesce: ok");
