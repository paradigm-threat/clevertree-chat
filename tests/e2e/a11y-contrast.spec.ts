import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function dismissCoach(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("clevertree.coachSeen", "1");
    } catch (_) {}
  });
}

async function expectNoSeriousContrast(page: Page, label: string) {
  const root = page.locator("[data-clevertree-board]");
  await expect(root).toBeVisible({ timeout: 15_000 });
  await expect(root.locator("[data-live]").first()).toBeVisible({ timeout: 15_000 });

  const results = await new AxeBuilder({ page })
    .include("[data-clevertree-board]")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();

  const contrast = results.violations.filter((v) => v.id === "color-contrast");
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical" || v.id === "color-contrast",
  );

  if (serious.length) {
    const detail = serious
      .map((v) => {
        const nodes = (v.nodes || [])
          .slice(0, 6)
          .map((n) => `  - ${n.target.join(" ")} :: ${(n.failureSummary || "").split("\n")[0]}`)
          .join("\n");
        return `${v.id} (${v.impact}): ${v.help}\n${nodes}`;
      })
      .join("\n\n");
    expect(serious, `${label}\n${detail}`).toEqual([]);
  }
  expect(contrast, label).toEqual([]);
}

test.describe("board a11y contrast", () => {
  test("starter topic board meets WCAG AA contrast (light)", async ({ page }) => {
    await dismissCoach(page);
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/chat/flock-cameras");
    await expectNoSeriousContrast(page, "light flock board");
  });

  test("website URL room meets WCAG AA contrast (light)", async ({ page }) => {
    await dismissCoach(page);
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(`/chat/w/example.com/a11y-${Date.now()}`);
    await expectNoSeriousContrast(page, "light website room");
  });

  test("starter topic board meets WCAG AA contrast (dark)", async ({ page }) => {
    await dismissCoach(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.addInitScript(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });
    await page.goto("/chat/flock-cameras");
    await expectNoSeriousContrast(page, "dark flock board");
  });

  test("website URL room meets WCAG AA contrast (dark)", async ({ page }) => {
    await dismissCoach(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.addInitScript(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });
    await page.goto(`/chat/w/example.com/a11y-dark-${Date.now()}`);
    await expectNoSeriousContrast(page, "dark website room");
  });
});
