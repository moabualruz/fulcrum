import { expect, test } from "@playwright/test";

test.describe("permission-aware command palette", () => {
	test("declares required permissions and blocks viewer-only work actions", async ({ page }) => {
		await page.goto("/palette");

		await expect(page.locator("[data-palette-header]")).toContainText("Permission-aware work actions");
		await expect(page.locator("[data-command-action]")).toHaveCount(7);
		await expect(page.locator("[data-command-action='task-status']")).toContainText("task.update");
		await expect(page.locator("[data-command-action='task-delete']")).toContainText("Requires admin permission.");
		await expect(page.locator("[data-command-action='task-delete'] [data-command-button]")).toBeDisabled();
		await expect(page.locator("[data-server-rejection]")).toContainText("FORBIDDEN");
		await expect(page.locator("[data-forbidden-response]")).toContainText("Requires member permission.");
	});

	test("enables member/admin actions and explains project membership loss", async ({ page }) => {
		await page.goto("/palette");

		await page.locator("[data-role-select]").selectOption("member");
		await expect(page.locator("[data-command-action='task-status'] [data-command-button]")).toBeEnabled();
		await expect(page.locator("[data-command-action='task-delete'] [data-command-button]")).toBeDisabled();

		await page.locator("[data-role-select]").selectOption("admin");
		await expect(page.locator("[data-command-action='task-delete'] [data-command-button]")).toBeEnabled();

		await page.locator("[data-project-access-toggle]").uncheck();
		await expect(page.locator("[data-command-action='task-status']")).toContainText("No project membership for this scope.");
		await expect(page.locator("[data-command-action='task-status'] [data-command-button]")).toBeDisabled();
	});

	test("applies saved view private, project, and workspace access semantics", async ({ page }) => {
		await page.goto("/palette");

		await expect(page.locator("[data-saved-view='view-private']")).toHaveAttribute("data-view-visible", "true");
		await expect(page.locator("[data-saved-view='view-project']")).toHaveAttribute("data-view-visible", "true");
		await expect(page.locator("[data-saved-view='view-workspace']")).toHaveAttribute("data-view-visible", "true");

		await page.locator("[data-project-select]").selectOption("beta");
		await expect(page.locator("[data-saved-view='view-project']")).toHaveAttribute("data-view-visible", "false");
		await expect(page.locator("[data-saved-view='view-workspace']")).toHaveAttribute("data-view-visible", "true");
	});

	test("keeps command controls usable on mobile without horizontal overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/palette");
		await page.locator("[data-command-search]").fill("bulk");

		await expect(page.locator("[data-command-action='command-bulk-delete']")).toBeVisible();
		const overflow = await page.locator("[data-palette-page]").evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
