import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

/**
 * Regression: focus/click on the draft must expand the composer and keep it
 * expanded. Chrome height animation reflows .history; that scroll must not
 * immediately collapseChrome() (open→close flicker).
 */

function liveUrl() {
  const livePath = path.resolve("fronts/room/live.html");
  const api = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:8790";
  return (
    `file://${livePath}?channel=${encodeURIComponent("#web")}` +
    `&api=${encodeURIComponent(api)}` +
    `&title=${encodeURIComponent("Composer chrome")}`
  );
}

async function openRoom(page: Page) {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(liveUrl());
  const room = page.locator(".room, .ct-room").first();
  await expect(room).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-role="draft"]')).toBeVisible({
    timeout: 15_000,
  });
  // Tall scrollable history so expand reflow actually clamps scrollTop.
  await page.evaluate(() => {
    const stream = document.querySelector('[data-role="stream"]');
    const history = document.querySelector('[data-role="history"]');
    if (!stream || !history) return;
    stream.innerHTML = "";
    for (let i = 0; i < 50; i++) {
      const row = document.createElement("div");
      row.className = "msg";
      row.style.minHeight = "52px";
      row.style.padding = "8px";
      row.textContent = `pad message ${i} — enough height to scroll`;
      stream.appendChild(row);
    }
    history.scrollTop = history.scrollHeight;
  });
  return room;
}

async function composerExpanded(page: Page) {
  return page.locator('[data-role="composer"]').evaluate((el) => ({
    expanded: el.classList.contains("composer-expanded"),
    collapsed: el.classList.contains("composer-collapsed"),
    data: el.getAttribute("data-expanded"),
  }));
}

test.describe("room composer chrome", () => {
  test("focus/click draft expands and stays expanded (no open→close flicker)", async ({
    page,
  }) => {
    await openRoom(page);
    const composer = page.locator('[data-role="composer"]');
    const draft = page.locator('[data-role="draft"]');
    const history = page.locator('[data-role="history"]');

    await history.click({ position: { x: 24, y: 40 } });
    await expect
      .poll(async () => (await composerExpanded(page)).expanded)
      .toBe(false);

    const flicker = await page.evaluate(async () => {
      const el = document.querySelector('[data-role="composer"]');
      const ta = document.querySelector(
        '[data-role="draft"]'
      ) as HTMLTextAreaElement | null;
      if (!el || !ta) return { error: "missing nodes", samples: [] as string[] };
      const samples: string[] = [];
      const iv = window.setInterval(() => {
        samples.push(el.getAttribute("data-expanded") || "missing");
      }, 16);
      ta.focus();
      ta.click();
      await new Promise((r) => setTimeout(r, 650));
      window.clearInterval(iv);
      samples.push(el.getAttribute("data-expanded") || "missing");
      const firstTrue = samples.indexOf("true");
      const flippedBack =
        firstTrue >= 0 && samples.slice(firstTrue).includes("false");
      return {
        samples,
        flippedBack,
        final: el.getAttribute("data-expanded"),
        focused: document.activeElement === ta,
      };
    });

    expect(flicker, JSON.stringify(flicker)).toMatchObject({
      flippedBack: false,
      final: "true",
      focused: true,
    });
    await expect(composer).toHaveClass(/composer-expanded/);
    await expect(draft).toBeFocused();
  });

  test("typing keeps composer expanded; history click still collapses", async ({
    page,
  }) => {
    await openRoom(page);
    const composer = page.locator('[data-role="composer"]');
    const draft = page.locator('[data-role="draft"]');
    const history = page.locator('[data-role="history"]');

    await history.click({ position: { x: 24, y: 40 } });
    await expect
      .poll(async () => (await composerExpanded(page)).expanded)
      .toBe(false);

    await draft.click();
    await expect(composer).toHaveClass(/composer-expanded/);
    await draft.type("hello from chrome regression", { delay: 15 });
    await page.waitForTimeout(350);
    expect(await composerExpanded(page)).toMatchObject({
      expanded: true,
      data: "true",
    });
    await expect(draft).toBeFocused();

    await history.click({ position: { x: 24, y: 40 } });
    await expect
      .poll(async () => (await composerExpanded(page)).expanded)
      .toBe(false);
    await expect(composer).toHaveClass(/composer-collapsed/);
  });

  test("composebox click expands and remains expanded after delay", async ({
    page,
  }) => {
    await openRoom(page);
    const composer = page.locator('[data-role="composer"]');
    const box = page.locator('[data-role="composebox"]');
    const history = page.locator('[data-role="history"]');

    await history.click({ position: { x: 24, y: 40 } });
    await expect
      .poll(async () => (await composerExpanded(page)).expanded)
      .toBe(false);

    await box.click();
    await expect(composer).toHaveClass(/composer-expanded/);
    await page.waitForTimeout(700);
    expect(await composerExpanded(page)).toMatchObject({
      expanded: true,
      data: "true",
    });
  });

  test("landscape: columns fill height; menu FAB in outer corner", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1100, height: 640 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(liveUrl());
    const room = page.locator(".room, .ct-room").first();
    await expect(room).toBeVisible({ timeout: 15_000 });
    const history = page.locator('[data-role="history"]');
    await history.click({ position: { x: 40, y: 40 } });
    await expect
      .poll(async () => (await composerExpanded(page)).expanded)
      .toBe(false);

    async function measure(orient: "left" | "right") {
      return page.evaluate((o) => {
        const roomEl = document.querySelector(".room") as HTMLElement | null;
        if (roomEl) roomEl.setAttribute("data-orient", o);
        const body = document.querySelector(".room .body") as HTMLElement | null;
        const si = document.querySelector(
          '[data-role="si"]'
        ) as HTMLElement | null;
        const chat = document.querySelector(".room .chat") as HTMLElement | null;
        const composer = document.querySelector(
          '[data-role="composer"]'
        ) as HTMLElement | null;
        const fab = document.querySelector(
          '[data-role="menu-fab"]'
        ) as HTMLElement | null;
        const titles = document.querySelector(
          ".si-rail-titles"
        ) as HTMLElement | null;
        if (!body || !si || !chat || !composer || !fab || !titles) return null;
        const cs = getComputedStyle(body);
        const contentH =
          body.clientHeight -
          parseFloat(cs.paddingTop) -
          parseFloat(cs.paddingBottom);
        const fabR = fab.getBoundingClientRect();
        const titlesR = titles.getBoundingClientRect();
        return {
          contentH,
          si: si.getBoundingClientRect().height,
          chat: chat.getBoundingClientRect().height,
          composer: composer.getBoundingClientRect().height,
          siCollapsed: si.classList.contains("si-collapsed"),
          composerCollapsed: composer.classList.contains("composer-collapsed"),
          fabLeftOfTitles: fabR.left < titlesR.left,
          fabRightOfTitles: fabR.right > titlesR.right,
          orient: o,
        };
      }, orient);
    }

    for (const orient of ["left", "right"] as const) {
      const m = await measure(orient);
      expect(m, orient).toBeTruthy();
      expect(m!.siCollapsed).toBe(true);
      expect(m!.composerCollapsed).toBe(true);
      for (const key of ["si", "chat", "composer"] as const) {
        expect(
          Math.abs(m![key] - m!.contentH),
          `${orient} ${key} ${m![key]} vs content ${m!.contentH}`
        ).toBeLessThanOrEqual(2);
      }
      if (orient === "left") {
        expect(m!.fabLeftOfTitles, "left: FAB outer/left").toBe(true);
      } else {
        expect(m!.fabRightOfTitles, "right: FAB outer/right").toBe(true);
      }
    }
  });
});
