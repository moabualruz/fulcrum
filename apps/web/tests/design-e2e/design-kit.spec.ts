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
});
