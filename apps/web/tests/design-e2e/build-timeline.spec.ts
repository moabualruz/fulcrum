import { expect, test } from "@playwright/test";

test.describe("build timeline document history", () => {
	test("shows selectable version timeline and accessible inline diff", async ({ page }) => {
		await page.goto("/build-timeline");

		await expect(page.locator("[data-build-timeline]")).toBeVisible();
		await expect(page.locator("[data-version-timeline]")).toBeVisible();
		await expect(page.locator("[data-version-row='v4']")).toHaveAttribute("data-selected", "true");
		await expect(page.locator("[data-diff-line='removed']")).toContainText("Removed");
		await expect(page.locator("[data-diff-line='added']")).toContainText("Added");

		await page.locator("[data-version-row='v3']").click();
		await expect(page.locator("[data-version-row='v3']")).toHaveAttribute("data-selected", "true");
		await expect(page.locator("[data-selected-summary]")).toContainText("backlinks");
	});

	test("restore requires confirmation and records a resulting version state", async ({ page }) => {
		await page.goto("/build-timeline");

		await page.locator("[data-version-row='v2']").click();
		await page.locator("[data-restore-request]").click();
		await expect(page.locator("[data-restore-confirm]")).toContainText("Restore requires confirmation");
		await page.locator("[data-restore-confirm-action]").click();
		await expect(page.locator("[data-restore-state]")).toContainText("Restored Version 2");
		await expect(page.locator("[data-restore-state]")).toContainText("version 5");
	});

	test("comments add, resolve, failed, empty, and permission-denied states stay visible", async ({ page }) => {
		await page.goto("/build-timeline");

		await page.locator("[data-comment-submit]").click();
		await expect(page.locator("[data-slot='field-error']")).toContainText("Comment cannot be empty");

		await page.locator("[data-comment-input]").fill("fail to persist this note");
		await page.locator("[data-comment-submit]").click();
		await expect(page.locator("[data-slot='field-error']")).toContainText("Comment save failed");
		await expect(page.locator("[data-comment-input]")).toHaveValue("fail to persist this note");

		await page.locator("[data-comment-input]").fill("Link this diff to the approved planning context.");
		await page.locator("[data-comment-submit]").click();
		await expect(page.locator("[data-comment-row='c3']")).toContainText("Link this diff");
		await page.locator("[data-resolve-comment='c3']").click();
		await expect(page.locator("[data-comment-row='c3']")).toHaveAttribute("data-state", "resolved");

		await page.locator("[data-permission-toggle]").click();
		await page.locator("[data-comment-input]").fill("Needs editor permission");
		await page.locator("[data-comment-submit]").click();
		await expect(page.locator("[data-slot='field-error']")).toContainText("Permission denied");

		await page.locator("[data-clear-comments]").click();
		await expect(page.locator("[data-comment-empty]")).toContainText("No comments yet.");
	});

	test("backlinks and planning conversion remain visible on mobile", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/build-timeline");

		await expect(page.locator("[data-backlinks]")).toBeVisible();
		await expect(page.locator("[data-backlink='Sprint 18 planning']")).toContainText("Plan review");
		await expect(page.locator("[data-start-planning]")).toHaveAttribute("href", "/docs/mock-doc/planning");

		const overflow = await page.locator("[data-build-timeline]").evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
