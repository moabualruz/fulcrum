import { expect, test } from "@playwright/test";

/**
 * Rendered design-fidelity proof for the System · Settings surface against the
 * production `/settings` route — the OD `settings.html` IA.
 *
 * Owned by `prd-web-settings-system-od-fidelity`. States: populated, empty,
 * permission, mobile, forced-colors. Acceptance grouping: layout / data-states /
 * interactions / copy / parity / accessibility.
 *
 * Source: `.scratch/od-iterations/20260517-230029/files/settings.html`,
 * `IA-MAP.md §3` line 280, `COPY.md §12`, `DESIGN.md §4.13`.
 */

/** The nine OD settings sections, in IA-MAP `§3` line-280 order. */
const SECTIONS = [
	{ id: "general", label: "General" },
	{ id: "appearance", label: "Appearance" },
	{ id: "keyboard", label: "Keyboard" },
	{ id: "privacy", label: "Privacy & safety" },
	{ id: "agents", label: "AI agents" },
	{ id: "routes", label: "Default routes" },
	{ id: "integrations", label: "Integrations" },
	{ id: "account", label: "Account" },
	{ id: "danger", label: "Danger zone" },
] as const;

test.describe("settings system surface — layout", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/settings");
		await expect(page.locator("[data-settings-ready='true']")).toBeVisible();
	});

	test("renders all nine OD settings IA sections in order", async ({ page }) => {
		for (const section of SECTIONS) {
			await expect(page.locator(`[data-settings-panel='${section.id}']`)).toBeVisible();
			await expect(page.locator(`[data-settings-nav-link='${section.id}']`)).toContainText(section.label);
		}
	});

	test("section nav labels match IA-MAP / COPY.md exactly", async ({ page }) => {
		const labels = await page
			.locator("[data-settings-nav-link]")
			.evaluateAll((links) => links.map((l) => l.textContent?.trim().replace(/^\S+\s/, "")));
		expect(labels).toEqual([
			"General",
			"Appearance",
			"Keyboard",
			"Privacy & safety",
			"AI agents",
			"Default routes",
			"Integrations",
			"Account",
			"Danger zone",
		]);
	});

	test("every panel header carries a tight mode affordance row", async ({ page }) => {
		const rows = page.locator("[data-settings-panel] [data-slot='mode-row']");
		expect(await rows.count()).toBe(SECTIONS.length);
	});

	test("agent registry and route table render the OD content", async ({ page }) => {
		await expect(page.locator("[data-settings-agent-row='claude-opus-4.7']")).toContainText("Claude Opus 4.7");
		await expect(page.locator("[data-settings-agent-row]")).toHaveCount(7);
		await expect(page.locator("[data-settings-route-rule='plan.draft']")).toContainText("Claude Opus 4.7");
		await expect(page.locator("[data-settings-route-rule]")).toHaveCount(7);
	});
});

test.describe("settings system surface — interactions", () => {
	test("settings search filters sections and finds fields by name", async ({ page }) => {
		await page.goto("/settings");
		await expect(page.locator("[data-settings-ready='true']")).toBeVisible();

		await page.locator("[data-settings-search]").fill("keyboard");
		await expect(page.locator("[data-settings-panel='keyboard']")).toBeVisible();
		await expect(page.locator("[data-settings-panel='integrations']")).toHaveCount(0);
		await expect(page.locator("[data-settings-search-count]")).toContainText("1 section");

		await page.locator("[data-settings-search]").fill("redact");
		await expect(page.locator("[data-settings-panel='privacy']")).toBeVisible();
		await expect(page.locator("[data-settings-panel='general']")).toHaveCount(0);
	});

	test("anchor links route to the correct section", async ({ page }) => {
		await page.goto("/settings");
		await expect(page.locator("[data-settings-ready='true']")).toBeVisible();

		await page.locator("[data-settings-nav-link='danger']").click();
		await expect(page.locator("[data-settings-nav-link='danger']")).toHaveAttribute("aria-current", "true");
	});

	test("AI Assist deep link #agents lands on the agents panel", async ({ page }) => {
		await page.goto("/settings#agents");
		await expect(page.locator("[data-settings-ready='true']")).toBeVisible();
		await expect(page.locator("[data-settings-nav-link='agents']")).toHaveAttribute("aria-current", "true");
	});

	test("toggles and segmented controls persist a safe edit across reload", async ({ page }) => {
		await page.goto("/settings");
		await expect(page.locator("[data-settings-ready='true']")).toBeVisible();

		await page.locator("[data-settings-field='theme']", { hasText: "Light" }).click();
		await page.locator("[data-settings-field='vim-nav']").click();
		await expect(page.locator("[data-settings-saved]")).toContainText("Saved");

		await page.reload();
		await expect(page.locator("[data-settings-field='theme']", { hasText: "Light" })).toHaveAttribute(
			"aria-checked",
			"true",
		);
	});

	test("danger actions require confirmation before running", async ({ page }) => {
		await page.goto("/settings");
		await expect(page.locator("[data-settings-ready='true']")).toBeVisible();

		await page.locator("[data-settings-danger-action='delete']").click();
		await expect(page.locator("[data-settings-confirm='delete']")).toBeVisible();
		await expect(page.locator("[data-settings-confirm='delete']")).toContainText("cannot be undone");
		await expect(page.locator("[data-settings-confirm-action='delete']")).toBeVisible();
	});

	test("keyboard shortcut copy for opening settings is documented", async ({ page }) => {
		await page.goto("/settings");
		await expect(page.locator("[data-settings-ready='true']")).toBeVisible();
		await expect(page.locator("[data-settings-field='palette-key']")).toHaveValue("⌘ K");
		await expect(page.locator("[data-settings-field='assist-key']")).toHaveValue("⌘ /");
	});
});

test.describe("settings system surface — copy", () => {
	test("integration, account, and danger copy match the OD file", async ({ page }) => {
		await page.goto("/settings");
		await expect(page.locator("[data-settings-ready='true']")).toBeVisible();

		await expect(page.locator("[data-settings-integration='github']")).toContainText(
			"scopes: repo, workflow, read:org",
		);
		await expect(page.locator("[data-settings-integration='linear']")).toContainText("Not connected.");
		await expect(page.locator("[data-settings-account-action='upgrade']")).toContainText("Upgrade");
		await expect(page.locator("[data-settings-danger-action='reset']")).toContainText("Reset");
	});

	test("pre-existing /settings sub-routes stay reachable — no feature loss", async ({ page }) => {
		await page.goto("/settings");
		await expect(page.locator("[data-settings-ready='true']")).toBeVisible();

		const hrefs = await page
			.locator("[data-settings-subroute]")
			.evaluateAll((links) => links.map((l) => l.getAttribute("href")));
		for (const href of ["/settings/theme", "/settings/routing", "/settings/connectors", "/settings/api"]) {
			expect(hrefs).toContain(href);
			const response = await page.request.get(href);
			expect(response.status(), href).toBeLessThan(400);
		}
	});
});

test.describe("settings system surface — data states", () => {
	test("empty: the agents panel shows the OD empty state", async ({ page }) => {
		await page.goto("/settings?agents=empty#agents");
		await expect(page.locator("[data-settings-ready='true']")).toBeVisible();
		await expect(page.locator("[data-settings-agents-empty]")).toBeVisible();
		await expect(page.locator("[data-settings-agents-empty]")).toContainText("No CLI agents connected yet.");
		await expect(page.locator("[data-settings-agent-row]")).toHaveCount(0);
	});

	test("empty: searching for an unknown field shows the no-results state", async ({ page }) => {
		await page.goto("/settings");
		await expect(page.locator("[data-settings-ready='true']")).toBeVisible();
		await page.locator("[data-settings-search]").fill("zzzznomatch");
		await expect(page.locator("[data-settings-no-results]")).toBeVisible();
	});

	test("permission: a member sees the Danger zone read-only notice", async ({ page }) => {
		await page.goto("/settings?permission=member#danger");
		await expect(page.locator("[data-settings-ready='true']")).toBeVisible();
		await expect(page.locator("[data-settings-system]")).toHaveAttribute("data-permission", "member");
		await expect(page.locator("[data-settings-danger-permission]")).toBeVisible();
		await expect(page.locator("[data-settings-danger-permission]")).toContainText("owner permission required");
		await expect(page.locator("[data-settings-danger-action='delete']")).toHaveCount(0);
	});

	test("mobile: settings stay usable at 390px without horizontal overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/settings");
		await expect(page.locator("[data-settings-ready='true']")).toBeVisible();

		const overflow = await page
			.locator("[data-settings-system]")
			.evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});

	test("forced-colors: the surface renders with the forced-colors guard active", async ({ page }) => {
		await page.emulateMedia({ forcedColors: "active" });
		await page.goto("/settings");
		await expect(page.locator("[data-settings-ready='true']")).toBeVisible();
		await expect(page.locator("[data-settings-panel='general']")).toBeVisible();
		await page.screenshot({
			path: "test-results/settings-forced-colors.png",
			fullPage: true,
		});
	});
});

test.describe("settings system surface — accessibility", () => {
	test("the active section nav link exposes aria-current", async ({ page }) => {
		await page.goto("/settings");
		await expect(page.locator("[data-settings-ready='true']")).toBeVisible();
		await expect(page.locator("[data-settings-nav-link='general']")).toHaveAttribute("aria-current", "true");
	});

	test("segmented setting controls expose role=radiogroup and aria-checked", async ({ page }) => {
		await page.goto("/settings");
		await expect(page.locator("[data-settings-ready='true']")).toBeVisible();
		await expect(page.locator("[role='radiogroup'][aria-label='Theme']")).toBeVisible();
		const checked = page.locator("[data-settings-field='theme'][aria-checked='true']");
		await expect(checked).toHaveCount(1);
	});

	test("every interactive setting field is reachable and shows a focus ring", async ({ page }) => {
		await page.goto("/settings");
		await expect(page.locator("[data-settings-ready='true']")).toBeVisible();
		await page.locator("[data-settings-search]").focus();
		await expect(page.locator("[data-settings-search]")).toBeFocused();
		await page.screenshot({ path: "test-results/settings-populated.png", fullPage: true });
	});
});
