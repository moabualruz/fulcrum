import { expect, test } from "@playwright/test";

test.describe("search breadcrumb navigation", () => {
	test("renders breadcrumb spine with project icon and a non-clickable current page", async ({ page }) => {
		await page.goto("/search");

		const breadcrumb = page.locator("[data-search-breadcrumb]");
		await expect(breadcrumb).toBeVisible();
		await expect(breadcrumb).toHaveAttribute("aria-label", "Breadcrumb");

		const projectIcon = page.locator("[data-project-icon]");
		await expect(projectIcon).toBeVisible();
		await expect(projectIcon).toHaveAttribute("data-project-id", "proj-fulcrum");

		const items = breadcrumb.locator("[data-slot='breadcrumb-item']");
		await expect(items).toHaveCount(3);

		const workspaceLink = items.nth(0).locator("a");
		await expect(workspaceLink).toHaveAttribute("href", "/");
		await expect(workspaceLink).toContainText("Workspace");

		const projectLink = items.nth(1).locator("a");
		await expect(projectLink).toHaveAttribute("href", "/projects/proj-fulcrum");
		await expect(projectLink).toContainText("Fulcrum");

		const current = items.nth(2);
		await expect(current).toHaveAttribute("data-current", "true");
		await expect(current.locator("a")).toHaveCount(0);
		await expect(current.locator("[aria-current='page']")).toContainText("Search");
	});

	test("exposes federated search kinds, fast actions, and useful no-result recovery", async ({ page }) => {
		await page.goto("/search?q=missing-trace");

		await expect(page.locator("[data-search-fast-actions]")).toContainText("Open command palette");
		await expect(page.locator("[data-search-command-action='open-palette']")).toHaveAttribute("href", "/palette");
		await expect(page.locator("[data-kind-checkbox='doc']")).toBeVisible();
		await expect(page.locator("[data-kind-checkbox='task']")).toBeVisible();
		await expect(page.locator("[data-kind-checkbox='run']")).toBeVisible();
		await expect(page.locator("[data-kind-checkbox='artifact']")).toBeVisible();
		await expect(page.locator("[data-search-empty]")).toContainText("trace ID");
		await expect(page.locator("[data-search-empty-action='palette']")).toHaveAttribute("href", "/palette");
	});

	test("keeps search controls usable on mobile without horizontal overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/search?q=missing-trace");

		await expect(page.locator("[data-search-form]")).toBeVisible();
		await expect(page.locator("[data-facet-panel]")).toBeVisible();
		const overflow = await page.locator("#main-content").evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
