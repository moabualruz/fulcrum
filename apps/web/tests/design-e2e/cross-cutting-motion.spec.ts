import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

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

  test("keeps production CSS and settings override wired", async () => {
    const appCss = readFileSync("src/app.css", "utf8");
    const themeSettings = readFileSync("src/routes/settings/theme/theme.ts", "utf8");
    const themePage = readFileSync("src/routes/settings/theme/+page.svelte", "utf8");

    expect(appCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(appCss).toContain("animation-duration: 0.001ms !important");
    expect(appCss).toContain("animation-iteration-count: 1 !important");
    expect(appCss).toContain("transition-duration: 0.001ms !important");
    expect(appCss).toContain("scroll-behavior: auto !important");
    expect(themeSettings).toContain("animationSpeed");
    expect(themeSettings).toContain('"reduced"');
    expect(themeSettings).toContain('"off"');
    expect(themePage).toContain("data-animation-speed");
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
