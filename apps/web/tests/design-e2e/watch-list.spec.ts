import { expect, test } from "@playwright/test";

test.describe("watch list", () => {
	test("watch toggle flips state and updates count across kinds", async ({ page }) => {
		await page.goto("/watch-list");
		await expect(page.locator("[data-watch-entity='task:T1']")).toHaveAttribute("data-watch-on", "true");
		await expect(page.locator("[data-watch-count]")).toHaveText("1");

		await page.locator("[data-watch-toggle='project:p1']").click();
		await expect(page.locator("[data-watch-entity='project:p1']")).toHaveAttribute("data-watch-on", "true");
		await expect(page.locator("[data-watch-count]")).toHaveText("2");

		await page.locator("[data-watch-toggle='task:T1']").click();
		await expect(page.locator("[data-watch-entity='task:T1']")).toHaveAttribute("data-watch-on", "false");
		await expect(page.locator("[data-watch-count]")).toHaveText("1");
	});

	test("all seven supported kinds are watchable", async ({ page }) => {
		await page.goto("/watch-list");
		for (const id of ["project:p1", "cycle:c1", "module:m1", "doc:d1", "run:r1", "saved-view:v1"]) {
			await page.locator(`[data-watch-toggle='${id}']`).click();
		}
		await expect(page.locator("[data-watch-count]")).toHaveText("7");
	});
});
