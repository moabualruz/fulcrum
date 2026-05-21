import { expect, test } from "@playwright/test";

/**
 * Design-e2e fidelity coverage for the OD `operate-plugins.html` surface — the
 * Operate · Plugins view (DESIGN.md §11 item 9 per-agent scope, §8.1 mode
 * affordances, IA-MAP.md §2.6 Operate routes, CLI-TUI-UX.md §1.6 plugin verbs).
 *
 * The route renders the OD `page`: head (count + Install plugin), the
 * explanatory per-agent paragraph, the per-agent scope `seg-group` selector
 * with the `Install across all agents (coming soon)` ghost button, the filter
 * `chip` row (All / Enabled / Disabled / Updates available / By me), the
 * `plg-grid` of plugin cards (icon, name, version+source, description,
 * tag-pills, last-sync footer, on/off Switch toggle, compact mode-row), and the
 * `data-empty-for="plugins"` empty state. The live `operate-plugins` route
 * folder is the migration alias for the canonical
 * `/<ws>/projects/<projId>/operate/plugins`.
 */

test.describe("operate-plugins per-agent management", () => {
	test("head renders the count and the Install plugin action", async ({ page }) => {
		await page.goto("/operate-plugins");

		await expect(page.locator("[data-operate-plugins-header]")).toContainText("Plugins");
		await expect(page.locator("[data-plugins-count]")).toContainText("7 installed");
		await expect(page.locator("[data-plugins-count]")).toContainText("6 enabled");
		await expect(page.locator("[data-plugins-count]")).toContainText("1 update");
		await expect(page.locator("[data-plugins-count]")).toContainText(
			"scoped to Claude Opus 4.7",
		);
		await expect(page.locator("[data-plugins-install]")).toContainText("Install plugin");
	});

	test("per-agent scope selector lists seven CLI agents with an install-across action", async ({
		page,
	}) => {
		await page.goto("/operate-plugins");

		const group = page.locator("[data-plugins-scope-group]");
		await expect(group).toHaveAttribute("role", "radiogroup");
		await expect(group.locator("[role='radio']")).toHaveCount(7);
		await expect(page.locator("[data-plugins-scope-option='claude-opus']")).toHaveAttribute(
			"aria-checked",
			"true",
		);
		await expect(page.locator("[data-plugins-scope-option='codex']")).toContainText("Codex");

		// `Install across all agents` ships disabled — `plugins.cross_agent` flag.
		const across = page.locator("[data-plugins-install-across]");
		await expect(across).toContainText("Install across all agents (coming soon)");
		await expect(across).toBeDisabled();
	});

	test("the intro paragraph carries the per-agent ownership + safety copy", async ({ page }) => {
		await page.goto("/operate-plugins");

		const intro = page.locator("[data-plugins-intro]");
		await expect(intro).toContainText("per CLI agent");
		await expect(intro).toContainText("Disabling a plugin keeps its files on disk");
		await expect(intro).toContainText("uninstall removes them");
	});

	test("scope-chip selection switches the plugin list per agent", async ({ page }) => {
		await page.goto("/operate-plugins");

		// Claude Opus 4.7 — seven plugins.
		await expect(page.locator("[data-plugin-card]")).toHaveCount(7);

		// Switch to OpenCode — a single plugin with an available update.
		await page.locator("[data-plugins-scope-option='opencode']").click();
		await expect(page.locator("[data-plugins-scope-option='opencode']")).toHaveAttribute(
			"aria-checked",
			"true",
		);
		await expect(page.locator("[data-plugin-card]")).toHaveCount(1);
		await expect(page.locator("[data-plugins-count]")).toContainText("scoped to OpenCode");

		// Switch to Gemini 3 — no plugins, the empty state renders.
		await page.locator("[data-plugins-scope-option='gemini']").click();
		await expect(page.locator("[data-plugin-card]")).toHaveCount(0);
		await expect(page.locator("[data-operate-plugins]")).toHaveAttribute("data-state", "empty");
	});

	test("filter chips narrow the grid by enabled / disabled / updates / by-me", async ({
		page,
	}) => {
		await page.goto("/operate-plugins");

		const filters = page.locator("[data-plugins-filters] [data-plugins-filter]");
		await expect(filters).toHaveCount(5);
		await expect(page.locator("[data-plugins-filter='all']")).toHaveAttribute(
			"data-active",
			"true",
		);

		// Disabled — only the disabled `huashu-design` card.
		await page.locator("[data-plugins-filter='disabled']").click();
		await expect(page.locator("[data-plugin-card]")).toHaveCount(1);
		await expect(page.locator("[data-plugin-card='huashu-design']")).toBeVisible();

		// Updates available — only `compound-engineering`.
		await page.locator("[data-plugins-filter='updates']").click();
		await expect(page.locator("[data-plugin-card]")).toHaveCount(1);
		await expect(page.locator("[data-plugin-card='compound-engineering']")).toBeVisible();

		// Enabled — six of the seven.
		await page.locator("[data-plugins-filter='enabled']").click();
		await expect(page.locator("[data-plugin-card]")).toHaveCount(6);
	});

	test("a plugin card shows icon, version+source, description, tags, and last-sync", async ({
		page,
	}) => {
		await page.goto("/operate-plugins");

		const card = page.locator("[data-plugin-card='caveman']");
		await expect(card.locator("[data-plugin-name='caveman']")).toHaveText("caveman");
		await expect(card.locator("[data-plugin-version='caveman']")).toContainText("v0.4.2");
		await expect(card.locator("[data-plugin-version='caveman']")).toContainText("npm");
		await expect(card.locator("[data-plugin-desc='caveman']")).toContainText(
			"Ultra-compressed communication mode",
		);
		await expect(card.locator("[data-plugin-tags='caveman'] [data-plugin-tag]")).toHaveCount(2);
		await expect(card.locator("[data-plugin-last-sync='caveman']")).toContainText("last sync");
	});

	test("a disabled card dims its icon and reports data-enabled=false", async ({ page }) => {
		await page.goto("/operate-plugins");

		const disabled = page.locator("[data-plugin-card='huashu-design']");
		await expect(disabled).toHaveAttribute("data-enabled", "false");
		await expect(disabled.locator("[data-plugin-icon='huashu-design']")).toHaveClass(
			/opacity-50/,
		);

		const enabled = page.locator("[data-plugin-card='caveman']");
		await expect(enabled).toHaveAttribute("data-enabled", "true");
	});

	test("the on/off toggle enables/disables a plugin without removing the card", async ({
		page,
	}) => {
		await page.goto("/operate-plugins");

		const card = page.locator("[data-plugin-card='caveman']");
		await expect(card).toHaveAttribute("data-enabled", "true");

		// Toggling off keeps the card on disk — only the enabled flag flips.
		await card.locator("[data-plugin-toggle='caveman']").click();
		await expect(card).toHaveAttribute("data-enabled", "false");
		await expect(page.locator("[data-plugin-card='caveman']")).toHaveCount(1);
		await expect(card.locator("[data-plugin-last-sync='caveman']")).toContainText(
			"disabled just now",
		);

		// Toggling back on restores the enabled state.
		await card.locator("[data-plugin-toggle='caveman']").click();
		await expect(card).toHaveAttribute("data-enabled", "true");
	});

	test("an update-available card exposes an Update action that clears the badge", async ({
		page,
	}) => {
		await page.goto("/operate-plugins");

		const card = page.locator("[data-plugin-card='compound-engineering']");
		await expect(card.locator("[data-plugin-last-sync='compound-engineering']")).toContainText(
			"update available · v2.1.5",
		);
		const updateButton = card.locator("[data-plugin-update='compound-engineering']");
		await expect(updateButton).toContainText("Update to v2.1.5");

		await updateButton.click();
		await expect(card.locator("[data-plugin-version='compound-engineering']")).toContainText(
			"v2.1.5",
		);
		await expect(card.locator("[data-plugin-update='compound-engineering']")).toHaveCount(0);
	});

	test("each plugin card carries the universal compact mode-row", async ({ page }) => {
		await page.goto("/operate-plugins");

		const modeRow = page.locator("[data-plugin-mode-row='caveman']");
		await expect(modeRow).toBeVisible();
		await expect(modeRow).toHaveAttribute("role", "toolbar");
		await expect(modeRow).toHaveAttribute("data-density", "compact");
		await expect(modeRow).toHaveAttribute("aria-label", "Step modes");
		await expect(modeRow.locator("[data-slot='mode-row-option']")).toHaveCount(4);

		// Selecting a mode updates the row's data-value (DESIGN.md §4.13).
		await modeRow.locator("[data-mode='play']").click();
		await expect(modeRow).toHaveAttribute("data-value", "play");
	});

	test("the empty state matches the OD data-empty-for=plugins block", async ({ page }) => {
		await page.goto("/operate-plugins");

		// Gemini 3 has no plugins — the empty state is the OD copy.
		await page.locator("[data-plugins-scope-option='gemini']").click();
		const empty = page.locator("[data-plugins-empty] [data-slot='empty-state']");
		await expect(empty).toBeVisible();
		await expect(empty).toContainText("No plugins installed.");
		await expect(empty).toContainText(
			"Plugins extend Fulcrum with new commands, palette entries, and step modes.",
		);
		await expect(page.locator("[data-plugins-empty-install]")).toContainText("Install plugin");
		await expect(page.locator("[data-plugins-empty-registry]")).toContainText("Browse registry");
	});

	test("error state renders the OD sync-failure banner with a trace id", async ({ page }) => {
		await page.goto("/operate-plugins?state=error");

		await expect(page.locator("[data-operate-plugins]")).toHaveAttribute("data-state", "error");
		const banner = page.locator("[data-plugins-sync-error]");
		await expect(banner).toBeVisible();
		await expect(banner).toHaveAttribute("data-slot", "error-banner");
		await expect(banner).toHaveAttribute("role", "alert");
		await expect(banner).toContainText("Plugin sync failed for Claude Opus 4.7");
		await expect(banner.locator("[data-slot='error-banner-retry']")).toContainText("Re-sync");
	});

	test("keeps the surface usable on mobile without horizontal page overflow", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/operate-plugins");

		await expect(page.locator("[data-operate-plugins]")).toBeVisible();
		const overflow = await page
			.locator("[data-operate-plugins]")
			.evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
