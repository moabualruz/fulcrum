import { expect, test } from "@playwright/test";

test.describe("code review loop", () => {
	test("loads each diff source and preserves base/head identity", async ({ page }) => {
		await page.goto("/build-runs");

		await expect(page.locator("[data-build-runs-review]")).toBeVisible();
		await expect(page.locator("[data-review-base]")).toHaveText("workspace:index");
		await expect(page.locator("[data-review-head]")).toHaveText("workspace:working-tree");

		await page.locator("[data-diff-source='staged']").click();
		await expect(page.locator("[data-review-base]")).toHaveText("HEAD");
		await expect(page.locator("[data-review-head]")).toHaveText("index");

		await page.locator("[data-diff-source='branch']").click();
		await expect(page.locator("[data-review-base]")).toHaveText("dev/v1.0");
		await expect(page.locator("[data-review-head]")).toHaveText("feat/review-loop");

		await page.locator("[data-diff-source='pull']").click();
		await expect(page.locator("[data-review-base]")).toHaveText("origin/dev/v1.0");
		await expect(page.locator("[data-review-head]")).toHaveText("review/42/head");
	});

	test("anchors inline comments to file path and line range", async ({ page }) => {
		await page.goto("/build-runs");

		await page.locator("[data-annotate-line='142']").click();
		await expect(page.locator("[data-annotation-range]")).toHaveText(
			"services/planning-review/src/application/reviews/review-workbench.ts:142-142",
		);
		await page.locator("[data-annotation-text]").fill("Return actionable retry guidance to the agent.");
		await expect(page.locator("[data-feedback-payload]")).toContainText("review-workbench.ts");
		await expect(page.locator("[data-feedback-payload]")).toContainText("Return actionable retry guidance");
	});

	test("exports feedback to a follow-up agent run and records approval identity", async ({ page }) => {
		await page.goto("/build-runs");

		await page.locator("[data-annotate-line='85']").click();
		await page.locator("[data-feedback-destination]").selectOption("local-agent");
		await page.locator("[data-send-feedback]").click();
		await expect(page.locator("[data-feedback-run]")).toContainText(
			"apps/web/src/routes/runs/[id]/+page.svelte:85-85",
		);

		await page.locator("[data-approve-diff]").click();
		await expect(page.locator("[data-approval-record]")).toContainText("workspace:index -> workspace:working-tree");
		await expect(page.locator("[data-approval-record]")).toContainText("85-85");
	});

	test("keeps review workbench usable on mobile without horizontal page overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/build-runs");

		await expect(page.locator("[data-diff-source-picker]")).toBeVisible();
		await expect(page.locator("[data-review-sidebar]")).toBeVisible();
		const overflow = await page.locator("[data-build-runs-review]").evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
