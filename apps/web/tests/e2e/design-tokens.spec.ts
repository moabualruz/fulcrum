import { expect, test } from "@playwright/test";

test.describe("design tokens route", () => {
	test("SSRs the token specimen and supports mode URLs", async ({ page }) => {
		const response = await page.goto("/design-tokens?mode=high-contrast");

		expect(response?.ok(), `route returned ${response?.status() ?? "no response"}`).toBe(true);
		await expect(page.getByRole("heading", { name: "Color token specimen" })).toBeVisible();
		await expect(page.locator("[data-token-mode]")).toHaveText("high-contrast");
		await expect(page.locator("[data-token='--primary']")).toContainText("Primary");
		await expect(page.locator("[data-token='--warning']")).toContainText("Warning");
	});

	test("redirects the retired legacy route", async ({ page }) => {
		const response = await page.goto("/wave-0a-foundation?mode=high-contrast");

		expect(response?.ok(), `route returned ${response?.status() ?? "no response"}`).toBe(true);
		expect(page.url()).toContain("/design-tokens?mode=high-contrast");
		await expect(page.getByRole("heading", { name: "Color token specimen" })).toBeVisible();
	});
});
