import { expect, test } from "@playwright/test";

/**
 * Rendered design proof for the OD StageRail in the production web shell
 * (`apps/web/src/routes/+layout.svelte` → `AppSidebar` → `@fulcrum/ui-kit`
 * StageRail). Source: `desktop-shell.html` / `index.html`, DESIGN.md §3.1,
 * IA-MAP.md §3.
 *
 * Axis ownership (`prd-web-shell-stage-axis-ownership-fix`): the OD
 * `desktop-shell.html` rail replica renders the *active stage's
 * sub-navigation* (`Plan` → Sessions / Reviews / Prototypes / Templates /
 * Prompts) plus a persistent Workspace and System group — NOT the six-stage
 * Capture→Operate axis. That workflow axis is owned by the ScopeBar tab strip.
 * These specs prove the rail carries zero six-stage list items.
 *
 * States covered: `populated` (the rail with sub-nav/workspace/system) and
 * `forced-colors` (Windows high-contrast emulation).
 */

test.describe("OD shell StageRail — populated", () => {
	test("renders the 220px rail with active-stage sub-nav, workspace, and system groups", async ({
		page,
	}) => {
		await page.goto("/");

		const rail = page.locator("[data-slot='stage-rail']").first();
		await expect(rail).toBeVisible();
		await expect(rail).toHaveAttribute("data-collapsed", "false");

		// Expanded rail is exactly 220px wide (DESIGN.md §3.1).
		const box = await rail.boundingBox();
		expect(Math.round(box?.width ?? 0)).toBe(220);

		// The rail does NOT render the six-stage workflow axis — that is the
		// ScopeBar tab strip's job. Zero six-stage list items.
		await expect(rail.locator("[data-slot='stage-rail-item']")).toHaveCount(0);
		await expect(rail.locator("[data-slot='stage-rail-label']")).toHaveCount(0);

		// The rail's primary group is the active stage's sub-navigation. Root `/`
		// is the Capture stage, so the group header reads the active stage name.
		const subnavGroup = rail.locator("[data-slot='stage-rail-substage-group']");
		await expect(subnavGroup).toBeVisible();
		await expect(subnavGroup).toHaveAttribute("data-stage", "capture");
		await expect(rail.locator("[data-slot='stage-rail-substage-item']").first()).toBeVisible();

		// data-current keeps the rail synced to the active stage (data for the
		// ScopeBar tab strip).
		await expect(rail).toHaveAttribute("data-current", "capture");

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

		// Next Tab steps into the StageRail sub-navigation; the focused link shows
		// a visible focus-visible ring (a box-shadow ring using the ring token).
		await page.keyboard.press("Tab");
		const focusedItem = page
			.locator("[data-slot='stage-rail-substage-item']:focus-visible")
			.first();
		await expect(focusedItem).toBeVisible();
		const focusRing = await focusedItem.evaluate((node) => getComputedStyle(node).boxShadow);
		expect(focusRing).not.toBe("none");
		expect(focusRing.length).toBeGreaterThan(0);
	});

	test("rail sub-navigation changes with the active workflow stage", async ({ page }) => {
		// The route→stage mapping stays available as data; the rail consumes it to
		// pick the right sub-nav, but never renders the six-stage axis itself.
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
			await expect(rail).toHaveAttribute("data-current", item.stage);
			// Still no six-stage rail list on any route.
			await expect(rail.locator("[data-slot='stage-rail-item']")).toHaveCount(0);
			// The sub-nav group header tracks the active stage.
			await expect(rail.locator("[data-slot='stage-rail-substage-group']")).toHaveAttribute(
				"data-stage",
				item.stage,
			);
		}
	});
});

test.describe("OD shell StageRail — forced-colors", () => {
	test("stays operable under Windows high-contrast emulation", async ({ page }) => {
		await page.emulateMedia({ forcedColors: "active" });
		await page.goto("/");

		const rail = page.locator("[data-slot='stage-rail']").first();
		await expect(rail).toBeVisible();
		// No six-stage rail list, and the Workspace + System groups remain visible.
		await expect(rail.locator("[data-slot='stage-rail-item']")).toHaveCount(0);
		await expect(rail.locator("[data-slot='stage-rail-substage-group']")).toBeVisible();
		await expect(rail.locator("[data-slot='stage-rail-workspace-group']")).toBeVisible();
		await expect(rail.locator("[data-slot='stage-rail-system-item']")).toHaveCount(4);

		await test.info().attach("shell-stage-rail-forced-colors", {
			body: await page.screenshot({ fullPage: true }),
			contentType: "image/png",
		});
	});
});

test.describe("OD shell ScopeBar — populated", () => {
	test("renders the 48px ScopeBar with brand, workspace, stage tabs, trace, and system icons", async ({
		page,
	}) => {
		await page.goto("/");

		const scopeBar = page.locator("[data-slot='scope-bar']").first();
		await expect(scopeBar).toBeVisible();
		await expect(scopeBar).toHaveAttribute("data-scope-bar", "");
		await expect(scopeBar).toHaveAttribute("data-active-stage", "capture");

		const box = await scopeBar.boundingBox();
		expect(Math.round(box?.height ?? 0)).toBe(48);

		await expect(scopeBar.locator("[data-slot='scope-bar-brand']")).toContainText("Fulcrum");
		await expect(scopeBar.locator("[data-slot='scope-bar-workspace']")).toContainText(
			"mkh / all-projects",
		);

		const tabs = scopeBar.locator("[data-slot='scope-bar-tab']");
		await expect(tabs).toHaveCount(6);
		await expect(tabs).toHaveText(["Capture", "Plan", "Build", "Review", "Ship", "Operate"]);

		const trace = scopeBar.locator("[data-slot='trace-chip'][data-variant='badge']").first();
		await expect(trace).toBeVisible();
		await expect(trace.locator("[data-slot='trace-chip-prefix']")).toHaveText("trace:");

		for (const label of [
			"Command palette · ⌘K",
			"Notifications · 0 unread",
			"Display, density, mode, theme",
			"Keyboard shortcuts · ?",
			"Account · sign out, switch workspace",
		]) {
			const icon = scopeBar.locator(`button[aria-label="${label}"]`).first();
			await expect(icon).toBeVisible();
			await expect(icon).toHaveAttribute("aria-expanded", "false");
		}

		await expect(scopeBar.locator("[data-density-switch]")).toHaveAttribute(
			"data-density-mode",
			"cozy",
		);
		await expect(scopeBar.locator("[data-density-option]")).toHaveText([
			"Compact",
			"Cozy",
			"Comfortable",
		]);

		await test.info().attach("shell-scope-bar", {
			body: await page.screenshot({ fullPage: true }),
			contentType: "image/png",
		});
	});

	test("maps existing routes to the active ScopeBar stage tab", async ({ page }) => {
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
			const activeTab = page
				.locator("[data-slot='scope-bar-tab'][data-active='true']")
				.first();
			await expect(activeTab).toHaveAttribute("data-stage", item.stage);
			await expect(activeTab).toHaveAttribute("aria-current", "page");
		}
	});
});
