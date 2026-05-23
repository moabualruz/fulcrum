import { expect, test } from "@playwright/test";

const STAGE_ROUTES = [
	"/mkh/projects/fulcrum/plan",
	"/mkh/projects/fulcrum/build",
	"/mkh/projects/fulcrum/operate",
] as const;

test.describe("desktop shell footer layout", () => {
	test.use({ viewport: { width: 1280, height: 800 } });

	for (const route of STAGE_ROUTES) {
		test(`keeps StatusFooter fixed at viewport bottom on ${route}`, async ({ page }) => {
			await page.goto(route, { waitUntil: "load" });

			const layout = await page.evaluate(() => {
				const footer = document.querySelector<HTMLElement>("[data-slot='status-footer']");
				const main = document.querySelector<HTMLElement>("#main-content");
				if (!footer || !main) return null;

				const footerRect = footer.getBoundingClientRect();

				return {
					documentHeight: document.documentElement.scrollHeight,
					footerBottom: Math.round(footerRect.bottom),
					footerHeight: Math.round(footerRect.height),
					footerTop: Math.round(footerRect.top),
					mainClientHeight: main.clientHeight,
					mainScrollHeight: main.scrollHeight,
					viewportHeight: window.innerHeight,
				};
			});

			expect(layout).not.toBeNull();
			expect(layout?.footerHeight).toBe(44);
			expect(Math.abs((layout?.footerBottom ?? 0) - (layout?.viewportHeight ?? 0))).toBeLessThanOrEqual(1);
			expect(layout?.footerTop).toBeGreaterThan(0);
			expect(layout?.documentHeight).toBeLessThanOrEqual(layout?.viewportHeight ?? 0);
			expect(layout?.mainScrollHeight).toBeGreaterThanOrEqual(layout?.mainClientHeight ?? 0);
		});
	}
});
