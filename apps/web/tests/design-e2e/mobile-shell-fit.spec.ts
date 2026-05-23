import { expect, test } from "@playwright/test";

const MOBILE_ROUTES = ["/", "/mkh/projects/fulcrum/capture", "/mkh/projects/fulcrum/build/runs"] as const;

async function expectWithinViewport(page: import("@playwright/test").Page, selector: string) {
	const rect = await page.locator(selector).first().evaluate((element) => {
		const { left, right, width } = element.getBoundingClientRect();
		return { left, right, width, clientWidth: document.documentElement.clientWidth };
	});
	expect(rect.left, `${selector} left edge`).toBeGreaterThanOrEqual(0);
	expect(rect.right, `${selector} right edge`).toBeLessThanOrEqual(rect.clientWidth);
	expect(rect.width, `${selector} width`).toBeLessThanOrEqual(rect.clientWidth);
}

test.describe("mobile shell viewport fit", () => {
	for (const route of MOBILE_ROUTES) {
		test(`keeps ${route} inside a 390px viewport`, async ({ page }) => {
			await page.setViewportSize({ width: 390, height: 844 });
			await page.goto(route);

			await expect(page.locator("[data-slot='scope-bar']")).toHaveAttribute("data-variant", "mobile");
			await expect(page.locator("[data-slot='scope-bar-stages']")).toHaveCount(0);
			await expect(page.locator("[data-slot='scope-bar-workspace-chip']")).toBeVisible();
			await expect(page.locator("[data-slot='scope-bar-active-stage-chip']")).toBeVisible();
			await expect(page.locator("[data-slot='scope-bar-system']")).toBeVisible();

			const viewport = await page.evaluate(() => ({
				scrollWidth: document.documentElement.scrollWidth,
				innerWidth: window.innerWidth,
			}));
			expect(viewport.scrollWidth, "documentElement.scrollWidth").toBeLessThanOrEqual(
				viewport.innerWidth,
			);

			await expectWithinViewport(page, "[data-slot='mobile-stage-tabs']");
			if (route.includes("/capture")) {
				await expectWithinViewport(page, "[data-slot='capture-block-actions']");
			}
		});
	}
});
