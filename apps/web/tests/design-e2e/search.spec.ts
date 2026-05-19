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
});
