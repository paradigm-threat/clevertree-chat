/**
 * Node checks for website URL room helpers + /chat shell wiring.
 * Run: node tests/test_website_href_js.js
 */
const fs = require("fs");
const path = require("path");

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert failed");
}

function hrefAndScopeFromW(pathRemainder, queryUrl) {
  let raw = String(queryUrl || "").trim();
  if (!raw) {
    const rem = String(pathRemainder || "")
      .replace(/^\/+/, "")
      .trim();
    if (!rem) return { href: "", scope: "" };
    try {
      raw = decodeURIComponent(rem);
    } catch (e) {
      raw = rem;
    }
  }
  const lowered = raw.toLowerCase();
  let href =
    lowered.indexOf("http://") === 0 || lowered.indexOf("https://") === 0
      ? raw
      : "https://" + raw.replace(/^\/+/, "");
  const u = new URL(href);
  const host = (u.hostname || "").toLowerCase().replace(/^www\./, "");
  assert(host, "host required");
  let scheme = (u.protocol || "https:").replace(":", "") || "https";
  if (scheme !== "http" && scheme !== "https") scheme = "https";
  const pathname = u.pathname || "/";
  let netloc = host;
  if (
    u.port &&
    !(
      (scheme === "http" && u.port === "80") ||
      (scheme === "https" && u.port === "443")
    )
  ) {
    netloc = host + ":" + u.port;
  }
  href = scheme + "://" + netloc + pathname + (u.search || "");
  const pathOnly = pathname.replace(/\/+$/, "");
  if (!pathOnly) {
    if (!href.endsWith("/")) href += "/";
    return { href, scope: "domain" };
  }
  return { href, scope: "path" };
}

const hostOnly = hrefAndScopeFromW("example.com");
assert(hostOnly.href === "https://example.com/", "host href " + hostOnly.href);
assert(hostOnly.scope === "domain", "host scope");

const withPath = hrefAndScopeFromW("example.com/news/story");
assert(withPath.href === "https://example.com/news/story", "path href");
assert(withPath.scope === "path", "path scope");

const encoded = hrefAndScopeFromW("https%3A%2F%2Fexample.com%2Fdocs%2F");
assert(encoded.href === "https://example.com/docs/", "encoded " + encoded.href);
assert(encoded.scope === "path", "encoded scope");

const board = fs.readFileSync(
  path.join(__dirname, "../fronts/snippet/clevertree-board.js"),
  "utf8",
);
assert(board.includes("Legacy board widget"), "board marks itself retired");
assert(board.includes("ClevertreeChatLauncher") || board.includes("chat-launcher"), "board stub boots room launcher");

const wPage = fs.readFileSync(path.join(__dirname, "../w/index.html"), "utf8");
assert(wPage.includes("data-api-base") || wPage.includes("api.clevertree.chat"), "w page api host");

const chatPage = fs.readFileSync(path.join(__dirname, "../chat/index.html"), "utf8");
assert(chatPage.includes("room-root"), "chat mounts room-root");
assert(chatPage.includes("CleverTreeRoom"), "chat mounts CleverTreeRoom");
assert(chatPage.includes("sameOrigin"), "chat page detects API/local host for same-origin");
assert(chatPage.includes("api.clevertree.chat"), "chat page can point marketing UI at API host");
assert(chatPage.includes("location.origin"), "local/api hosts use same-origin API");

const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../site.webmanifest"), "utf8"),
);
assert(manifest.start_url === "/chat/" || manifest.start_url === "/chat", "PWA start_url must be /chat");
assert(manifest.display === "standalone", "PWA display standalone");

const sw = fs.readFileSync(path.join(__dirname, "../sw.js"), "utf8");
assert(sw.includes('"/chat/"') || sw.includes('"/chat"'), "SW precaches /chat");
assert(sw.includes("site.webmanifest"), "SW precaches manifest");
assert(sw.includes("clevertree-shell-v3"), "SW cache bumped for room nick UI");
assert(sw.includes('"/fronts/room/clevertree-room.js"'), "SW precaches room JS");
assert(
  sw.includes('pathname.startsWith("/fronts/room/")'),
  "SW network-first for /fronts/room/ so nick UI updates ship"
);
assert(
  !/nick:\s*["']you["']/.test(chatPage),
  "chat page must not hard-code nick you; room uses localStorage / composer"
);

const tryPage = fs.readFileSync(path.join(__dirname, "../try/index.html"), "utf8");
assert(tryPage.includes('href="/chat'), "try page links to same-origin /chat");
assert(!/href=["']https:\/\/api\.clevertree\.chat\/chat\//.test(tryPage), "try must not deep-link api host chat");

console.log("ok test_website_href_js.js");
