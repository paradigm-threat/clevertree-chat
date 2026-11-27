import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * ADA contrast for the marketing /chat page room mount.
 * Embed shell contrast lives in a11y-room-contrast.spec.ts.
 */

async function openChatRoom(page: Page, theme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("clevertree.room.theme", t);
      localStorage.setItem("ct-theme", t);
      document.documentElement.setAttribute("data-theme", t);
    } catch (_) {}
  }, theme);
  await page.goto("/chat");
  const room = page.locator(".room, .ct-room").first();
  await expect(room).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-role="send"]')).toBeVisible({
    timeout: 15_000,
  });
  if (theme === "dark") {
    await page.evaluate(() => {
      const el = document.querySelector(".room, .ct-room");
      if (el) {
        el.setAttribute("data-theme", "dark");
        el.setAttribute("data-theme-pref", "dark");
      }
      document.documentElement.setAttribute("data-theme", "dark");
    });
  }
  return room;
}

async function expectNoSeriousContrast(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .include(".room, .ct-room")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();

  const blocking = results.violations.filter(
    (v) =>
      v.id === "color-contrast" ||
      v.id === "heading-order" ||
      v.impact === "serious" ||
      v.impact === "critical",
  );

  if (blocking.length) {
    const detail = blocking
      .map((v) => {
        const nodes = (v.nodes || [])
          .slice(0, 6)
          .map((n) => `  - ${n.target.join(" ")} :: ${(n.failureSummary || "").split("\n")[0]}`)
          .join("\n");
        return `${v.id} (${v.impact}): ${v.help}\n${nodes}`;
      })
      .join("\n\n");
    expect(blocking, `${label}\n${detail}`).toEqual([]);
  }
}

test.describe("chat page room a11y contrast", () => {
  test("chat room meets WCAG AA contrast (light)", async ({ page }) => {
    await openChatRoom(page, "light");
    await expectNoSeriousContrast(page, "light /chat room");
  });

  test("chat room meets WCAG AA contrast (dark)", async ({ page }) => {
    await openChatRoom(page, "dark");
    await expectNoSeriousContrast(page, "dark /chat room");
  });
});
