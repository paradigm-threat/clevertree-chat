/**
 * Load unpacked Clevertree Chat MV3 extension and assert the side panel
 * mounts the IRC room shell (not a blank page).
 */
import { test, expect, chromium, type BrowserContext } from "@playwright/test";
import path from "path";
import fs from "fs";

const extPath = path.resolve(__dirname, "../../fronts/extension");

function assertRoomSynced() {
  const roomJs = path.join(extPath, "room", "clevertree-room.js");
  if (!fs.existsSync(roomJs)) {
    throw new Error(
      "fronts/extension/room missing — run: bash scripts/sync_extension_room.sh",
    );
  }
}

async function launchWithExtension(): Promise<{
  context: BrowserContext;
  extensionId: string;
}> {
  assertRoomSynced();
  const userDataDir = fs.mkdtempSync(
    path.join(require("os").tmpdir(), "ct-ext-"),
  );
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: false,
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });

  let worker = context.serviceWorkers()[0];
  if (!worker) {
    worker = await context.waitForEvent("serviceworker", { timeout: 15000 });
  }
  const extensionId = worker.url().split("/")[2];
  return { context, extensionId };
}

test.describe("Clevertree Chat extension side panel", () => {
  test("sidepanel.html mounts room shell", async () => {
    const { context, extensionId } = await launchWithExtension();
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(String(err)));
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });

      await page.goto(`chrome-extension://${extensionId}/sidepanel.html`, {
        waitUntil: "domcontentloaded",
      });

      // Room shell: header channel + composer (CleverTreeRoom.mount)
      await expect(page.locator(".room, .ct-room, [data-role='stream']").first()).toBeVisible({
        timeout: 10000,
      });
      await expect(page.locator("#room-root")).not.toBeEmpty();
      const failBanner = page.locator("text=failed to load");
      await expect(failBanner).toHaveCount(0);

      expect(
        errors.filter((e) => !/WebSocket|favicon|net::ERR/i.test(e)),
        `console/page errors: ${errors.join(" | ")}`,
      ).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("routes PT host to #pt when tab URL is set", async () => {
    const { context, extensionId } = await launchWithExtension();
    try {
      const page = await context.newPage();
      await page.addInitScript(() => {
        // Force route as if active tab were old.paradigmthreat.net
        (window as unknown as { __CT_TEST_URL?: string }).__CT_TEST_URL =
          "https://old.paradigmthreat.net/";
      });
      // sidepanel.js uses chrome.tabs.query — stub after load via evaluate + remount
      await page.goto(`chrome-extension://${extensionId}/sidepanel.html`, {
        waitUntil: "domcontentloaded",
      });
      await page.evaluate(() => {
        const root = document.getElementById("room-root");
        if (!root || !(window as unknown as { CleverTreeRoom?: { mount: Function } }).CleverTreeRoom) {
          throw new Error("CleverTreeRoom missing");
        }
        const Room = (window as unknown as { CleverTreeRoom: { mount: Function } }).CleverTreeRoom;
        const Route = (window as unknown as {
          CleverTreeChannelRoute: { routeForUrl: (u: string) => { channel: string; title: string; topicId: number | null; domain: string } };
        }).CleverTreeChannelRoute;
        const route = Route.routeForUrl("https://old.paradigmthreat.net/");
        root.innerHTML = "";
        Room.mount(root, {
          mode: "sidepanel",
          channel: route.channel,
          title: route.title,
          context: { topicId: route.topicId },
          showNetworker: false,
          apiBase: "https://api.clevertree.chat",
          nick: "you",
        });
        (root as HTMLElement).dataset.channel = route.channel;
      });
      expect(await page.locator("#room-root").getAttribute("data-channel")).toBe(
        "#pt",
      );
      await expect(page.locator('[data-role="channel-tag"]')).toHaveText("#pt");
      await expect(page.locator('[data-role="si-title"]')).toHaveText(
        /Paradigm Threat/i,
      );
    } finally {
      await context.close();
    }
  });
});
