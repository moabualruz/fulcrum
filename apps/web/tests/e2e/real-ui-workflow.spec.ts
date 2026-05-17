import { expect, test } from "@playwright/test";

test("real UI workflow creates project then creates board task without fixture seeding", async ({ page }) => {
	const failures: Array<{ status: number; url: string }> = [];
	page.on("response", (response) => {
		if (response.status() >= 500) {
			failures.push({ status: response.status(), url: response.url() });
		}
	});

	const projectName = `Real Workflow ${Date.now()}`;
	await page.goto("/projects/new");
	await expect(page.locator("[data-project-form]")).toBeVisible();
	await expect(page.locator("[data-project-parent]")).toContainText("No parent");

	await page.locator("[data-project-name]").fill(projectName);
	await expect(page.locator("[data-project-slug]")).toHaveValue(/real-workflow-/);
	await page.locator("[data-project-submit]").click();

	await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
	await expect(page.locator("[data-project-detail-header]")).toContainText(projectName);
	await expect(page.locator("[data-project-detail-header]")).toContainText("Active project");

	await page.getByLabel("Project sections").getByRole("link", { name: "Board" }).click();
	await expect(page.locator("[data-project-board-grid]")).toBeVisible();

	const pending = page.locator("[data-board-column][data-status='pending']");
	await pending.locator("[data-board-column-input]").fill("Real workflow task");
	await pending.locator("[data-board-column-input]").press("Enter");

	await expect(
		pending.locator("[data-board-card]").filter({ hasText: "Real workflow task" }),
	).toBeVisible();
	expect(failures).toEqual([]);
});
