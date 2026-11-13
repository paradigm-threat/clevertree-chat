import { expect, test } from "@playwright/test";
import steps from "../../fronts/snippet/demo-steps/thc-legalization.json";

const visitorBodies = steps.steps
  .filter((s) => (s.name || "").toLowerCase() === "maya")
  .map((s) => s.body);

test.describe("containable chat + WebSocket peer inject", () => {
  test("visitor posts via composer; peer arrives without composer fill", async ({ page }) => {
    await page.goto("/chat/thc-legalization?autoplay=0");
    const root = page.locator("[data-clevertree-chat]");
    await expect(root).toBeVisible();
    await expect(root.locator('[data-role="live"]')).toHaveAttribute("data-state", "open", {
      timeout: 15_000,
    });

    await root.locator('[data-act="reset"]').click();
    await expect(root.locator('[data-role="status"]')).toContainText(/reset/i);

    const name = root.locator('[data-role="name"]');
    const post = root.locator('[data-role="post"]');
    await name.fill("Ari");
    await post.fill(visitorBodies[0]);
    await root.locator('[data-role="composer"] button[type="submit"]').click();
    await expect(root).toHaveAttribute("data-busy", "true");
    await expect(root).not.toHaveAttribute("data-busy", "true", { timeout: 30_000 });

    await expect(root.locator('.ct-activity-row[data-mine="true"]')).toHaveCount(1, {
      timeout: 10_000,
    });
    await expect(root.locator('[data-section="personal-freedom"]')).toBeVisible({
      timeout: 15_000,
    });

    // Jordan is injected by the server — composer must stay empty while peer appears
    await expect(post).toHaveValue("");
    await expect(
      root.locator('.ct-activity-row[data-mine="false"][data-kind="post"]')
    ).toBeVisible({ timeout: 20_000 });
    await expect(root.locator('[data-section="public-health-harm"]')).toBeVisible({
      timeout: 20_000,
    });

    const peerChip = root.locator(
      '.ct-activity-row[data-mine="false"][data-kind="post"] .ct-chip'
    );
    await expect(peerChip.first()).not.toHaveText("You");
    await expect(root.locator('.ct-activity-row[data-mine="true"] .ct-chip').first()).toHaveText(
      "You"
    );
  });

  test("Play runs visitor beats only through the composer", async ({ page }) => {
    await page.goto("/chat/thc-legalization?autoplay=0");
    const root = page.locator("[data-clevertree-chat]");
    await root.locator('[data-act="play"]').click();
    await expect(root.locator('[data-role="status"]')).toContainText(/finished|keep posting/i, {
      timeout: 180_000,
    });
    for (const key of steps.final.keys) {
      await expect(root.locator(`[data-section="${key}"]`)).toBeVisible();
    }
    await expect(root.locator('[data-suggestion="federal-ban"]')).toBeVisible();
    await expect(root.locator('.ct-activity-row[data-mine="true"]')).toHaveCount(4);
    await expect(
      root.locator('.ct-activity-row[data-mine="false"][data-kind="post"]')
    ).toHaveCount(3);
  });
});
