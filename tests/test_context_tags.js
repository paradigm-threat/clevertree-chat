const assert = require("assert");
const path = require("path");
const Tags = require(path.join(__dirname, "../fronts/room/context-tags.js"));
const Route = require(path.join(__dirname, "../fronts/room/channel-route.js"));
const fs = require("fs");

const pol = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../fronts/room/channel-policy.json"),
    "utf8"
  )
);
assert.strictEqual(pol.repos["paradigm-threat"].default_channel, "#pt");
assert.strictEqual(pol.repos["public-web"].default_channel, "#web");

assert.strictEqual(Tags.tagTopic(0), "[[t:0]]");
assert.strictEqual(Tags.tagDomain("www.Example.com"), "[[d:example.com]]");
assert.ok(Tags.autoTag("hello", { topicId: 1 }).endsWith("[[t:1]]"));
assert.ok(Tags.autoTag("hello", { domain: "news.ycombinator.com" }).endsWith("[[d:news.ycombinator.com]]"));

const html = Tags.renderHtml("hi [[d:example.com]]", {});
assert.ok(html.indexOf("https://example.com/") >= 0);
assert.ok(html.indexOf("example.com") >= 0);

const topics = [{ id: 0, slug: "general", title: "General", href: "/chat" }];
const tHtml = Tags.renderHtml("x [[t:0]]", { topics: topics, siteOrigin: "https://paradigmthreat.net" });
assert.ok(tHtml.indexOf("General") >= 0);

const web = Route.routeForUrl("https://example.org/page");
assert.strictEqual(web.channel, "#web");
assert.strictEqual(web.domain, "example.org");

const ct = Route.routeForUrl("https://clevertree.chat/chat");
assert.strictEqual(ct.channel, "#web");
assert.strictEqual(ct.domain, "");
assert.strictEqual(ct.title, "Clevertree Chat");

const pt = Route.routeForUrl("https://paradigmthreat.net/science/nukes");
assert.strictEqual(pt.channel, "#pt");
assert.strictEqual(pt.topicId, 0);

console.log("test_context_tags.js ok");
