import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Production Android/WebView shell — no demo seed messages.
 */
test.describe("live embed shell", () => {
  test("live.html has no seedMessages and mounts room root", async ({ page }) => {
    const livePath = path.resolve("fronts/room/live.html");
    const src = fs.readFileSync(livePath, "utf8");
    expect(src).toContain("seedMessages: []");
    expect(src).not.toContain("mara_j");
    expect(src).toContain('q.get("api")');
    expect(src).toContain('q.get("channel")');

    const api = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:8790";
    const url =
      `file://${livePath}?channel=${encodeURIComponent("#web")}` +
      `&api=${encodeURIComponent(api)}&title=${encodeURIComponent("Clevertree")}`;
    await page.goto(url);
    await expect(page.locator("#root")).toBeVisible({ timeout: 10_000 });
    // Room component mounts under #root (IRC chrome / composer).
    await expect(page.locator("#root").locator("textarea, input, [contenteditable]").first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
