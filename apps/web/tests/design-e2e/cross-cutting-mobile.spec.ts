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
});
