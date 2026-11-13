/**
 * Browser-extension front. Turns a tab URL into the debate path.
 * The board stays empty until a person types. This file is not published.
 */
(function (root) {
  var SUFFIXES = [
    "co.uk", "org.uk", "ac.uk", "gov.uk", "ltd.uk",
    "com.au", "net.au", "org.au", "co.nz", "com.br",
    "com", "net", "org", "edu", "gov", "io", "app", "chat", "dev", "uk"
  ].sort(function (a, b) { return b.length - a.length; });

  var EXACT = {
    fbclid: 1, gclid: 1, gclsrc: 1, dclid: 1, msclkid: 1, mc_cid: 1, mc_eid: 1,
    igshid: 1, yclid: 1, twclid: 1, ttclid: 1, srsltid: 1, gad_source: 1,
    gad_campaignid: 1, mkt_tok: 1, _ga: 1, _gl: 1, ref: 1, ref_src: 1
  };

  function isTracking(key) {
    var lowered = String(key).toLowerCase();
    if (lowered.indexOf("utm_") === 0 || lowered.indexOf("utm") === 0) return true;
    if (lowered.indexOf("hsa_") === 0 || lowered.indexOf("mc_") === 0) return true;
    return Object.prototype.hasOwnProperty.call(EXACT, lowered);
  }

  function publicSuffix(host) {
    for (var i = 0; i < SUFFIXES.length; i++) {
      var suffix = SUFFIXES[i];
      if (host === suffix || host.slice(-(suffix.length + 1)) === "." + suffix) return suffix;
    }
    var parts = host.split(".");
    return parts[parts.length - 1] || host;
  }

  function normalizeUrl(input) {
    var url = new URL(input);
    var host = url.hostname.toLowerCase();
    if (host.indexOf("www.") === 0) host = host.slice(4);
    var suffix = publicSuffix(host);
    var port = url.port;
    var dropPort = !port || (url.protocol === "https:" && port === "443") || (url.protocol === "http:" && port === "80");
    var hostLabel = dropPort ? host : host + ":" + port;
    var path = url.pathname.toLowerCase().replace(/\/+/g, "/");
    if (path.charAt(path.length - 1) !== "/") path += "/";
    var kept = [];
    url.searchParams.forEach(function (value, key) {
      if (!isTracking(key)) kept.push([key, value]);
    });
    kept.sort(function (a, b) {
      if (a[0] === b[0]) return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
      return a[0] < b[0] ? -1 : 1;
    });
    var query = kept.map(function (pair) {
      return encodeURIComponent(pair[0]) + "=" + encodeURIComponent(pair[1]);
    }).join("&");
    var base = suffix + "/" + hostLabel + path;
    return query ? base + "?" + query : base;
  }

  root.normalizeUrl = normalizeUrl;
  root.clevertreeEmptyUntilTyped = true;
})(typeof globalThis !== "undefined" ? globalThis : this);
