import { expect, test } from "@playwright/test";

/**
 * Rendered design proof for the OD StageRail in the production web shell
 * (`apps/web/src/routes/+layout.svelte` → `AppSidebar` → `@fulcrum/ui-kit`
 * StageRail). Source: `desktop-shell.html` / `index.html`, DESIGN.md §3.1,
 * IA-MAP.md §3.
 *
 * States covered: `populated` (the default rail with stages/workspace/system)
 * and `forced-colors` (Windows high-contrast emulation).
 */

test.describe("OD shell StageRail — populated", () => {
	test("renders the 220px workflow rail with stage, workspace, and system groups", async ({
		page,
	}) => {
		await page.goto("/");

		const rail = page.locator("[data-slot='stage-rail']").first();
		await expect(rail).toBeVisible();
		await expect(rail).toHaveAttribute("data-collapsed", "false");

		// Expanded rail is exactly 220px wide (DESIGN.md §3.1).
		const box = await rail.boundingBox();
		expect(Math.round(box?.width ?? 0)).toBe(220);

		// Six WorkflowStages in canonical Capture→Operate order.
		await expect(rail.locator("[data-slot='stage-rail-item']")).toHaveCount(6);
		await expect(rail.locator("[data-slot='stage-rail-label']")).toHaveText([
			"Capture",
			"Plan",
			"Build",
			"Review",
			"Ship",
			"Operate",
		]);

		// Active stage carries data-active + aria-current; root `/` is Capture.
		const activeStage = rail.locator("[data-slot='stage-rail-item'][data-active='true']");
		await expect(activeStage).toHaveAttribute("aria-current", "page");
		await expect(activeStage).toHaveAttribute("data-stage", "capture");

		// Persistent Workspace (Portfolio) group — destinations preserved by the migration.
		await expect(rail.locator("[data-slot='stage-rail-workspace-group']")).toBeVisible();
		await expect(rail.locator("[data-slot='stage-rail-workspace-item']")).toContainText([
			"All projects",
			"Search",
			"Memory",
			"Context",
		]);

		// System group below the divider — Settings · Knowledge · MCP · Plugins.
		await expect(rail.locator("[data-slot='stage-rail-system-item']")).toContainText([
			"Settings",
			"Knowledge",
			"MCP",
			"Plugins",
		]);

		await test.info().attach("shell-stage-rail-expanded", {
			body: await page.screenshot({ fullPage: true }),
			contentType: "image/png",
		});
	});

	test("keyboard focus reaches the rail with a visible focus-visible ring", async ({ page }) => {
		await page.goto("/");

		// First Tab lands on the skip link (rendered first in <body>).
		await page.keyboard.press("Tab");
		const skipLink = page.locator("[data-slot='skip-link']");
		await expect(skipLink).toBeFocused();

		// Next Tab steps into the StageRail; the focused stage shows a visible
		// focus-visible ring (a box-shadow ring using the border-focus token).
		await page.keyboard.press("Tab");
		const focusedStage = page.locator("[data-slot='stage-rail-item']:focus-visible").first();
		await expect(focusedStage).toBeVisible();
		const focusRing = await focusedStage.evaluate(
			(node) => getComputedStyle(node).boxShadow,
		);
		expect(focusRing).not.toBe("none");
		expect(focusRing.length).toBeGreaterThan(0);

		// Focus traverses stages in declared order.
		await expect(focusedStage).toHaveAttribute("data-stage", "capture");
		await page.keyboard.press("Tab");
		const nextStage = page.locator("[data-slot='stage-rail-item']:focus-visible").first();
		await expect(nextStage).toHaveAttribute("data-stage", "plan");
	});

	test("maps existing routes to an explicit active workflow stage", async ({ page }) => {
		const cases = [
			{ path: "/", stage: "capture" },
			{ path: "/planning", stage: "plan" },
			{ path: "/build-runs", stage: "build" },
			{ path: "/review-search", stage: "review" },
			{ path: "/ship-archive", stage: "ship" },
			{ path: "/operate-mcp", stage: "operate" },
		];

		for (const item of cases) {
			await page.goto(item.path);
			const activeStage = page
				.locator("[data-slot='stage-rail-item'][data-active='true']")
				.first();
			await expect(activeStage).toHaveAttribute("data-stage", item.stage);
			await expect(activeStage).toHaveAttribute("aria-current", "page");
		}
	});
});

test.describe("OD shell StageRail — forced-colors", () => {
	test("stays operable under Windows high-contrast emulation", async ({ page }) => {
		await page.emulateMedia({ forcedColors: "active" });
		await page.goto("/");

		const rail = page.locator("[data-slot='stage-rail']").first();
		await expect(rail).toBeVisible();
		await expect(rail.locator("[data-slot='stage-rail-item']")).toHaveCount(6);

		// The active stage remains identifiable via aria-current — not colour alone.
		const activeStage = rail.locator("[data-slot='stage-rail-item'][data-active='true']");
		await expect(activeStage).toHaveAttribute("aria-current", "page");

		await test.info().attach("shell-stage-rail-forced-colors", {
			body: await page.screenshot({ fullPage: true }),
			contentType: "image/png",
		});
	});
});
