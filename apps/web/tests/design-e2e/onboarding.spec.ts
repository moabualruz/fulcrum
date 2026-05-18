import { expect, test } from "@playwright/test";

test.describe("onboarding signup workspace setup", () => {
	test("shows email verification, workspace setup, invites, and trace continuity", async ({ page }) => {
		await page.goto("/onboarding");

		await expect(page.locator("[data-onboarding-header]")).toContainText("User signup and workspace setup");
		await expect(page.locator("[data-onboarding-trace]")).toContainText("trace-onboard-1842");
		await expect(page.locator("[data-onboarding-steps]")).toContainText("Verify email");
		await expect(page.locator("[data-verification-status]")).toContainText("Email verification pending");

		await expect(page.locator("[data-user-email]")).toHaveValue("ada@local");
		await expect(page.locator("[data-user-role]")).toHaveValue("Owner");
		await expect(page.locator("[data-workspace-name]")).toHaveValue("Fulcrum Lab");
		await expect(page.locator("[data-slug-preview]")).toContainText("/fulcrum-lab");

		await page.locator("[data-workspace-slug]").fill("ops-control");
		await expect(page.locator("[data-slug-preview]")).toContainText("/ops-control");

		await expect(page.locator("[data-invite-row]")).toHaveCount(2);
		await expect(page.locator("[data-setup-checklist]")).toContainText("Default project");
		await expect(page.locator("[data-resend-verification]")).toBeVisible();
		await expect(page.locator("[data-create-workspace]")).toBeVisible();
	});

	test("keeps setup controls usable on mobile", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/onboarding");

		await expect(page.locator("[data-workspace-setup]")).toBeVisible();
		await expect(page.locator("[data-create-workspace]")).toBeVisible();
		await expect(page.locator("[data-invite-queue]")).toBeVisible();

		const overflow = await page
			.locator("[data-onboarding-page]")
			.evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
