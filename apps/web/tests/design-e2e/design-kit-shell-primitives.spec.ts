import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function openDesignKit(page: Page): Promise<void> {
	await page.goto("/design-kit");
	await expect(page.locator("[data-design-kit-ready='true']")).toBeVisible();
}

test.describe("ui-kit shell primitive fixtures", () => {
	test("stage-rail renders six stages, the System group, and toggles collapse", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='stage-rail']");
		await expect(section).toBeVisible();
		const rail = section.locator("[data-slot='stage-rail']");
		await expect(rail).toHaveAttribute("data-collapsed", "false");
		await expect(rail).toHaveAttribute("data-current", "build");

		const stages = section.locator("[data-slot='stage-rail-item']");
		await expect(stages).toHaveCount(6);
		for (const stage of ["capture", "plan", "build", "review", "ship", "operate"]) {
			await expect(
				section.locator(`[data-slot='stage-rail-item'][data-stage='${stage}']`),
			).toBeVisible();
		}
		await expect(
			section.locator("[data-slot='stage-rail-item'][data-stage='build']"),
		).toHaveAttribute("data-active", "true");
		await expect(section.locator("[data-slot='stage-rail-system-item']")).toHaveCount(4);

		await section.locator("[data-design-kit-rail-toggle]").click();
		await expect(rail).toHaveAttribute("data-collapsed", "true");

		await section.locator("[data-slot='stage-rail-item'][data-stage='plan']").click();
		await expect(rail).toHaveAttribute("data-current", "plan");
		await expect(section.locator("[data-design-kit-rail-state]")).toContainText("Stage: plan");
	});

	test("scope-bar renders chrome and switches the active stage tab", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='scope-bar']");
		const bar = section.locator("[data-slot='scope-bar']");
		await expect(bar).toHaveAttribute("data-scope-bar", "");
		await expect(bar).toHaveAttribute("data-active-stage", "plan");
		await expect(section.locator("[data-slot='scope-bar-brand']")).toContainText("Fulcrum");
		await expect(section.locator("[data-slot='scope-bar-tab']")).toHaveCount(6);
		await expect(section.locator("[data-slot='scope-bar-trace']")).toBeVisible();

		await section.locator("[data-slot='scope-bar-tab'][data-stage='ship']").click();
		await expect(bar).toHaveAttribute("data-active-stage", "ship");
		await expect(section.locator("[data-design-kit-scope-stage]")).toContainText(
			"Active stage: ship",
		);
	});

	test("status-footer renders segments, AI Assist trigger, and density modes", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='status-footer']");
		const footer = section.locator("[data-slot='status-footer']");
		await expect(footer).toHaveAttribute("data-footer-mode", "base");
		await expect(section.locator("[data-slot='status-footer-segment']")).toHaveCount(6);
		await expect(section.locator("[data-slot='status-footer-pill']")).toContainText("NORMAL");
		const aiAssist = section.locator("[data-slot='status-footer-ai-assist']");
		await expect(aiAssist).toBeVisible();
		await expect(aiAssist).toContainText("AI Assist");
		await expect(aiAssist).toHaveAttribute("aria-label", /AI Assist/);

		await section.locator("[data-design-kit-footer-mode='comfortable']").click();
		await expect(footer).toHaveAttribute("data-footer-mode", "comfortable");
		await expect(section.locator("[data-design-kit-footer-state]")).toContainText(
			"Footer mode: comfortable",
		);
	});

	test("acp-drawer opens the right overlay and the bottom sheet branch", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='acp-drawer']");
		await section.locator("[data-design-kit-acp-open='right']").click();
		const drawer = page.locator("[data-slot='acp-drawer']");
		await expect(drawer).toBeVisible();
		await expect(drawer).toHaveAttribute("data-open", "true");
		await expect(drawer).toHaveAttribute("data-side", "right");
		await expect(drawer.locator("[data-slot='acp-drawer-title']")).toContainText("AI Assist");
		await expect(drawer.locator("[data-slot='acp-drawer-scope']")).toContainText("Step 3/8");
		await page.keyboard.press("Escape");
		await expect(drawer).toBeHidden();

		await section.locator("[data-design-kit-acp-open='bottom']").click();
		const bottomDrawer = page.locator("[data-slot='acp-drawer']");
		await expect(bottomDrawer).toHaveAttribute("data-side", "bottom");
	});

	test("trace badge exposes §4.10 treatment, copy, and the right-click menu", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='trace-chip']");
		const badge = section.locator("[data-slot='trace-chip'][data-variant='badge']").first();
		await expect(badge).toBeVisible();
		await expect(badge.locator("[data-slot='trace-chip-prefix']")).toContainText("trace:");
		await expect(badge.locator("[data-slot='trace-chip-value']")).toContainText("4f3a1c9e…");
		await expect(badge).toHaveAttribute("data-menu-open", "false");

		// Keyboard-accessible copy of the full id.
		const copy = badge.locator("[data-slot='trace-chip-copy']");
		await copy.focus();
		await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
		await copy.press("Enter");
		const copied = await page.evaluate(() => navigator.clipboard.readText());
		expect(copied).toBe("4f3a1c9e2b7d8a6c5e1f0d3b9a7c2e4f");
		await expect(section.locator("[data-design-kit-trace-copied]")).toContainText(
			"4f3a1c9e2b7d8a6c5e1f0d3b9a7c2e4f",
		);

		// Right-click opens the §4.10 menu.
		await badge.click({ button: "right" });
		await expect(badge).toHaveAttribute("data-menu-open", "true");
		const menu = badge.locator("[data-slot='trace-chip-menu']");
		await expect(menu.locator("[data-slot='trace-chip-menu-audit']")).toBeVisible();
		await expect(menu.locator("[data-slot='trace-chip-menu-cli']")).toBeVisible();
		await menu.locator("[data-slot='trace-chip-menu-cli']").click();
		await expect(section.locator("[data-design-kit-trace-action]")).toContainText("cli");
	});
});
