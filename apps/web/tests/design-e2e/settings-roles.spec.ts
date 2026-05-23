import { expect, test } from "@playwright/test";

test.describe("settings role definitions", () => {
	test("renders owner/admin/member/guest cards with capability descriptions", async ({ page }) => {
		await page.goto("/settings/roles");

		await expect(page.locator("[data-settings-roles-header]")).toContainText("Role definitions");
		await expect(page.locator("[data-role-card='owner']")).toBeVisible();
		await expect(page.locator("[data-role-card='admin']")).toBeVisible();
		await expect(page.locator("[data-role-card='member']")).toBeVisible();
		await expect(page.locator("[data-role-card='guest']")).toBeVisible();

		await expect(page.locator("[data-role-capability='owner-delete_workspace']")).toContainText("Permanent removal");
		await expect(page.locator("[data-role-capability='admin-manage_members']")).toContainText("Invite, change role");
	});

	test("guest sees comment but not edit, member sees edit but not delete", async ({ page }) => {
		await page.goto("/settings/roles");

		await expect(page.locator("[data-role-capability='guest-comment']")).toBeVisible();
		await expect(page.locator("[data-role-capability='guest-edit_doc']")).toHaveCount(0);
		await expect(page.locator("[data-role-capability='member-edit_doc']")).toBeVisible();
		await expect(page.locator("[data-role-capability='member-delete_doc']")).toHaveCount(0);
	});

	test("inheritance is documented on each role card", async ({ page }) => {
		await page.goto("/settings/roles");

		await expect(page.locator("[data-role-inherits='owner']")).toContainText("Admin");
		await expect(page.locator("[data-role-inherits='owner']")).toContainText("Member");
		await expect(page.locator("[data-role-inherits='admin']")).toContainText("Member");
		await expect(page.locator("[data-role-inherits='guest']")).toHaveCount(0);
	});

	test("permission matrix shows scope and role grants", async ({ page }) => {
		await page.goto("/settings/roles");

		await expect(page.locator("[data-permission-matrix]")).toBeVisible();
		await expect(page.locator("[data-matrix-scope='delete_workspace']")).toContainText("workspace");
		await expect(page.locator("[data-matrix-cell='delete_workspace-owner']")).toContainText("✓");
		await expect(page.locator("[data-matrix-cell='delete_workspace-admin']")).toHaveText("");
	});

	test("download button is present for printable reference", async ({ page }) => {
		await page.goto("/settings/roles");

		await expect(page.locator("[data-download-matrix]")).toBeVisible();
	});
});
