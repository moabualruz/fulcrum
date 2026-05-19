import { expect, test } from "@playwright/test";

test.describe("agent session fork", () => {
	test("forking from an event creates a new session with copied history up to that point", async ({ page }) => {
		await page.goto("/agent-session-fork");
		await page.locator("[data-event-fork='e2']").click();

		await expect(page.locator("[data-session-tab='s2']")).toBeVisible();
		await expect(page.locator("[data-session-tab='s2']")).toContainText("@ e2");

		await page.locator("[data-session-tab='s2']").click();
		await expect(page.locator("[data-active-session-id]")).toHaveAttribute("data-active-session-id", "s2");
		await expect(page.locator("[data-session-parent]")).toHaveText("s1");
		await expect(page.locator("[data-session-fork-point]")).toHaveText("e2");
		await expect(page.locator("[data-event-row='e1']")).toBeVisible();
		await expect(page.locator("[data-event-row='e2']")).toBeVisible();
		await expect(page.locator("[data-event-row='e3']")).toHaveCount(0);
	});

	test("forked session persists alongside parent in the session list", async ({ page }) => {
		await page.goto("/agent-session-fork");
		await page.locator("[data-event-fork='e3']").click();
		await expect(page.locator("[data-session-tab='s1']")).toBeVisible();
		await expect(page.locator("[data-session-tab='s2']")).toBeVisible();
	});
});
