import { expect, test } from "@playwright/test";

test.describe("cross-cutting mobile safe areas", () => {
  test("keeps Android portrait chrome outside status and gesture zones", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/cross-cutting-mobile");

    const frame = page.locator("[data-android-safe-area-frame]");
    const header = page.locator("[data-android-status-header]");
    const nav = page.locator("[data-android-bottom-nav]");

    await expect(frame).toBeVisible();
    await expect(nav).toBeVisible();

    const topPadding = await frame.evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingTop));
    expect(topPadding).toBeGreaterThanOrEqual(24);

    const headerBox = await header.boundingBox();
    expect(headerBox?.y ?? 0).toBeGreaterThanOrEqual(24);

    const navBox = await nav.boundingBox();
    expect(844 - ((navBox?.y ?? 0) + (navBox?.height ?? 0))).toBeGreaterThanOrEqual(48);

    const overflow = await page.locator("[data-cross-cutting-mobile]").evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("reserves landscape inline gesture zones", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto("/cross-cutting-mobile");

    const frame = page.locator("[data-android-safe-area-frame]");
    await expect(frame).toBeVisible();

    const inlinePadding = await frame.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        left: Number.parseFloat(style.paddingLeft),
        right: Number.parseFloat(style.paddingRight),
      };
    });
    expect(inlinePadding.left).toBeGreaterThanOrEqual(48);
    expect(inlinePadding.right).toBeGreaterThanOrEqual(48);
  });

  test("keeps iOS notch and home indicator clear in portrait", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/cross-cutting-mobile");

    const frame = page.locator("[data-ios-safe-area-frame]");
    const header = page.locator("[data-ios-status-header]");
    const nav = page.locator("[data-ios-bottom-nav]");

    await expect(frame).toBeVisible();
    await expect(nav).toBeVisible();

    const topPadding = await frame.evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingTop));
    expect(topPadding).toBeGreaterThanOrEqual(47);

    const headerBox = await header.boundingBox();
    expect(headerBox?.y ?? 0).toBeGreaterThanOrEqual(47);

    const navBox = await nav.boundingBox();
    expect(844 - ((navBox?.y ?? 0) + (navBox?.height ?? 0))).toBeGreaterThanOrEqual(34);
  });

  test("keeps iOS landscape notch edges clear", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto("/cross-cutting-mobile");

    const frame = page.locator("[data-ios-safe-area-frame]");
    await expect(frame).toBeVisible();

    await frame.evaluate((element) => {
      const target = element as HTMLElement;
      target.style.setProperty("--fulcrum-ios-safe-area-inline", "47px");
    });

    const inlinePadding = await frame.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        left: Number.parseFloat(style.paddingLeft),
        right: Number.parseFloat(style.paddingRight),
      };
    });
    expect(inlinePadding.left).toBeGreaterThanOrEqual(47);
    expect(inlinePadding.right).toBeGreaterThanOrEqual(47);
  });

  // Source-contract checks (`app.html`/`app.css`/`+layout.svelte` safe-area
  // wiring, Tailwind v4 breakpoint tokens, the OpenAPI route building the spec)
  // moved to `web-source-contract.test.ts` — they read source text, not a
  // rendered route, so they must not masquerade as visual design tests.

  test("treats /api/v1/openapi.json as a JSON contract endpoint, not blank visual chrome", async ({ request }) => {
    const response = await request.get("/api/v1/openapi.json");
    expect(response.headers()["content-type"]).toContain("application/json");

    const body = await response.json();
    if (response.status() === 200) {
      expect(body.openapi).toBe("3.1.0");
      expect(body.info.title).toBe("Fulcrum API");
      expect(Object.keys(body.paths)).toEqual(expect.arrayContaining(["/tasks", "/docs", "/projects"]));
    } else {
      expect(response.status()).toBe(404);
      expect(body.error).toContain("Public API");
    }
  });

  test("reflows breakpoint fixture at sm, md, lg, and xl viewports", async ({ page }) => {
    const cases = [
      { width: 640, columns: 2 },
      { width: 768, columns: 3 },
      { width: 1024, columns: 4 },
      { width: 1280, columns: 5 },
    ];

    for (const item of cases) {
      await page.setViewportSize({ width: item.width, height: 900 });
      await page.goto("/cross-cutting-mobile");

      const ladder = page.locator("[data-breakpoint-ladder]");
      await expect(ladder).toBeVisible();

      const columns = await ladder.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
      expect(columns).toBe(item.columns);

      const overflow = await page.locator("[data-cross-cutting-mobile]").evaluate((element) => element.scrollWidth - element.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    }
  });

  test("topbar collapses on downscroll past 50px and restores on upscroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/cross-cutting-mobile");

    const header = page.locator("[data-android-status-header]");
    await expect(header).toHaveAttribute("data-header-state", "expanded");

    await page.locator("[data-scroll-region]").evaluate((element) => { element.scrollTop = 200; element.dispatchEvent(new Event("scroll")); });
    await expect(header).toHaveAttribute("data-header-state", "collapsed");
    await expect(page.locator("[data-collapsing-breadcrumb]")).toBeVisible();

    await page.locator("[data-scroll-region]").evaluate((element) => { element.scrollTop = 150; element.dispatchEvent(new Event("scroll")); });
    await expect(header).toHaveAttribute("data-header-state", "expanded");
  });
});
