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
    await expect(room).toHaveAttribute("data-chrome", "row");
    const history = page.locator('[data-role="history"]');
    await history.click({ position: { x: 40, y: 40 } });
    /* Landscape/desktop keeps the composer expanded when the draft blurs. */
    await expect
      .poll(async () => (await composerExpanded(page)).expanded)
      .toBe(true);

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
        const gSi = document.querySelector(
          '[data-role="gutter-si"]'
        ) as HTMLElement | null;
        if (!body || !si || !chat || !composer || !fab || !titles) return null;
        const cs = getComputedStyle(body);
        const contentH =
          body.clientHeight -
          parseFloat(cs.paddingTop) -
          parseFloat(cs.paddingBottom);
        const fabR = fab.getBoundingClientRect();
        const titlesR = titles.getBoundingClientRect();
        const bodyW = body.clientWidth;
        return {
          contentH,
          si: si.getBoundingClientRect().height,
          chat: chat.getBoundingClientRect().height,
          composer: composer.getBoundingClientRect().height,
          siW: si.getBoundingClientRect().width,
          coW: composer.getBoundingClientRect().width,
          bodyW,
          siCollapsed: si.classList.contains("si-collapsed"),
          composerCollapsed: composer.classList.contains("composer-collapsed"),
          fabLeftOfTitles: fabR.left < titlesR.left,
          fabRightOfTitles: fabR.right > titlesR.right,
          gutterVisible: !!(gSi && !gSi.hidden),
          orient: o,
        };
      }, orient);
    }

    for (const orient of ["left", "right"] as const) {
      const m = await measure(orient);
      expect(m, orient).toBeTruthy();
      expect(m!.siCollapsed).toBe(true);
      /* Landscape/desktop: composer stays expanded after history blur. */
      expect(m!.composerCollapsed).toBe(false);
      expect(m!.gutterVisible).toBe(true);
      for (const key of ["si", "chat", "composer"] as const) {
        expect(
          Math.abs(m![key] - m!.contentH),
          `${orient} ${key} ${m![key]} vs content ${m!.contentH}`
        ).toBeLessThanOrEqual(2);
      }
      /* Desktop panels default near one-third width. */
      expect(m!.siW / m!.bodyW).toBeGreaterThan(0.22);
      expect(m!.siW / m!.bodyW).toBeLessThan(0.42);
      expect(m!.coW / m!.bodyW).toBeGreaterThan(0.22);
      expect(m!.coW / m!.bodyW).toBeLessThan(0.42);
      if (orient === "left") {
        expect(m!.fabLeftOfTitles, "left: FAB outer/left").toBe(true);
      } else {
        expect(m!.fabRightOfTitles, "right: FAB outer/right").toBe(true);
      }
    }
  });

  test("row gutters resize SI and composer widths and persist", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1200, height: 700 });
    await page.goto(liveUrl());
    const room = page.locator(".room, .ct-room").first();
    await expect(room).toHaveAttribute("data-chrome", "row");
    /* Ensure three-column layout so SI gutter is between SI and chat. */
    await page.evaluate(() => {
      try {
        localStorage.setItem("clevertree.room.layoutMode", "split");
        localStorage.removeItem("clevertree.room.panelWidths");
      } catch (_) {}
      const el = document.querySelector(".room") as HTMLElement | null;
      if (el) el.setAttribute("data-layout", "split");
      const body = document.querySelector(".room .body") as HTMLElement | null;
      if (body) body.setAttribute("data-layout", "split");
      const si = document.querySelector('[data-role="si"]') as HTMLElement | null;
      if (si) {
        si.classList.add("si-expanded");
        si.classList.remove("si-collapsed");
        si.setAttribute("data-expanded", "true");
      }
    });
    await page.reload();
    await expect(room).toHaveAttribute("data-chrome", "row");
    await page.evaluate(() => {
      try {
        localStorage.setItem("clevertree.room.layoutMode", "split");
      } catch (_) {}
      const el = document.querySelector(".room") as HTMLElement | null;
      if (el) el.setAttribute("data-layout", "split");
      const body = document.querySelector(".room .body") as HTMLElement | null;
      if (body) body.setAttribute("data-layout", "split");
      const si = document.querySelector('[data-role="si"]') as HTMLElement | null;
      if (si) {
        si.classList.add("si-expanded");
        si.classList.remove("si-collapsed");
        si.setAttribute("data-expanded", "true");
      }
    });
    const gutter = page.locator('[data-role="gutter-si"]');
    await expect(gutter).not.toHaveAttribute("hidden", "");
    await expect
      .poll(async () => {
        const box = await gutter.boundingBox();
        return box && box.width > 0 && box.height > 0;
      })
      .toBe(true);

    const before = await page.evaluate(() => {
      const si = document.querySelector('[data-role="si"]') as HTMLElement;
      return si.getBoundingClientRect().width;
    });

    const box = await gutter.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + 80, box!.y + box!.height / 2, { steps: 8 });
    await page.mouse.up();

    const after = await page.evaluate(() => {
      const si = document.querySelector('[data-role="si"]') as HTMLElement;
      const roomEl = document.querySelector(".room") as HTMLElement;
      let stored: { si?: number; co?: number } | null = null;
      try {
        stored = JSON.parse(
          localStorage.getItem("clevertree.room.panelWidths") || "null"
        );
      } catch (_) {}
      return {
        w: si.getBoundingClientRect().width,
        var: getComputedStyle(roomEl).getPropertyValue("--ct-si-w").trim(),
        stored,
      };
    });
    expect(after.w).toBeGreaterThan(before + 20);
    expect(after.var).toMatch(/%$/);
    expect(after.stored?.si).toBeGreaterThan(33);
  });

  test("phone landscape: ~33% panels, resizable, remembered", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(liveUrl());
    await page.evaluate(() => {
      try {
        localStorage.removeItem("clevertree.room.panelWidths");
        localStorage.setItem("clevertree.room.layoutMode", "split");
      } catch (_) {}
    });
    await page.reload();
    const room = page.locator(".room, .ct-room").first();
    await expect(room).toHaveAttribute("data-chrome", "row", { timeout: 15_000 });

    const defaults = await page.evaluate(() => {
      const roomEl = document.querySelector(".room") as HTMLElement;
      const si = document.querySelector('[data-role="si"]') as HTMLElement;
      const co = document.querySelector(
        '[data-role="composer"]'
      ) as HTMLElement;
      const body = document.querySelector(".room .body") as HTMLElement;
      return {
        siVar: getComputedStyle(roomEl).getPropertyValue("--ct-si-w").trim(),
        coVar: getComputedStyle(roomEl).getPropertyValue("--ct-co-w").trim(),
        siPct: si.getBoundingClientRect().width / body.clientWidth,
        coPct: co.getBoundingClientRect().width / body.clientWidth,
      };
    });
    expect(defaults.siVar).toBe("33%");
    expect(defaults.coVar).toBe("33%");
    expect(defaults.siPct).toBeGreaterThan(0.25);
    expect(defaults.siPct).toBeLessThan(0.42);
    expect(defaults.coPct).toBeGreaterThan(0.25);
    expect(defaults.coPct).toBeLessThan(0.42);

    await page.evaluate(() => {
      const si = document.querySelector('[data-role="si"]') as HTMLElement | null;
      if (si) {
        si.classList.add("si-expanded");
        si.classList.remove("si-collapsed");
        si.setAttribute("data-expanded", "true");
      }
    });
    const gutter = page.locator('[data-role="gutter-si"]');
    await expect(gutter).not.toHaveAttribute("hidden", "");
    const gBox = await gutter.boundingBox();
    expect(gBox).toBeTruthy();
    await page.mouse.move(gBox!.x + gBox!.width / 2, gBox!.y + gBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(gBox!.x + 50, gBox!.y + gBox!.height / 2, { steps: 6 });
    await page.mouse.up();

    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("clevertree.room.panelWidths") || "null")
    );
    expect(saved?.si).toBeGreaterThan(33);

    await page.reload();
    await expect(room).toHaveAttribute("data-chrome", "row");
    const restored = await page.evaluate(() => {
      const roomEl = document.querySelector(".room") as HTMLElement;
      return {
        var: getComputedStyle(roomEl).getPropertyValue("--ct-si-w").trim(),
        stored: JSON.parse(
          localStorage.getItem("clevertree.room.panelWidths") || "null"
        ),
      };
    });
    expect(restored.stored?.si).toBe(saved.si);
    expect(restored.var).toBe(`${saved.si}%`);
  });

  test("portrait: drag down on SI / drag up on composer open chrome", async ({
    page,
  }) => {
    await openRoom(page);
    const history = page.locator('[data-role="history"]');
    const composer = page.locator('[data-role="composer"]');
    const si = page.locator('[data-role="si"]');

    await history.click({ position: { x: 24, y: 40 } });
    await expect
      .poll(async () => (await composerExpanded(page)).expanded)
      .toBe(false);

    const siBox = await si.boundingBox();
    expect(siBox).toBeTruthy();
    const sx = siBox!.x + siBox!.width / 2;
    const sy = siBox!.y + Math.min(20, siBox!.height / 2);
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx, sy + 80, { steps: 10 });
    await page.mouse.up();
    await expect
      .poll(async () =>
        si.evaluate((el) => el.classList.contains("si-expanded"))
      )
      .toBe(true);
    await expect(composer).toHaveClass(/composer-collapsed/);

    await history.click({ position: { x: 24, y: 40 } });
    await expect
      .poll(async () =>
        si.evaluate((el) => el.classList.contains("si-collapsed"))
      )
      .toBe(true);

    const coBox = await composer.boundingBox();
    expect(coBox).toBeTruthy();
    const cx = coBox!.x + coBox!.width / 2;
    const cy = coBox!.y + Math.max(12, coBox!.height - 12);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy - 80, { steps: 10 });
    await page.mouse.up();
    await expect
      .poll(async () => (await composerExpanded(page)).expanded)
      .toBe(true);
    await expect(si).toHaveClass(/si-collapsed/);
  });

  test("landscape: opening SI keeps composer expanded", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(liveUrl());
    const history = page.locator('[data-role="history"]');
    const composer = page.locator('[data-role="composer"]');
    const si = page.locator('[data-role="si"]');
    const titles = page.locator(".si-rail-titles");
    await expect(history).toBeVisible({ timeout: 15_000 });

    await history.click({ position: { x: 24, y: 40 } });
    await expect
      .poll(async () => (await composerExpanded(page)).expanded)
      .toBe(true);

    /* Open SI via titles (and shell swipe) — composer must stay expanded. */
    await titles.click();
    await expect
      .poll(async () =>
        si.evaluate((el) => el.classList.contains("si-expanded"))
      )
      .toBe(true);
    await expect(composer).toHaveClass(/composer-expanded/);

    await history.click({ position: { x: 24, y: 40 } });
    await expect
      .poll(async () =>
        si.evaluate((el) => el.classList.contains("si-collapsed"))
      )
      .toBe(true);

    const tBox = await titles.boundingBox();
    expect(tBox).toBeTruthy();
    const sx = tBox!.x + Math.min(40, tBox!.width / 2);
    const sy = tBox!.y + tBox!.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx, sy + 90, { steps: 12 });
    await page.mouse.up();
    await expect
      .poll(async () =>
        si.evaluate((el) => el.classList.contains("si-expanded"))
      )
      .toBe(true);
    await expect(composer).toHaveClass(/composer-expanded/);

    await history.click({ position: { x: 24, y: 40 } });
    await expect
      .poll(async () => (await composerExpanded(page)).expanded)
      .toBe(true);
    await expect
      .poll(async () =>
        si.evaluate((el) => el.classList.contains("si-collapsed"))
      )
      .toBe(true);
  });
});

