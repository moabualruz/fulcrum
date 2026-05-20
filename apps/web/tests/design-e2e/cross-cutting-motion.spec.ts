import { expect, test } from "@playwright/test";

function seconds(value: string): number {
  return value
    .split(",")
    .map((part) => part.trim())
    .map((part) => {
      if (part.endsWith("ms")) return Number.parseFloat(part) / 1000;
      if (part.endsWith("s")) return Number.parseFloat(part);
      return Number.parseFloat(part) || 0;
    })
    .reduce((max, item) => Math.max(max, item), 0);
}

test.describe("cross-cutting reduced motion", () => {
  test("keeps normal motion available when no reduced-motion preference is active", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/cross-cutting-motion");

    const slide = page.locator("[data-motion-card='slide']");
    await expect(slide).toBeVisible();

    const timing = await slide.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        animationDuration: style.animationDuration,
        transitionDuration: style.transitionDuration,
      };
    });

    expect(seconds(timing.animationDuration)).toBeGreaterThan(0.1);
    expect(seconds(timing.transitionDuration)).toBeGreaterThan(0.1);
  });

  test("collapses fade, slide, bounce, rotate, and transitions for reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/cross-cutting-motion");

    for (const motion of ["fade", "slide", "bounce", "rotate"]) {
      const timing = await page.locator(`[data-motion-card='${motion}']`).evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          animationDuration: style.animationDuration,
          animationIterationCount: style.animationIterationCount,
          transitionDuration: style.transitionDuration,
        };
      });
      expect(seconds(timing.animationDuration)).toBeLessThanOrEqual(0.001);
      expect(seconds(timing.transitionDuration)).toBeLessThanOrEqual(0.001);
      expect(timing.animationIterationCount).toBe("1");
    }
  });

  test("disables parallax, smooth scroll, and decorative autoplay for reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/cross-cutting-motion");

    const values = await page.evaluate(() => {
      const parallax = document.querySelector("[data-parallax-layer]");
      const autoplay = document.querySelector("[data-autoplay-loop]");
      return {
        scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
        parallaxTransform: parallax ? getComputedStyle(parallax).transform : "",
        autoplayPlayState: autoplay ? getComputedStyle(autoplay).animationPlayState : "",
      };
    });

    expect(values.scrollBehavior).toBe("auto");
    expect(values.parallaxTransform).toBe("none");
    expect(values.autoplayPlayState).toBe("paused");
  });

  // The production-CSS / theme-settings source-contract check moved to
  // `web-source-contract.test.ts` — a `@media` block in the CSS bundle and a
  // config-module export are proven by reading source, not by a rendered route.

  test("motion timing scale documents 150/200/300ms tokens", async ({ page }) => {
    await page.goto("/cross-cutting-motion");

    await expect(page.locator("[data-motion-timing-scale]")).toBeVisible();
    await expect(page.locator("[data-motion-timing='state-change']")).toContainText("150ms ease-in-out");
    await expect(page.locator("[data-motion-timing='reveal']")).toContainText("200ms ease-out");
    await expect(page.locator("[data-motion-timing='navigation']")).toContainText("300ms ease-in-out");
    await expect(page.locator("[data-motion-timing='modal']")).toContainText("300ms ease-in-out");
  });

  test("loading skeleton fixture renders form/list/table layouts", async ({ page }) => {
    await page.goto("/cross-cutting-motion");

    await expect(page.locator("[data-loading-skeletons]")).toBeVisible();
    await expect(page.locator("[data-skeleton-form]")).toBeVisible();
    await expect(page.locator("[data-skeleton-list-item='0']")).toBeVisible();
    await expect(page.locator("[data-skeleton-list-item='4']")).toBeVisible();
    await expect(page.locator("[data-skeleton-table-cell]")).toHaveCount(12);
  });
});
