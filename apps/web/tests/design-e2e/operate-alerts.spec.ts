import { expect, test } from "@playwright/test";

test.describe("operate alerts session management", () => {
	test("lists active login sessions with device, browser, IP, last active", async ({ page }) => {
		await page.goto("/operate-alerts");

		await expect(page.locator("[data-operate-alerts-header]")).toContainText("Login sessions");
		await expect(page.locator("[data-operate-alerts-count]")).toContainText("4 active sessions");
		await expect(page.locator("[data-operate-alerts-table]")).toBeVisible();
		await expect(page.locator("[data-session-row='ses_current_macbook']")).toBeVisible();
		await expect(page.locator("[data-session-row='ses_remote_iphone']")).toContainText("mobile");
		await expect(page.locator("[data-session-row='ses_remote_iphone']")).toContainText("Safari");
		await expect(page.locator("[data-session-row='ses_remote_iphone']")).toContainText("100.64.7.0");
	});

	test("marks current session and blocks revoke action", async ({ page }) => {
		await page.goto("/operate-alerts");

		await expect(page.locator("[data-current-session='ses_current_macbook']")).toBeVisible();
		const currentRevoke = page.locator("[data-revoke-current-blocked='ses_current_macbook']");
		await expect(currentRevoke).toBeDisabled();
		await expect(page.locator("[data-revoke-session='ses_current_macbook']")).toHaveCount(0);
	});

	test("revoke flow requires confirmation, removes session, and writes audit entry", async ({ page }) => {
		await page.goto("/operate-alerts");

		await page.locator("[data-revoke-session='ses_remote_iphone']").click();
		const dialog = page.locator("[data-revoke-confirm]");
		await expect(dialog).toBeVisible();
		await expect(dialog).toHaveAttribute("role", "alertdialog");
		await expect(dialog).toContainText("ses_remote_iphone");

		await page.locator("[data-revoke-confirm-yes]").click();
		await expect(page.locator("[data-session-row='ses_remote_iphone']")).toHaveCount(0);
		await expect(page.locator("[data-operate-alerts-count]")).toContainText("3 active sessions");
		await expect(page.locator("[data-audit-entry='0']")).toContainText("revoked ses_remote_iphone");
		await expect(page.locator("[data-audit-entry='0']")).toContainText("mobile/Safari");
	});

	test("cancel confirmation keeps the session intact", async ({ page }) => {
		await page.goto("/operate-alerts");

		await page.locator("[data-revoke-session='ses_remote_ipad']").click();
		await page.locator("[data-revoke-confirm-cancel]").click();
		await expect(page.locator("[data-revoke-confirm]")).toHaveCount(0);
		await expect(page.locator("[data-session-row='ses_remote_ipad']")).toBeVisible();
	});

	test("bulk revoke removes all non-current sessions and writes one audit entry per session", async ({ page }) => {
		await page.goto("/operate-alerts");

		await page.locator("[data-revoke-other-sessions]").click();
		await expect(page.locator("[data-operate-alerts-count]")).toContainText("1 active session");
		await expect(page.locator("[data-session-row='ses_current_macbook']")).toBeVisible();
		await expect(page.locator("[data-session-row='ses_remote_iphone']")).toHaveCount(0);
		await expect(page.locator("[data-audit-entry]")).toHaveCount(3);
		await expect(page.locator("[data-revoke-other-sessions]")).toBeDisabled();
	});
});
