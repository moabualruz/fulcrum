import { expect, test } from "@playwright/test";

test.describe("/settings/ai-assist", () => {
	test("renders resolution badges + form controls for AI Assist settings", async ({ page }) => {
		await page.goto("/settings/ai-assist");
		const root = page.locator("[data-settings-ai-assist]");
		await expect(root).toBeVisible();

		// Resolution dl exposes one entry per setting key with a source badge.
		for (const key of ["checkpointMode", "retentionCount", "retentionDays", "eventsTransport"]) {
			const cell = root.locator(`[data-resolved-key="${key}"]`);
			await expect(cell).toBeVisible();
			await expect(cell).toHaveAttribute("data-resolved-source", /^(session|user|org|default)$/);
		}

		// Form controls render with the four fields the resolver knows about.
		for (const field of ["checkpointMode", "retentionCount", "retentionDays", "eventsTransport"]) {
			await expect(root.locator(`[data-field="${field}"]`)).toBeVisible();
		}

		// Scope radio + save button present.
		await expect(root.locator("[data-scope-user]")).toBeVisible();
		await expect(root.locator("[data-scope-org]")).toBeVisible();
		await expect(root.locator("[data-save-ai-assist]")).toBeVisible();
	});
});
