import { expect, test } from "@playwright/test";

test.describe("agent token chart", () => {
	test("cumulative tokens reflect all turns and update when a turn is added", async ({ page }) => {
		await page.goto("/agent-token-chart");
		const cumulative = page.locator("[data-token-cumulative]");
		const initial = Number(await cumulative.textContent());
		expect(initial).toBeGreaterThan(0);
		await page.locator("[data-token-add-claude]").click();
		const next = Number(await cumulative.textContent());
		expect(next).toBeGreaterThan(initial);
	});

	test("bars carry model attributes so multi-model sessions can be colored", async ({ page }) => {
		await page.goto("/agent-token-chart");
		await expect(page.locator("[data-token-bar='t1']")).toHaveAttribute("data-token-bar-model", "claude");
		await expect(page.locator("[data-token-bar='t3']")).toHaveAttribute("data-token-bar-model", "gpt");
	});

	test("focusing a bar surfaces input and output counts for that turn", async ({ page }) => {
		await page.goto("/agent-token-chart");
		await page.locator("[data-token-bar='t2']").focus();
		await expect(page.locator("[data-token-hover-id]")).toHaveText("t2");
		await expect(page.locator("[data-token-hover-input]")).toHaveText("180");
		await expect(page.locator("[data-token-hover-output]")).toHaveText("410");
	});
});
