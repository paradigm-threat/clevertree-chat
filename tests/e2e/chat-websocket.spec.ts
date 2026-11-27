import { expect, test } from "@playwright/test";

/**
 * Durable room E2E against local chat_host (see playwright.config.ts webServer).
 * Marketing /chat mounts CleverTreeRoom (#web); board widget is retired.
 * Sends go over WebSocket privmsg → host submit (not a composer HTTP POST).
 */
test.describe("durable chat room", () => {
  test("room loads live; no Continue; post appears in history", async ({ page }) => {
    await page.goto("/chat");
    const room = page.locator(".room, .ct-room").first();
    await expect(room).toBeVisible({ timeout: 15_000 });

    await expect(page.locator("#btn-continue")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Continue$/i })).toHaveCount(0);

    const draft = room.locator('[data-role="draft"]');
    await expect(draft).toBeVisible({ timeout: 15_000 });
    await draft.click();
    const marker = `e2e flock ${Date.now()}`;
    await draft.fill(`${marker} — privacy claim about camera networks.`);

    await room.locator('[data-role="send"]').click();
    const confirm = page.locator('[data-role="confirm"]');
    await expect(confirm).toBeVisible({ timeout: 10_000 });
    await confirm.click();
    await expect(page.locator('[data-role="overlay"]')).toBeHidden({ timeout: 10_000 });

    await expect(room.locator('[data-role="stream"]').getByText(marker, { exact: false })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("confirm dialog cancels without posting", async ({ page }) => {
    await page.goto("/chat");
    const room = page.locator(".room, .ct-room").first();
    await expect(room).toBeVisible({ timeout: 15_000 });
    const draft = room.locator('[data-role="draft"]');
    await expect(draft).toBeVisible({ timeout: 15_000 });
    const marker = `e2e cancel ${Date.now()}`;
    await draft.fill(marker);
    await room.locator('[data-role="send"]').click();
    await expect(page.locator('[data-role="confirm"]')).toBeVisible({ timeout: 10_000 });
    await page.locator('[data-role="cancel"]').click();
    await expect(page.locator('[data-role="overlay"]')).toBeHidden({ timeout: 10_000 });
    await expect(page.locator('[data-role="confirm"]')).toBeHidden();
    await expect(room.locator('[data-role="stream"]').getByText(marker)).toHaveCount(0);
    await expect(draft).toHaveValue(marker);
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
