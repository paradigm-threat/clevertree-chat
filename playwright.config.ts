import { defineConfig } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const PORT = Number(process.env.CHAT_PORT || 8790);
const BASE = `http://127.0.0.1:${PORT}`;
const commentsDir =
  process.env.CLEVERTREE_COMMENTS_PATH ||
  fs.mkdtempSync(path.join(os.tmpdir(), "clevertree-e2e-"));
// Expose to specs (SoT empty-until-write assertions).
process.env.CLEVERTREE_COMMENTS_PATH = commentsDir;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: BASE,
    headless: true,
    viewport: { width: 1280, height: 900 },
    colorScheme: "light",
    reducedMotion: "reduce",
  },
  webServer: {
    command: `python3 scripts/chat_host.py ${PORT}`,
    url: `${BASE}/chat`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      ...process.env,
      CLEVERTREE_COMMENTS_PATH: commentsDir,
      CLEVERTREE_IRC_ENABLE: "0",
      CLEVERTREE_SEED_FIXTURES: "1",
      // Prefer system git for local E2E (Intake image uses dulwich via CLEVERTREE_GIT_FALLBACK=1)
      CLEVERTREE_GIT_FALLBACK: "0",
    },
  },
});
