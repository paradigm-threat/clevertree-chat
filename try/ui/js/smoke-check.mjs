/**
 * Offline smoke checks for UI lab store / demo queue (node).
 * Run: node try/ui/js/smoke-check.mjs
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import vm from "vm";

const root = path.dirname(fileURLToPath(import.meta.url));

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  localStorage: {
    _m: Object.create(null),
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(this._m, k) ? this._m[k] : null;
    },
    setItem(k, v) {
      this._m[k] = String(v);
    },
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

for (const file of ["board-data.js", "lab-core.js"]) {
  const code = readFileSync(path.join(root, file), "utf8");
  vm.runInNewContext(code, sandbox, { filename: file });
}

const Core = sandbox.ClevertreeUiLabCore;
if (!Core) throw new Error("ClevertreeUiLabCore missing");

const store = Core.createStore();
if (!store.demoMode) throw new Error("demoMode should default true");
if (store.board.keys.length < 3) throw new Error("expected keys");
if (Core.totalPoints(store.board) < 1) throw new Error("expected posts");

store.draft = "Smoke test point about cameras and oversight.";
store.draftKeys = ["oversight-retention"];
if (!Core.submitPost(store)) throw new Error("submit failed");
if (!store.demoPaused) throw new Error("expected demo pause after submit");
if (!store.demoQueue.length) throw new Error("expected queued server beats");

let guards = 0;
while (store.demoPaused || store.demoQueue.length) {
  Core.continueDemo(store);
  guards += 1;
  if (guards > 20) throw new Error("demo queue did not drain");
}
if (store.demoPaused) throw new Error("still paused after drain");

Core.setDemoMode(store, false);
if (store.demoMode) throw new Error("demo mode should be off");
store.draft = "Live mode point";
if (!Core.submitPost(store)) throw new Error("live submit failed");
if (store.demoPaused) throw new Error("live mode must not pause");

console.log("smoke-check ok");
