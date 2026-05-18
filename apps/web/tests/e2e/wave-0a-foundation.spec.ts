import { expect, test } from "@playwright/test";

test.describe("wave 0a foundation route", () => {
	test("SSRs the token specimen and supports mode URLs", async ({ page }) => {
		const response = await page.goto("/wave-0a-foundation?mode=high-contrast");

		expect(response?.ok(), `route returned ${response?.status() ?? "no response"}`).toBe(true);
		await expect(page.getByRole("heading", { name: "Color token specimen" })).toBeVisible();
		await expect(page.locator("[data-token-mode]")).toHaveText("high-contrast");
		await expect(page.locator("[data-token='--primary']")).toContainText("Primary");
		await expect(page.locator("[data-token='--warning']")).toContainText("Warning");
	});
});
