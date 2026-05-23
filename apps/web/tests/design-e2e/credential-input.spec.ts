import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function openDesignKit(page: Page): Promise<void> {
	await page.goto("/design-kit");
	await expect(page.locator("[data-design-kit-ready='true']")).toBeVisible();
}

test.describe("ui-kit credential-input primitive", () => {
	test("masks by default, toggles visibility, re-masks on blur, accepts input", async ({
		page,
	}) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='credential-input']");
		await expect(section).toBeVisible();

		const defaultInput = section.locator("[data-design-kit-credential='default']");
		await expect(defaultInput).toHaveAttribute("type", "password");
		await expect(defaultInput).toHaveAttribute("autocomplete", "new-password");
		await expect(defaultInput).toHaveAttribute("data-visible", "false");

		await defaultInput.fill("sk_test_value_12345");
		await expect(defaultInput).toHaveValue("sk_test_value_12345");

		const toggle = section
			.locator("[data-design-kit-credential='default']")
			.locator("..")
			.locator("[data-slot='credential-input-toggle']");
		await expect(toggle).toHaveAttribute("aria-pressed", "false");
		await toggle.click();
		await expect(defaultInput).toHaveAttribute("type", "text");
		await expect(defaultInput).toHaveAttribute("data-visible", "true");
		await expect(toggle).toHaveAttribute("aria-pressed", "true");

		await defaultInput.focus();
		await defaultInput.blur();
		await expect(defaultInput).toHaveAttribute("type", "password");
		await expect(defaultInput).toHaveAttribute("data-visible", "false");
	});

	test("default-visible variant renders text type with toggle pressed", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='credential-input']");
		const visibleInput = section.locator("[data-design-kit-credential='visible']");
		await expect(visibleInput).toHaveAttribute("type", "text");
		await expect(visibleInput).toHaveAttribute("data-visible", "true");

		const toggle = visibleInput.locator("..").locator("[data-slot='credential-input-toggle']");
		await expect(toggle).toHaveAttribute("aria-pressed", "true");
	});

	test("error variant carries aria-invalid and shows description", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='credential-input']");
		const errorInput = section.locator("[data-design-kit-credential='error']");
		await expect(errorInput).toHaveAttribute("aria-invalid", "true");
		await expect(section.locator("[data-design-kit-credential-error]")).toBeVisible();
	});
});
