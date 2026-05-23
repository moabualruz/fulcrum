import { expect, test } from "@playwright/test";

test.describe("workspace members", () => {
	test("lists existing members with role and status badges", async ({ page }) => {
		await page.goto("/members");

		await expect(page.locator("[data-members-header]")).toContainText("Workspace members");
		await expect(page.locator("[data-member-row='u_owner']")).toBeVisible();
		await expect(page.locator("[data-member-row='u_admin']")).toBeVisible();
		await expect(page.locator("[data-member-row='i_pending']")).toBeVisible();
		await expect(page.locator("[data-member-status='i_pending']")).toContainText("invited");
		await expect(page.locator("[data-member-status='u_owner']")).toContainText("active");
	});

	test("invite form validates email and rejects duplicates", async ({ page }) => {
		await page.goto("/members");

		await page.locator("[data-invite-email]").fill("not-an-email");
		await page.locator("[data-invite-submit]").click();
		await expect(page.locator("[data-invite-error]")).toContainText("valid email");

		await page.locator("[data-invite-email]").fill("admin@fulcrum.test");
		await page.locator("[data-invite-submit]").click();
		await expect(page.locator("[data-invite-error]")).toContainText("already a member");
	});

	test("invite appends an invited row with the chosen role", async ({ page }) => {
		await page.goto("/members");

		await page.locator("[data-invite-email]").fill("new@fulcrum.test");
		await page.locator("[data-invite-role]").selectOption("admin");
		await page.locator("[data-invite-submit]").click();
		await expect(page.locator("[data-member-row='i_new_fulcrum_test']")).toBeVisible();
		await expect(page.locator("[data-member-status='i_new_fulcrum_test']")).toContainText("invited");
	});

	test("role change persists per row; owner cannot be demoted", async ({ page }) => {
		await page.goto("/members");

		await expect(page.locator("[data-member-role='u_owner']")).toBeDisabled();
		await page.locator("[data-member-role='u_admin']").selectOption("guest");
		await expect(page.locator("[data-member-role='u_admin']")).toHaveValue("guest");
	});

	test("remove drops the row; owner remove button is hidden", async ({ page }) => {
		await page.goto("/members");

		await expect(page.locator("[data-remove-member='u_owner']")).toHaveCount(0);
		await page.locator("[data-remove-member='u_guest']").click();
		await expect(page.locator("[data-member-row='u_guest']")).toHaveCount(0);
	});

	test("resend invite surfaces a transient resent indicator", async ({ page }) => {
		await page.goto("/members");

		await page.locator("[data-resend-invite='i_pending']").click();
		await expect(page.locator("[data-resent-confirmation='i_pending']")).toContainText("resent");
	});
});
