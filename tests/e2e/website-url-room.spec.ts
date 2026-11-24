import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Website rooms via /chat/w/<host>/… — empty until first comment.
 * Marketing /w on clevertree.chat is the same board widget + resolve API.
 */
test.describe("website URL room", () => {
  test("resolve does not create SoT; board empty then first post appears", async ({
    page,
    request,
  }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("clevertree.coachSeen", "1");
      } catch (_) {}
    });

    const slug = `pw-${Date.now()}`;
    const href = `https://example.com/${slug}/`;

    const resolved = await request.post("/api/chat", {
      data: { action: "resolve", url: href, page_scope: "path" },
    });
    expect(resolved.status()).toBe(200);
    const resolvedBody = await resolved.json();
    expect(resolvedBody.exists).toBeFalsy();
    expect(String(resolvedBody.topic || "")).toMatch(/^u-/);

    const commentsRoot = process.env.CLEVERTREE_COMMENTS_PATH || "";
    if (commentsRoot) {
      const topic = resolvedBody.topic as string;
      const matches = fs
        .readdirSync(path.join(commentsRoot, "pages"), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .flatMap((pageDir) => {
          const topics = path.join(commentsRoot, "pages", pageDir.name, "topics");
          if (!fs.existsSync(topics)) return [];
          return fs
            .readdirSync(topics, { withFileTypes: true })
            .filter((t) => t.isDirectory() && t.name === topic)
            .map((t) => path.join(topics, t.name));
        });
      expect(matches).toEqual([]);
    }

    await page.goto(`/chat/w/example.com/${slug}`);
    const root = page.locator("[data-clevertree-board]");
    await expect(root).toBeVisible({ timeout: 15_000 });
    await expect(root.getByText(/0 perspectives/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(root.locator("[data-live]").first()).toBeVisible({ timeout: 15_000 });

    const dock = root.locator("[data-open-composer]");
    const wide = root.locator("textarea#ct-body-wide");
    if (!(await wide.isVisible().catch(() => false)) && (await dock.count())) {
      await dock.first().click();
    }
    const body = root.locator("[data-draft-body]").first();
    await expect(body).toBeVisible({ timeout: 15_000 });
    const marker = `e2e website ${Date.now()}`;
    await body.fill(`${marker} — first point for this URL room.`);

    const submitPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/chat") &&
        res.request().method() === "POST" &&
        res.status() === 200,
      { timeout: 30_000 },
    );
    await root.locator("[data-composer] button[type='submit']").first().click();
    await submitPromise;

    // Prefer the filed board article (outbox may briefly mirror the same body).
    await expect(
      root.locator("[data-activity], article, .ct-post").getByText(marker, { exact: false }).first(),
    ).toBeVisible({
      timeout: 30_000,
    });

    if (commentsRoot) {
      const topic = resolvedBody.topic as string;
      const topicPath = path.join(commentsRoot, "pages", "try", "topics", topic);
      await expect
        .poll(() => fs.existsSync(topicPath), { timeout: 10_000 })
        .toBe(true);
      const assocPath = path.join(commentsRoot, "associations.json");
      await expect
        .poll(() => fs.existsSync(assocPath), { timeout: 10_000 })
        .toBe(true);
      const assoc = fs.readFileSync(assocPath, "utf8");
      expect(assoc).toContain(resolvedBody.normalized);
    }
  });

  test("API domain scope collapses paths to one topic", async ({ request }) => {
    const a = await request.post("/api/chat", {
      data: {
        action: "resolve",
        url: "https://www.Example.com/news/a",
        page_scope: "domain",
      },
    });
    const b = await request.post("/api/chat", {
      data: {
        action: "resolve",
        url: "https://example.com/other/b?utm_source=x",
        page_scope: "domain",
        visitor: (await a.json()).visitor,
      },
    });
    expect(a.status()).toBe(200);
    expect(b.status()).toBe(200);
    const aa = await a.json();
    const bb = await b.json();
    expect(aa.topic).toBe(bb.topic);
    expect(String(aa.normalized)).toMatch(/example\.com\/$/);
  });
});
