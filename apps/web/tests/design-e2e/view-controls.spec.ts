import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function openViewControls(page: Page): Promise<void> {
	await page.goto("/view-controls");
	await expect(page.locator("[data-view-controls-ready='true']")).toBeVisible();
}

test.describe("view controls sort interactions", () => {
	test("sorts any displayed field from table headers and toggles direction", async ({ page }) => {
		await openViewControls(page);

		const sortableHeaders = page.locator("[data-sort-header]");
		await expect(sortableHeaders).toHaveCount(6);
		for (const field of ["key", "title", "state", "priority", "estimate", "updated"]) {
			await expect(page.locator(`[data-sort-header='${field}']`)).toBeVisible();
		}

		await page.locator("[data-sort-header='priority']").click();
		await expect(page.locator("[data-current-sort]")).toContainText("Priority asc");
		await expect(page.locator("[data-sort-header='priority']")).toHaveAttribute("aria-sort", "ascending");
		await expect(page.locator("[data-sort-header='priority'] [data-sort-indicator]")).toContainText("asc");
		await expect(page.locator("[data-task-row]").first()).toHaveAttribute("data-task-key", "FUL-204");

		await page.locator("[data-sort-header='priority']").click();
		await expect(page.locator("[data-current-sort]")).toContainText("Priority desc");
		await expect(page.locator("[data-sort-header='priority']")).toHaveAttribute("aria-sort", "descending");
		await expect(page.locator("[data-sort-header='priority'] [data-sort-indicator]")).toContainText("desc");
		await expect(page.locator("[data-task-row]").first()).toHaveAttribute("data-task-key", "FUL-176");
	});

	test("switches sort field, clears sort, and keeps mobile menu inside viewport", async ({ page }) => {
		await openViewControls(page);

		await page.locator("[data-sort-header='state']").click();
		await expect(page.locator("[data-current-sort]")).toContainText("State asc");
		await expect(page.locator("[data-sort-header='state']")).toHaveAttribute("aria-sort", "ascending");

		await page.setViewportSize({ width: 390, height: 844 });
		await openViewControls(page);
		await expect(page.locator("[data-mobile-sort-controls]")).toBeVisible();

		await page.locator("[data-mobile-sort-field]").selectOption("key");
		await page.locator("[data-mobile-sort-direction]").selectOption("asc");
		await expect(page.locator("[data-current-sort]")).toContainText("Key asc");
		await expect(page.locator("[data-task-row]").first()).toHaveAttribute("data-task-key", "FUL-176");

		const overflow = await page.locator("[data-mobile-sort-controls]").evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);

		await page.locator("[data-clear-sort]").click();
		await expect(page.locator("[data-current-sort]")).toContainText("Original order");
		await expect(page.locator("[data-task-row]").first()).toHaveAttribute("data-task-key", "FUL-204");
	});
});
