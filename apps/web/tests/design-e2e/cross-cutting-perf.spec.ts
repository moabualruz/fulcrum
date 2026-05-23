import { expect, test } from "@playwright/test";

test.describe("cross-cutting performance virtualization", () => {
  test("renders only visible rows plus overscan for a 10k row list", async ({ page }) => {
    await page.goto("/cross-cutting-perf");

    await expect(page.locator("[data-cross-cutting-perf]")).toHaveAttribute("data-row-count", "10000");
    await expect(page.locator("[data-cross-cutting-perf]")).toHaveAttribute("data-virtual-overscan", "10");
    await expect(page.locator("[data-cross-cutting-perf]")).toHaveAttribute("data-virtual-row-height", "48");

    const renderedRows = page.locator("[data-virtual-row]");
    await expect(renderedRows.first()).toBeVisible();
    const rowCount = await renderedRows.count();
    expect(rowCount).toBeGreaterThan(10);
    expect(rowCount).toBeLessThanOrEqual(34);
    await expect(page.locator("[data-rendered-rows] strong")).toHaveText(String(rowCount));
  });

  test("fast scroll keeps row heights stable and avoids blank rendered rows", async ({ page }) => {
    await page.goto("/cross-cutting-perf");

    const scroller = page.locator("[data-virtual-scroll]");
    await scroller.evaluate((element) => {
      element.scrollTop = 180_000;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await page.waitForFunction(() => {
      const first = document.querySelector("[data-virtual-row]");
      return Number(first?.getAttribute("data-row-index") ?? "0") > 1000;
    });

    const rows = page.locator("[data-virtual-row]");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(10);
    expect(rowCount).toBeLessThanOrEqual(34);

    for (let i = 0; i < Math.min(rowCount, 6); i += 1) {
      const box = await rows.nth(i).boundingBox();
      expect(Math.round(box?.height ?? 0)).toBe(48);
      await expect(rows.nth(i)).not.toHaveText("");
    }
  });

  test("jumps to an arbitrary row without rendering the full list", async ({ page }) => {
    await page.goto("/cross-cutting-perf");

    await page.locator("[data-jump-input]").fill("5000");
    await page.locator("[data-jump-button]").click();

    await expect(page.locator("[data-row-index='5000']")).toBeVisible();
    await expect(page.locator("[data-row-index='5000']")).toContainText("Repository workload row 5000");
    expect(await page.locator("[data-virtual-row]").count()).toBeLessThanOrEqual(34);
  });

  test("single and range selection work across virtual rows", async ({ page }) => {
    await page.goto("/cross-cutting-perf");

    await page.locator("[data-row-index='3']").click();
    await expect(page.locator("[data-row-index='3']")).toHaveAttribute("data-selected", "true");
    await expect(page.locator("[data-selected-count] strong")).toHaveText("1");

    await page.locator("[data-row-index='8']").click({ modifiers: ["Shift"] });
    await expect(page.locator("[data-selected-count] strong")).toHaveText("6");

    await page.locator("[data-jump-input]").fill("5000");
    await page.locator("[data-jump-button]").click();
    await expect(page.locator("[data-row-index='5000']")).toBeVisible();
    await page.locator("[data-row-index='5000']").click({ modifiers: ["Meta"] });
    await expect(page.locator("[data-selected-count] strong")).toHaveText("7");
    await expect(page.locator("[data-row-index='5000']")).toHaveAttribute("data-selected", "true");
  });
});
