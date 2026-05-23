import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function openDesignKit(page: Page): Promise<void> {
	await page.goto("/design-kit");
	await expect(page.locator("[data-design-kit-ready='true']")).toBeVisible();
}

test.describe("ui-kit scroll-area primitive", () => {
	test("renders vertical, horizontal, and both-axis fixture variants", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='scroll-area']");
		await expect(section).toBeVisible();

		for (const orientation of ["vertical", "horizontal", "both"]) {
			const root = section.locator(`[data-slot='scroll-area'][data-orientation='${orientation}']`);
			await expect(root).toBeVisible();
			const viewport = root.locator("[data-slot='scroll-area-viewport']");
			await expect(viewport).toBeVisible();
			await expect(viewport).toHaveAttribute("tabindex", "0");
			await expect(viewport).toHaveAttribute("role", "region");
			await expect(viewport).toHaveAttribute("aria-label", /.+/);
		}

		const vertical = section.locator("[data-slot='scroll-area'][data-orientation='vertical']");
		await expect(
			vertical.locator("[data-slot='scroll-area-scrollbar'][data-orientation='vertical']"),
		).toHaveCount(1);
		await expect(vertical.locator("[data-slot='scroll-area-thumb']")).toHaveCount(1);

		const horizontal = section.locator("[data-slot='scroll-area'][data-orientation='horizontal']");
		await expect(
			horizontal.locator("[data-slot='scroll-area-scrollbar'][data-orientation='horizontal']"),
		).toHaveCount(1);
		await expect(horizontal.locator("[data-slot='scroll-area-thumb']")).toHaveCount(1);

		const both = section.locator("[data-slot='scroll-area'][data-orientation='both']");
		await expect(both.locator("[data-slot='scroll-area-scrollbar']")).toHaveCount(2);
		await expect(
			both.locator("[data-slot='scroll-area-scrollbar'][data-orientation='vertical']"),
		).toHaveCount(1);
		await expect(
			both.locator("[data-slot='scroll-area-scrollbar'][data-orientation='horizontal']"),
		).toHaveCount(1);
		await expect(both.locator("[data-slot='scroll-area-thumb']")).toHaveCount(2);
	});
});
