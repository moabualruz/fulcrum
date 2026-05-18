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

const requiredRadiusTokens = [
	["--radius-sm", "calc(0.625rem * 0.6)"],
	["--radius-md", "calc(0.625rem * 0.8)"],
	["--radius-lg", "0.625rem"],
	["--radius-xl", "calc(0.625rem * 1.4)"],
	["--radius-2xl", "calc(0.625rem * 1.8)"],
	["--radius-3xl", "calc(0.625rem * 2.2)"],
	["--radius-4xl", "calc(0.625rem * 2.6)"],
] as const;

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

test.describe("wave 0a radius scale", () => {
	test("exposes configurable Tailwind radius tokens", async ({ page }) => {
		await page.goto("/wave-0a-foundation");

		const tokenValues = await page.evaluate((tokens) => {
			const scope = document.querySelector("[data-token-scope]");
			if (!scope) throw new Error("token scope missing");
			const styles = getComputedStyle(scope);
			return Object.fromEntries(tokens.map((token) => [token, styles.getPropertyValue(token).trim()]));
		}, requiredRadiusTokens.map(([token]) => token));

		for (const [token, value] of requiredRadiusTokens) {
			expect(tokenValues[token], token).toBe(value);
		}
	});

	test("uses radius-md for buttons, radius-lg for cards, radius-xl for modals, and class overrides", async ({
		page,
	}) => {
		await page.goto("/wave-0a-foundation");

		await expect(page.locator("[data-radius-token-grid]")).toBeVisible();
		await expect(page.locator("[data-radius-button]")).toHaveCSS("border-radius", "8px");
		await expect(page.locator("[data-radius-card]")).toHaveCSS("border-radius", "10px");
		await expect(page.locator("[data-radius-modal]")).toHaveCSS("border-radius", "14px");
		await expect(page.locator("[data-radius-override]")).toHaveCSS("border-radius", "22px");

		const source = await page.locator("body").evaluate(() => document.body.innerHTML);
		expect(source).not.toMatch(/border-radius\\s*:/i);
	});
});
