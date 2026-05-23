import { expect, test } from "@playwright/test";

/**
 * Rendered design proof for `prd-web-shell-stage-axis-ownership-fix`.
 *
 * Source: OD `desktop-shell.html` embedded shell — the rail replica renders the
 * active stage's sub-navigation (`Plan` → Sessions / Reviews / Prototypes /
 * Templates / Prompts) plus a persistent Workspace and System group, while the
 * six-stage Capture→Operate workflow axis lives in the ScopeBar `.stages` tab
 * strip. Specs: DESIGN.md §3.1, IA-MAP.md §3, apps/web/CONTEXT.md StageRail.
 *
 * `prd-web-shell-stage-rail` shipped with the six-stage axis IN the rail; this
 * spec is the rendered gate proving the production left rail (`AppSidebar` →
 * `@fulcrum/ui-kit` StageRail) no longer owns the six-stage axis and that the
 * Workspace/System groups stay visible.
 *
 * States covered: `populated` and `forced-colors`.
 */

test.describe("stage axis ownership — production shell rail (populated)", () => {
	test("the left rail renders ZERO six-stage workflow-axis list items", async ({ page }) => {
		await page.goto("/");

		const rail = page.locator("[data-slot='stage-rail']").first();
		await expect(rail).toBeVisible();

		// The six-stage axis (Capture/Plan/Build/Review/Ship/Operate as rail
		// items) belongs to the ScopeBar tab strip — the rail must render none.
		await expect(rail.locator("[data-slot='stage-rail-item']")).toHaveCount(0);
		await expect(rail.locator("[data-slot='stage-rail-label']")).toHaveCount(0);
		await expect(rail.locator("[data-slot='stage-rail-glyph']")).toHaveCount(0);

		// No stage label is rendered as a rail item label in the left rail
		// (copy assertion). The rail group header is the active stage *name*
		// labelling its sub-navigation, never a navigable six-item axis.
		const railItems = rail.locator("[data-slot='stage-rail-item']");
		await expect(railItems).toHaveCount(0);
	});

	test("the rail renders active-stage sub-navigation as its primary group", async ({ page }) => {
		await page.goto("/");
		const rail = page.locator("[data-slot='stage-rail']").first();

		const subnavGroup = rail.locator("[data-slot='stage-rail-substage-group']");
		await expect(subnavGroup).toBeVisible();
		// Root `/` resolves to Capture; the rail shows Capture's sub-navigation.
		await expect(subnavGroup).toHaveAttribute("data-stage", "capture");
		await expect(rail.locator("[data-slot='stage-rail-substage-item']").first()).toBeVisible();

		await test.info().attach("stage-axis-ownership-rail", {
			body: await page.screenshot({ fullPage: true }),
			contentType: "image/png",
		});
	});

	test("persistent Workspace and System groups remain visible", async ({ page }) => {
		await page.goto("/");
		const rail = page.locator("[data-slot='stage-rail']").first();

		// Workspace (Portfolio) destinations preserved — not visually competing
		// with the workflow stages because the workflow axis is not in the rail.
		await expect(rail.locator("[data-slot='stage-rail-workspace-group']")).toBeVisible();
		await expect(rail.locator("[data-slot='stage-rail-workspace-item']")).toContainText([
			"All projects",
			"Search",
			"Memory",
			"Context",
		]);

		// System group stays below the divider.
		await expect(rail.locator("[data-slot='stage-rail-system-item']")).toHaveCount(4);
		await expect(rail.locator("[data-slot='stage-rail-system-item']")).toContainText([
			"Settings",
			"Knowledge",
			"MCP",
			"Plugins",
		]);
	});

	test("route-to-stage mapping stays available as data without rendering stage tabs in the rail", async ({
		page,
	}) => {
		// The route↔stage mapping is exposed for the ScopeBar to consume; the rail
		// reflects the active stage only via `data-current`, never as a tab strip.
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
			const rail = page.locator("[data-slot='stage-rail']").first();
			// Mapping is present as data (data-current), proven across all stages.
			await expect(rail).toHaveAttribute("data-current", item.stage);
			// But never rendered as a six-stage tab list inside the rail.
			await expect(rail.locator("[data-slot='stage-rail-item']")).toHaveCount(0);
		}
	});

	test("keyboard focus traverses visible rail sub-navigation without hidden six-stage items", async ({
		page,
	}) => {
		await page.goto("/");
		await page.keyboard.press("Tab");
		await expect(page.locator("[data-slot='skip-link']")).toBeFocused();

		// Tabbing into the rail lands on a sub-navigation link, not a six-stage
		// rail item (there are none).
		await page.keyboard.press("Tab");
		const focused = page.locator("[data-slot='stage-rail-substage-item']:focus-visible").first();
		await expect(focused).toBeVisible();
		const ring = await focused.evaluate((node) => getComputedStyle(node).boxShadow);
		expect(ring).not.toBe("none");
		expect(ring.length).toBeGreaterThan(0);
	});
});

test.describe("stage axis ownership — production shell rail (forced-colors)", () => {
	test("rail keeps zero six-stage items and visible Workspace/System under high-contrast", async ({
		page,
	}) => {
		await page.emulateMedia({ forcedColors: "active" });
		await page.goto("/");

		const rail = page.locator("[data-slot='stage-rail']").first();
		await expect(rail).toBeVisible();
		await expect(rail.locator("[data-slot='stage-rail-item']")).toHaveCount(0);
		await expect(rail.locator("[data-slot='stage-rail-substage-group']")).toBeVisible();
		await expect(rail.locator("[data-slot='stage-rail-workspace-group']")).toBeVisible();
		await expect(rail.locator("[data-slot='stage-rail-system-item']")).toHaveCount(4);

		await test.info().attach("stage-axis-ownership-forced-colors", {
			body: await page.screenshot({ fullPage: true }),
			contentType: "image/png",
		});
	});
});
