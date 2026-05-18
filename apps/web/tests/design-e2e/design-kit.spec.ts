import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function openDesignKit(page: Page): Promise<void> {
	await page.goto("/design-kit");
	await expect(page.locator("[data-design-kit-ready='true']")).toBeVisible();
}

test.describe("ui-kit form primitives reference", () => {
	test("label exposes required and optional treatments without breaking access", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='label']");
		await expect(section).toBeVisible();
		const required = section.locator("[data-slot='label'][data-required='true']");
		const optional = section.locator("[data-slot='label'][data-optional='true']");
		const plain = section
			.locator("[data-slot='label']")
			.filter({ hasNotText: "(optional)" })
			.filter({ hasText: "Display" });
		await expect(required).toBeVisible();
		await expect(required.locator("span.sr-only")).toContainText("required");
		await expect(optional).toBeVisible();
		await expect(optional).toContainText("(optional)");
		await expect(plain).toBeVisible();
	});

	test("checkbox toggles, exposes indeterminate state, and disables cleanly", async ({ page }) => {
		await openDesignKit(page);
		const checkboxes = page.locator("[data-slot='checkbox']");
		await expect(checkboxes).toHaveCount(4);

		const first = checkboxes.nth(0);
		await expect(first).toHaveAttribute("data-state", "unchecked");
		await first.click();
		await expect(first).toHaveAttribute("data-state", "checked");

		const indeterminate = checkboxes.nth(2);
		await expect(indeterminate).toHaveAttribute("data-state", "indeterminate");

		const disabled = checkboxes.nth(3);
		await expect(disabled).toBeDisabled();
	});

	test("radio group selects exclusive options and updates the live indicator", async ({ page }) => {
		await openDesignKit(page);
		const group = page.locator("[data-design-kit-radio-group]");
		await expect(group).toHaveAttribute("role", "radiogroup");
		const items = group.locator("[data-slot='radio-group-item']");
		await expect(items).toHaveCount(3);
		await expect(items.nth(0)).toHaveAttribute("data-state", "checked");
		await items.nth(1).click();
		await expect(items.nth(0)).toHaveAttribute("data-state", "unchecked");
		await expect(items.nth(1)).toHaveAttribute("data-state", "checked");
		await expect(page.locator("[data-design-kit-radio-value]")).toContainText("weekly");
	});

	test("badge renders six tonal variants and two extra sizes", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='badge']");
		const badges = section.locator("[data-slot='badge']");
		await expect(badges).toHaveCount(8);
		await expect(section.locator("[data-slot='badge'][data-variant='accent']")).toHaveCount(1);
		await expect(section.locator("[data-slot='badge'][data-variant='outline']")).toHaveCount(1);
		await expect(section.locator("[data-slot='badge'][data-size='sm']")).toBeVisible();
		await expect(section.locator("[data-slot='badge'][data-size='lg']")).toBeVisible();
	});

	test("status-badge covers the full workflow vocabulary with ARIA + glyphs", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='status-badge']");
		const badges = section.locator("[data-slot='status-badge']");
		await expect(badges).toHaveCount(9);
		const statuses = [
			"queued",
			"running",
			"waiting-input",
			"paused",
			"completed",
			"failed",
			"blocked",
			"cancelled",
			"scheduled",
		];
		for (const status of statuses) {
			const badge = section.locator(`[data-slot='status-badge'][data-status='${status}']`);
			await expect(badge).toBeVisible();
			await expect(badge).toHaveAttribute("role", "status");
			await expect(badge.locator(`[data-status-glyph='${status}']`)).toBeVisible();
		}
	});

	test("avatar exposes sized fallbacks and renders fallback for missing image", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='avatar']");
		const avatars = section.locator("[data-slot='avatar']");
		await expect(avatars).toHaveCount(6);
		await expect(section.locator("[data-slot='avatar'][data-size='xs']")).toHaveCount(1);
		await expect(section.locator("[data-slot='avatar'][data-size='md']")).toHaveCount(2);
		await expect(section.locator("[data-slot='avatar-fallback']").nth(0)).toBeVisible();
	});

	test("chip removes itself when the remove control fires", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='chip']");
		await expect(section.locator("[data-slot='chip']")).toHaveCount(6);
		const removable = section.locator("[data-slot='chip'][data-removable='true']");
		await expect(removable).toBeVisible();
		await removable.locator("[data-slot='chip-remove']").click();
		await expect(removable).toHaveCount(0);
		await expect(section.locator("[data-design-kit-chip-removed]")).toBeVisible();
	});

	test("kbd renders monospace key hints", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='kbd']");
		await expect(section.locator("[data-slot='kbd']")).toHaveCount(5);
		await expect(section).toContainText("⌘");
	});

	test("progress updates aria-valuenow and increments via the +10 control", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='progress']");
		const progress = section.locator("[data-design-kit-progress]");
		await expect(progress).toHaveAttribute("aria-valuenow", "42");
		await section.locator("[data-design-kit-progress-step]").click();
		await expect(progress).toHaveAttribute("aria-valuenow", "52");
		await expect(section.locator("[data-design-kit-progress-value]")).toContainText("52%");
	});

	test("skeleton renders text/rect/circle shapes with role=status", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='skeleton']");
		await expect(section.locator("[data-slot='skeleton'][data-shape='text']")).toBeVisible();
		await expect(section.locator("[data-slot='skeleton'][data-shape='rect']")).toBeVisible();
		await expect(section.locator("[data-slot='skeleton'][data-shape='circle']")).toBeVisible();
		await expect(section.locator("[data-slot='skeleton-line']")).toHaveCount(3);
	});

	test("select opens, selects an option, and reflects the value", async ({ page }) => {
		await openDesignKit(page);
		const trigger = page.locator("[data-design-kit-select-trigger]");
		await expect(trigger).toBeVisible();
		await trigger.click();
		const items = page.locator("[data-slot='select-item']");
		await expect(items).toHaveCount(4);
		await items.filter({ hasText: "P1" }).click();
		await expect(trigger).toContainText("P1");
		await expect(page.locator("[data-design-kit-select-value]")).toContainText("p1");
	});

	test("alert renders five tones with role and glyph", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='alert']");
		await expect(section.locator("[data-slot='alert']")).toHaveCount(5);
		await expect(section.locator("[data-slot='alert'][data-tone='warning']")).toHaveAttribute(
			"role",
			"alert",
		);
		await expect(section.locator("[data-slot='alert'][data-tone='info']")).toHaveAttribute(
			"role",
			"status",
		);
		await expect(section.locator("[data-slot='alert-icon']")).toHaveCount(5);
	});

	test("banner can be dismissed and announces the dismissed state", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='banner']");
		const banner = section.locator("[data-slot='banner']");
		await expect(banner).toBeVisible();
		await expect(banner).toHaveAttribute("role", "alert");
		await banner.locator("[data-slot='banner-dismiss']").click();
		await expect(banner).toHaveCount(0);
		await expect(section.locator("[data-design-kit-banner-dismissed]")).toBeVisible();
	});

	test("empty-state exposes title, description, icon, and an action slot", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='empty-state']");
		const root = section.locator("[data-slot='empty-state']");
		await expect(root).toBeVisible();
		await expect(root).toHaveAttribute("role", "status");
		await expect(root.locator("[data-slot='empty-state-title']")).toContainText("No tasks yet");
		await expect(root.locator("[data-slot='empty-state-icon']")).toBeVisible();
		await expect(section.locator("[data-design-kit-empty-action]")).toBeVisible();
	});

	test("toast publishes into the region with correct tone and dismiss control", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='toast']");
		await section.locator("[data-design-kit-toast-publish='success']").click();
		await section.locator("[data-design-kit-toast-publish='error']").click();
		const region = page.locator("[data-slot='toast-region']");
		await expect(region).toBeVisible();
		await expect(region.locator("[data-slot='toast']")).toHaveCount(2);
		await expect(region.locator("[data-slot='toast'][data-tone='success']")).toBeVisible();
		await expect(region.locator("[data-slot='toast'][data-tone='error']")).toBeVisible();
		await expect(
			region.locator("[data-slot='toast'][data-tone='error'] [data-slot='toast-dismiss']"),
		).toHaveAttribute("aria-label", "Dismiss notification");
		await expect(section.locator("[data-design-kit-toast-count]")).toContainText("Active: 2");
	});
});
