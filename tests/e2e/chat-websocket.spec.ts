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

    const stream = room.locator('[data-role="stream"]');
    // Optimistic pending row should appear immediately.
    await expect(stream.locator("article.msg-pending").filter({ hasText: marker })).toBeVisible({
      timeout: 3_000,
    });
    await expect(stream.getByText(marker, { exact: false })).toBeVisible({
      timeout: 30_000,
    });
    // Settled: pending class cleared; still exactly one message with the marker.
    await expect(stream.locator("article.msg-pending").filter({ hasText: marker })).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(stream.locator("article.msg").filter({ hasText: marker })).toHaveCount(1);
  });

  test("coalesce combines successive same-nick lines when enabled", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem(
          "clevertree.room.coalesce",
          JSON.stringify({ mode: "combined", gapMinutes: 15 })
        );
      } catch (_) {}
    });
    await page.goto("/chat");
    const room = page.locator(".room, .ct-room").first();
    await expect(room).toBeVisible({ timeout: 15_000 });
    const draft = room.locator('[data-role="draft"]');
    await expect(draft).toBeVisible({ timeout: 15_000 });
    const stamp = Date.now();
    const line1 = `e2e coal A ${stamp}`;
    const line2 = `e2e coal B ${stamp}`;

    async function sendLine(text: string) {
      await draft.click();
      await draft.fill(text);
      await room.locator('[data-role="send"]').click();
      await expect(page.locator('[data-role="confirm"]')).toBeVisible({ timeout: 10_000 });
      await page.locator('[data-role="confirm"]').click();
      await expect(page.locator('[data-role="overlay"]')).toBeHidden({ timeout: 10_000 });
    }

    await sendLine(line1);
    const stream = room.locator('[data-role="stream"]');
    await expect(stream.getByText(line1, { exact: false })).toBeVisible({ timeout: 30_000 });
    await sendLine(line2);
    await expect(stream.getByText(line2, { exact: false })).toBeVisible({ timeout: 30_000 });

    const combined = stream.locator("article.msg").filter({ hasText: line1 });
    await expect(combined).toHaveCount(1);
    await expect(combined.getByText(line2, { exact: false })).toBeVisible();
    const raws = await combined.locator(".msg-line").evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-raw") || el.textContent || "")
    );
    expect(raws.some((r) => r.includes(line1))).toBeTruthy();
    expect(raws.some((r) => r.includes(line2))).toBeTruthy();
    const idx1 = raws.findIndex((r) => r.includes(line1));
    const idx2 = raws.findIndex((r) => r.includes(line2));
    expect(idx2).toBe(idx1 + 1);

    // Switching to normal re-paints without freezing history.
    await page.evaluate(() => {
      localStorage.setItem(
        "clevertree.room.coalesce",
        JSON.stringify({ mode: "normal", gapMinutes: 15 })
      );
    });
    await room.locator('[data-role="menu-fab"]').click();
    await room.locator('[data-role="coalesce-mode"]').selectOption("normal");
    await expect(stream.getByText(line1, { exact: false })).toBeVisible();
    await expect(stream.getByText(line2, { exact: false })).toBeVisible();
    await expect(stream.locator("article.msg").filter({ hasText: line1 })).toHaveCount(1);
    await expect(stream.locator("article.msg").filter({ hasText: line2 })).toHaveCount(1);
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
