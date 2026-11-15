/**
 * Node unit checks for extension URL normalize + domain collapse.
 * Run: node tests/test_extension_normalize.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(
  path.join(__dirname, "../fronts/extension/normalize-url.js"),
  "utf8",
);
const sandbox = { console, URL, encodeURIComponent };
vm.createContext(sandbox);
vm.runInContext(src + "\nthis.normalizeUrl = normalizeUrl;", sandbox);

const normalizeUrl = sandbox.normalizeUrl;

function domainOnly(href) {
  const u = new URL(href);
  return normalizeUrl(u.protocol + "//" + u.hostname + "/");
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert failed");
}

assert(
  normalizeUrl("https://www.Example.com/News/A?utm_source=x&id=1").indexOf("utm_") < 0,
  "strips utm",
);
assert(
  normalizeUrl("https://www.example.com/a/") === "com/example.com/a/",
  "www + path",
);
const d1 = domainOnly("https://www.Example.com/news/story?id=9");
const d2 = domainOnly("https://example.com/other");
assert(d1 === d2, "domain collapse equal: " + d1 + " vs " + d2);
assert(d1 === "com/example.com/", "domain only shape " + d1);

console.log("ok test_extension_normalize.js");
