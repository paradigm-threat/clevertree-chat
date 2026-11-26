#!/usr/bin/env node
/**
 * Context tags + room component contracts (no browser).
 */
const assert = require("assert");
const path = require("path");
const Tags = require(path.join(__dirname, "../fronts/room/context-tags.js"));
const Room = require(path.join(__dirname, "../fronts/room/clevertree-room.js"));

function testParse() {
  const t =
    "[[c:savannah-cat-rescue]] [[t:flock-cameras]] hello [[nd:z0m2zzlro/abc123]]";
  const chips = Tags.parseTags(t);
  assert.strictEqual(chips.length, 3);
  assert.strictEqual(chips[0].kind, "c");
  assert.strictEqual(chips[1].kind, "t");
  assert.strictEqual(chips[2].kind, "nd");
  assert.strictEqual(chips[2].group, "z0m2zzlro");
  assert.strictEqual(chips[2].post, "abc123");
  assert.strictEqual(Tags.stripTags(t), "hello");
}

function testAutoTag() {
  const out = Tags.autoTag("hi", {
    collection: "savannah-cat-rescue",
    topic: "flock-cameras",
    ndGroup: "z0m2zzlro",
  });
  assert.ok(out.indexOf("[[c:savannah-cat-rescue]]") === 0 || out.includes("[[c:"));
  assert.ok(out.includes("[[t:flock-cameras]]"));
  assert.ok(out.includes("[[ndg:z0m2zzlro]]"));
  assert.ok(out.includes("hi"));
}

function testRenderHidesRaw() {
  const html = Tags.renderHtml("see [[nd:g1/p1]] please");
  assert.ok(!html.includes("[[nd:"));
  assert.ok(html.includes("ct-tag"));
  assert.ok(html.includes("nextdoor.com"));
}

function testRoomNoGather() {
  assert.strictEqual(typeof Room.mount, "function");
  assert.ok(Room.isBotNick("clevertree-si"));
  assert.ok(Room.isBotNick("clevertree-ai"));
  assert.ok(!Room.isBotNick("mara_j"));
  const m = Room.pickMirror(["a", "b", "c"], 1);
  assert.strictEqual(m, "b");
}

function testChannelPolicy() {
  const fs = require("fs");
  const pol = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../fronts/room/channel-policy.json"),
      "utf8"
    )
  );
  assert.strictEqual(pol.repos["paradigm-threat"].default_channel, "#pt");
  assert.strictEqual(pol.visitor_uuid_for_chat, false);
  assert.strictEqual(pol.anonymous_default, true);
}

testParse();
testAutoTag();
testRenderHidesRaw();
testRoomNoGather();
testChannelPolicy();
console.log("test_context_tags.js: ok");
