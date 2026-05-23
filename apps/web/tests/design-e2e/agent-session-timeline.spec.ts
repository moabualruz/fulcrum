import { expect, test } from "@playwright/test";

test.describe("agent session timeline", () => {
	test("events render chronologically with distinct kind attributes", async ({ page }) => {
		await page.goto("/agent-session-timeline");
		await expect(page.locator("[data-timeline-event='e1']")).toHaveAttribute("data-timeline-kind", "chat");
		await expect(page.locator("[data-timeline-event='e2']")).toHaveAttribute("data-timeline-kind", "tool");
		await expect(page.locator("[data-timeline-event='e3']")).toHaveAttribute("data-timeline-kind", "lock");
		await expect(page.locator("[data-timeline-event='e5']")).toHaveAttribute("data-timeline-kind", "error");
	});

	test("expanding an event reveals detail and a jump action", async ({ page }) => {
		await page.goto("/agent-session-timeline");
		await expect(page.locator("[data-timeline-detail]")).toHaveCount(0);
		await page.locator("[data-timeline-toggle='e4']").click();
		await expect(page.locator("[data-timeline-detail]")).toBeVisible();
		await page.locator("[data-timeline-jump='e4']").click();
		await expect(page.locator("[data-timeline-scrolled]")).toContainText("e4");
	});
});
