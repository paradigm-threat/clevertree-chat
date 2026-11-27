import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

/**
 * ADA contrast for the IRC room shell (composer Send, channel switcher, etc.).
 * The board a11y suite only covers [data-clevertree-board]; this covers .room.
 */

function liveUrl(theme: "light" | "dark") {
  const livePath = path.resolve("fronts/room/live.html");
  const api = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:8790";
  return (
    `file://${livePath}?channel=${encodeURIComponent("#web")}` +
    `&api=${encodeURIComponent(api)}` +
    `&title=${encodeURIComponent("Clevertree")}` +
    `&theme=${theme}`
  );
}

async function openRoom(page: Page, theme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript((t) => {
    try {
      localStorage.setItem(
        "clevertree.room.theme",
        t === "dark" ? "dark" : "light"
      );
    } catch (_) {}
  }, theme);
  await page.goto(liveUrl(theme));
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
    });
  }
  return room;
}

async function expectRoomContrastOk(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .include(".room, .ct-room")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();

  const blocking = results.violations.filter(
    (v) =>
      v.id === "color-contrast" ||
      v.impact === "serious" ||
      v.impact === "critical"
  );

  if (blocking.length) {
    const detail = blocking
      .map((v) => {
        const nodes = (v.nodes || [])
          .slice(0, 8)
          .map(
            (n) =>
              `  - ${n.target.join(" ")} :: ${(n.failureSummary || "").split("\n")[0]}`
          )
          .join("\n");
        return `${v.id} (${v.impact}): ${v.help}\n${nodes}`;
      })
      .join("\n\n");
    expect(blocking, `${label}\n${detail}`).toEqual([]);
  }
}

async function expectSendDarkOnLight(page: Page, label: string) {
  const sample = await page.locator('[data-role="send"]').evaluate((btn) => {
    const cs = getComputedStyle(btn);
    const parse = (c: string) => {
      const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      if (!m) return null;
      return [Number(m[1]), Number(m[2]), Number(m[3])];
    };
    const fg = parse(cs.color);
    const bg = parse(cs.backgroundColor);
    const lum = (rgb: number[]) => {
      const lin = rgb.map((v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    };
    if (!fg || !bg) return { ok: false, reason: "unparsed", fg: cs.color, bg: cs.backgroundColor };
    const Lfg = lum(fg);
    const Lbg = lum(bg);
    const ratio =
      (Math.max(Lfg, Lbg) + 0.05) / (Math.min(Lfg, Lbg) + 0.05);
    return {
      ok: ratio >= 4.5 && Lfg < Lbg,
      ratio,
      darkOnLight: Lfg < Lbg,
      fg: cs.color,
      bg: cs.backgroundColor,
    };
  });
  expect(
    sample.ok,
    `${label}: Send must be dark-on-light with ≥4.5:1 (got ${JSON.stringify(sample)})`
  ).toBeTruthy();
}

test.describe("room a11y contrast", () => {
  test("live room meets WCAG AA contrast (light)", async ({ page }) => {
    await openRoom(page, "light");
    await expectSendDarkOnLight(page, "light send");
    await expectRoomContrastOk(page, "light room");
  });

  test("live room meets WCAG AA contrast (dark)", async ({ page }) => {
    await openRoom(page, "dark");
    await expectSendDarkOnLight(page, "dark send");
    await expectRoomContrastOk(page, "dark room");
  });
});
