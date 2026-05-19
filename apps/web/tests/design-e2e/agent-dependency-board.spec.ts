import { expect, test } from "@playwright/test";

test.describe("multi-agent dependency board", () => {
	test("cards expose status and agent attributes", async ({ page }) => {
		await page.goto("/agent-dependency-board");
		await expect(page.locator("[data-board-card='T1']")).toHaveAttribute("data-board-status", "done");
		await expect(page.locator("[data-board-card='T2']")).toHaveAttribute("data-board-status", "running");
		await expect(page.locator("[data-board-card='T3']")).toHaveAttribute("data-board-status", "blocked");
		await expect(page.locator("[data-board-card='T2']")).toHaveAttribute("data-board-agent", "codex");
	});

	test("hover over blocked task reveals blockers", async ({ page }) => {
		await page.goto("/agent-dependency-board");
		await page.locator("[data-board-card='T3']").hover();
		await expect(page.locator("[data-board-blockers]")).toContainText("T1, T2");
	});

	test("reassigning a task updates the data attribute", async ({ page }) => {
		await page.goto("/agent-dependency-board");
		await page.locator("[data-board-reassign='T4']").selectOption("gemini");
		await expect(page.locator("[data-board-card='T4']")).toHaveAttribute("data-board-agent", "gemini");
	});
});
