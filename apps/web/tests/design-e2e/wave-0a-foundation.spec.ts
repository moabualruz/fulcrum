import { expect, test } from "@playwright/test";

const requiredTokens = [
	"--primary",
	"--primary-foreground",
	"--accent",
	"--accent-foreground",
	"--surface",
	"--fg",
	"--bg",
	"--border",
	"--danger",
	"--warning",
	"--success",
	"--destructive",
];

test.describe("wave 0a color tokens", () => {
	test("exposes OKLCH semantic tokens for light, dark, and high contrast modes", async ({ page }) => {
		await page.goto("/wave-0a-foundation");

		for (const mode of ["light", "dark", "high-contrast"]) {
			await page.locator(`[data-mode-button='${mode}']`).click();
			await expect(page.locator("[data-token-mode]").first()).toHaveText(mode);

			const tokenValues = await page.evaluate((tokens) => {
				const scope = document.querySelector("[data-token-scope]");
				if (!scope) throw new Error("token scope missing");
				const styles = getComputedStyle(scope);
				return Object.fromEntries(tokens.map((token) => [token, styles.getPropertyValue(token).trim()]));
			}, requiredTokens);

			for (const token of requiredTokens) {
				expect(tokenValues[token], `${mode} ${token}`).toMatch(/^oklch\(/);
			}
		}
	});

	test("renders contrast pairs without hardcoded hex or rgb colors", async ({ page }) => {
		await page.goto("/wave-0a-foundation");

		await expect(page.locator("[data-color-token-grid]")).toBeVisible();
		await expect(page.locator("[data-token='--primary']")).toContainText("Primary");
		await expect(page.locator("[data-token='--success']")).toContainText("Success");

		const source = await page.locator("body").evaluate(() => document.body.innerHTML);
		expect(source).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
	});
});
