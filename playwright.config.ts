import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.CHAT_PORT || 8790);
const BASE = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 200_000,
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
    timeout: 30_000,
  },
});
