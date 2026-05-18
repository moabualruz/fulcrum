import { expect, test } from "@playwright/test";

test.describe("docs hub", () => {
	test("keeps documents header, search, filter form, and recovery visible when API unavailable", async ({ page }) => {
		await page.goto("/docs");

		await expect(page.locator("[data-docs-header]")).toContainText("Documents");
		await expect(page.locator("[data-new-doc]")).toBeVisible();
		await expect(page.locator("[data-new-doc]")).toHaveAttribute("href", "/docs/new");
		await expect(page.locator("[data-global-tree]")).toBeVisible();
		await expect(page.locator("[data-docs-hub]")).toBeVisible();
		await expect(page.locator("[data-project-doc-tree]")).toBeVisible();
		await expect(page.locator("[data-global-doc-tree]")).toBeVisible();

		await expect(page.locator("[data-docs-filter]")).toBeVisible();
		await expect(page.locator("[data-kind-filter]")).toBeVisible();
		await expect(page.locator("[data-q-filter]")).toBeVisible();
		await expect(page.locator("[data-in-context-search]")).toBeVisible();

		const error = page.locator("[data-docs-error]");
		if (await error.isVisible()) {
			await expect(error).toContainText("Documents could not load");
			await expect(error).toContainText("Recovery:");
			await expect(error).toContainText("docs-list");
			await expect(page.locator("[data-docs-error-retry]")).toBeVisible();
		} else {
			await expect(
				page
					.locator("[data-empty-docs]")
					.or(page.locator("[data-empty-filter]"))
					.or(page.locator("[data-doc-row]").first()),
			).toBeVisible();
		}
	});

	test("filter input value persists when typing then submitting", async ({ page }) => {
		await page.goto("/docs");

		await page.locator("[data-q-filter]").fill("definitely-no-doc-here");
		await page.locator("[data-docs-filter] button[type='submit']").click();

		await expect(page).toHaveURL(/[?&]q=definitely-no-doc-here/);
		await expect(page.locator("[data-q-filter]")).toHaveValue("definitely-no-doc-here");
	});

	test("kind select submits the form automatically on change", async ({ page }) => {
		await page.goto("/docs");

		await page.locator("[data-kind-filter]").selectOption("spec");
		await page.waitForURL(/[?&]kind=spec/);
		await expect(page.locator("[data-kind-filter]")).toHaveValue("spec");
	});

	test("keeps docs hub usable on mobile without horizontal overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/docs");

		await expect(page.locator("[data-docs-header]")).toBeVisible();
		await expect(page.locator("[data-new-doc]")).toBeVisible();
		await expect(page.locator("[data-kind-filter]")).toBeVisible();
		await expect(page.locator("[data-q-filter]")).toBeVisible();

		await expect(
			page
				.locator("[data-docs-error]")
				.or(page.locator("[data-empty-docs]"))
				.or(page.locator("[data-doc-row]").first()),
		).toBeVisible();

		const overflow = await page
			.locator("main")
			.last()
			.evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
