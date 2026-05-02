import { expect, test } from "@playwright/test";

test("login page renders local auth controls without SaaS OAuth buttons", async ({ page }) => {
	await page.goto("/auth/login");

	await expect(page.getByLabel("Email")).toBeVisible();
	await expect(page.getByLabel("Password")).toBeVisible();
	await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
	await expect(page.locator("[data-oauth-google]")).toHaveCount(0);
	await expect(page.locator("[data-oauth-github]")).toHaveCount(0);
});

test("logout POST redirects to login", async ({ request }) => {
	const response = await request.post("/auth/logout", { maxRedirects: 0 });
	expect(response.status()).toBe(302);
	expect(response.headers()["location"]).toBe("/auth/login");
});
