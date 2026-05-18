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
	["--radius-sm", "calc(.625rem * .6)"],
	["--radius-md", "calc(.625rem * .8)"],
	["--radius-lg", ".625rem"],
	["--radius-xl", "calc(.625rem * 1.4)"],
	["--radius-2xl", "calc(.625rem * 1.8)"],
	["--radius-3xl", "calc(.625rem * 2.2)"],
	["--radius-4xl", "calc(.625rem * 2.6)"],
] as const;

const requiredShadowTokens = [
	["--shadow-xs", "0 1px 2px oklch(18% .01 270/.06)"],
	["--shadow-sm", "0 2px 4px oklch(18% .01 270/.08)"],
	["--shadow-md", "0 4px 8px oklch(18% .01 270/.1)"],
	["--shadow-lg", "0 8px 16px oklch(18% .01 270/.14)"],
	["--shadow-xl", "0 16px 32px oklch(18% .01 270/.18)"],
] as const;

async function readTokenValues(page: import("@playwright/test").Page, tokens: readonly string[]) {
	return page.evaluate((tokenNames) => {
		const scope = document.querySelector("[data-token-scope]");
		if (!scope) throw new Error("token scope missing");
		const styles = getComputedStyle(scope);
		return Object.fromEntries(tokenNames.map((token) => [token, styles.getPropertyValue(token).trim()]));
	}, tokens);
}

test.describe("wave 0a color tokens", () => {
	test("exposes OKLCH semantic tokens for light, dark, and high contrast modes", async ({ page }) => {
		await page.goto("/wave-0a-foundation");
		await expect(page.locator("[data-token-scope]")).toHaveAttribute("data-hydrated", "true");

		for (const mode of ["light", "dark", "high-contrast"]) {
			await page.locator(`[data-mode-button='${mode}']`).click();
			await expect(page.locator("[data-token-mode]").first()).toHaveText(mode);

			const tokenValues = await readTokenValues(page, requiredTokens);

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

test.describe("wave 0a shadow scale", () => {
	test("defines elevation tokens and adjusts shadow opacity by mode", async ({ page }) => {
		await page.goto("/wave-0a-foundation");
		await expect(page.locator("[data-token-scope]")).toHaveAttribute("data-hydrated", "true");

		const tokenValues = await readTokenValues(page, requiredShadowTokens.map(([token]) => token));
		for (const [token, value] of requiredShadowTokens) {
			expect(tokenValues[token], token).toBe(value);
		}

		const lightColors = await readTokenValues(page, ["--shadow-sm-color", "--shadow-lg-color"]);
		await page.locator("[data-mode-button='dark']").click();
		await expect(page.locator("[data-token-mode]").first()).toHaveText("dark");
		const darkColors = await readTokenValues(page, ["--shadow-sm-color", "--shadow-lg-color"]);

		expect(darkColors["--shadow-sm-color"]).not.toBe(lightColors["--shadow-sm-color"]);
		expect(darkColors["--shadow-lg-color"]).not.toBe(lightColors["--shadow-lg-color"]);
		expect(darkColors["--shadow-lg-color"]).toContain("/.44");
	});

	test("maps floating components to correct shadows and keeps inputs and text flat", async ({ page }) => {
		await page.goto("/wave-0a-foundation");

		await expect(page.locator("[data-shadow-token-grid]")).toBeVisible();
		await expect(page.locator("[data-shadow-popover]")).toHaveCSS("box-shadow", /0px 2px 4px/);
		await expect(page.locator("[data-shadow-dropdown]")).toHaveCSS("box-shadow", /0px 4px 8px/);
		await expect(page.locator("[data-shadow-dialog]")).toHaveCSS("box-shadow", /0px 8px 16px/);
		await expect(page.locator("[data-shadow-input]")).toHaveCSS("box-shadow", "none");
		await expect(page.locator("[data-shadow-text]")).toHaveCSS("box-shadow", "none");

		await expect(page.locator("[data-shadow-hover-card]")).toHaveCSS("box-shadow", /0px 2px 4px/);
		await page.locator("[data-shadow-hover-card]").hover();
		await expect(page.locator("[data-shadow-hover-card]")).toHaveCSS("box-shadow", /0px 4px 8px/);
	});
});

test.describe("wave 0a radius scale", () => {
	test("exposes configurable Tailwind radius tokens", async ({ page }) => {
		await page.goto("/wave-0a-foundation");

		const tokenValues = await readTokenValues(page, requiredRadiusTokens.map(([token]) => token));

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
