import { expect, test } from "@playwright/test";

/**
 * Durable board E2E against local chat_host (see playwright.config.ts webServer).
 * No scripted Continue / peer inject — coach is skippable UI only.
 */
test.describe("durable chat board", () => {
  test("board loads live; no Continue; post appears in activity", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("clevertree.coachSeen", "1");
      } catch (_) {}
    });
    await page.goto("/chat/flock-cameras");
    const root = page.locator("[data-clevertree-board]");
    await expect(root).toBeVisible({ timeout: 15_000 });

    await expect(page.locator("#btn-continue")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Continue$/i })).toHaveCount(0);

    const live = root.locator("[data-live]");
    await expect(live.first()).toBeVisible({ timeout: 15_000 });

    const dock = root.locator("[data-open-composer]");
    const wide = root.locator("textarea#ct-body-wide");
    if (!(await wide.isVisible().catch(() => false)) && (await dock.count())) {
      await dock.first().click();
    }
    const body = root.locator("[data-draft-body]").first();
    await expect(body).toBeVisible({ timeout: 15_000 });
    const marker = `e2e flock ${Date.now()}`;
    await body.fill(`${marker} — privacy claim about camera networks.`);

    const submitPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/chat") &&
        res.request().method() === "POST" &&
        res.status() === 200,
      { timeout: 30_000 },
    );
    await root.locator("[data-composer] button[type='submit']").first().click();
    await submitPromise;

    await expect(root.getByText(marker, { exact: false })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("coach skip persists for subsequent loads", async ({ page }) => {
    // Fresh context → coachSeen unset → coach visible
    await page.goto("/chat/thc-legalization");
    const root = page.locator("[data-clevertree-board]");
    await expect(root).toBeVisible({ timeout: 15_000 });
    const skip = root.locator("[data-coach-skip]");
    await expect(skip.first()).toBeVisible({ timeout: 10_000 });
    await skip.first().click();
    await expect(root.locator("[data-coach-skip]")).toHaveCount(0);
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem("clevertree.coachSeen")))
      .toBe("1");

    await page.reload();
    await expect(root).toBeVisible({ timeout: 15_000 });
    await expect(root.locator("[data-coach-skip]")).toHaveCount(0);
  });

  test("scripted demo actions are rejected by API", async ({ request }) => {
    for (const action of ["replay", "advance", "play"]) {
      const res = await request.post("/api/chat", {
        data: { action },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(String(body.error || "")).toMatch(/scripted/i);
    }
  });
});
