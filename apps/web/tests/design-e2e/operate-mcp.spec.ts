import { expect, test } from "@playwright/test";

/**
 * Design-e2e fidelity coverage for the OD `operate-mcp.html` surface — the
 * Operate · MCP servers view (DESIGN.md §11 item 9 per-agent scope, §4.9 status
 * vocabulary, §4.11/§4.13 per-step mode-row, IA-MAP.md §2.6 Operate routes).
 *
 * The route renders the OD `page`: head (count + Probe all + Add server), the
 * per-agent scope `seg-group` selector, the `table.mcp`
 * (Server / Status / Tools / p50 RTT / p99 RTT / Auth / Last probe / actions),
 * a per-row compact mode-row, and the hidden empty-state. The live
 * `operate-mcp` route folder is the migration alias for the canonical
 * `/<ws>/projects/<projId>/operate/mcp`.
 */

test.describe("operate-mcp per-agent server scope", () => {
	test("head renders count, Probe all, and Add server", async ({ page }) => {
		await page.goto("/operate-mcp");

		await expect(page.locator("[data-operate-mcp-header]")).toContainText("MCP servers");
		await expect(page.locator("[data-mcp-count]")).toContainText("7 registered");
		await expect(page.locator("[data-mcp-count]")).toContainText("6 passing");
		await expect(page.locator("[data-mcp-count]")).toContainText("1 failing");
		await expect(page.locator("[data-mcp-count]")).toContainText("scoped to Claude Opus 4.7");
		await expect(page.locator("[data-mcp-probe-all]")).toContainText("Probe all");
		await expect(page.locator("[data-mcp-register-open]")).toContainText("Add server");
	});

	test("per-agent scope selector lists seven CLI agents and links to Settings", async ({
		page,
	}) => {
		await page.goto("/operate-mcp");

		const group = page.locator("[data-mcp-scope-group]");
		await expect(group).toHaveAttribute("role", "radiogroup");
		await expect(group.locator("[role='radio']")).toHaveCount(7);
		await expect(page.locator("[data-mcp-scope-option='claude-opus']")).toHaveAttribute(
			"aria-checked",
			"true",
		);
		await expect(page.locator("[data-mcp-scope-option='codex']")).toContainText("Codex");

		// The per-agent note links to Settings > AI agents per the OD copy.
		const link = page.locator("[data-mcp-settings-link]");
		await expect(page.locator("[data-mcp-scope-note]")).toContainText(
			"MCP servers are configured per agent",
		);
		await expect(link).toContainText("Settings > AI agents");
		await expect(link).toHaveAttribute("href", "/settings#agents");
	});

	test("scope-chip selection switches the MCP server list per agent", async ({ page }) => {
		await page.goto("/operate-mcp");

		// Claude Opus 4.7 — seven servers.
		await expect(page.locator("[data-mcp-server-row]")).toHaveCount(7);

		// Switch to OpenCode — a single, down server.
		await page.locator("[data-mcp-scope-option='opencode']").click();
		await expect(page.locator("[data-mcp-scope-option='opencode']")).toHaveAttribute(
			"aria-checked",
			"true",
		);
		await expect(page.locator("[data-mcp-server-row]")).toHaveCount(1);
		await expect(page.locator("[data-mcp-count]")).toContainText("scoped to OpenCode");
		await expect(page.locator("[data-mcp-server-status='mcp_deepwiki']")).toHaveAttribute(
			"data-mcp-health",
			"down",
		);

		// Switch to Gemini 3 — no servers, the empty state renders.
		await page.locator("[data-mcp-scope-option='gemini']").click();
		await expect(page.locator("[data-mcp-server-row]")).toHaveCount(0);
		await expect(page.locator("[data-mcp-empty] [data-slot='empty-state']")).toBeVisible();
		await expect(page.locator("[data-mcp-empty]")).toContainText("No MCP servers registered.");
	});

	test("table shows the OD column set with RTT, Auth, and Last-probe", async ({ page }) => {
		await page.goto("/operate-mcp");

		const headers = page.locator("[data-mcp-server-table] thead th");
		await expect(headers.nth(0)).toContainText("Server");
		await expect(headers.nth(1)).toContainText("Status");
		await expect(headers.nth(2)).toContainText("Tools");
		await expect(headers.nth(3)).toContainText("p50 RTT");
		await expect(headers.nth(4)).toContainText("p99 RTT");
		await expect(headers.nth(5)).toContainText("Auth");
		await expect(headers.nth(6)).toContainText("Last probe");

		await expect(page.locator("[data-mcp-server-rtt-p50='mcp_open_design']")).toHaveText("28 ms");
		await expect(page.locator("[data-mcp-server-rtt-p99='mcp_open_design']")).toHaveText("94 ms");
		await expect(page.locator("[data-mcp-server-rtt-p99='mcp_context_mode']")).toHaveText("6.4 s");
		await expect(page.locator("[data-mcp-server-auth='mcp_open_design']")).toHaveText("token");
		await expect(page.locator("[data-mcp-server-auth='mcp_deepwiki']")).toHaveText("oauth");
		await expect(page.locator("[data-mcp-server-auth='mcp_context_mode']")).toHaveText("—");
		await expect(page.locator("[data-mcp-server-last-probe='mcp_fulcrum_tools']")).toHaveText(
			"8s ago",
		);
	});

	test("status uses the canonical vocabulary, not connected/error", async ({ page }) => {
		await page.goto("/operate-mcp");

		// healthy → passing (canonical StatusBadge), degraded → failing.
		const healthy = page.locator("[data-mcp-server-status='mcp_open_design']");
		await expect(healthy).toHaveAttribute("data-slot", "status-badge");
		await expect(healthy).toHaveAttribute("data-status", "passing");
		await expect(healthy).toHaveAttribute("data-mcp-health", "healthy");

		const degraded = page.locator("[data-mcp-server-status='mcp_context_mode']");
		await expect(degraded).toHaveAttribute("data-status", "failing");
		await expect(degraded).toHaveAttribute("data-mcp-health", "degraded");

		// The retired `connected`/`error` enum must not appear anywhere.
		await expect(page.locator("[data-status='connected']")).toHaveCount(0);
		await expect(page.locator("[data-status='error']")).toHaveCount(0);
	});

	test("each server row carries the universal compact mode-row", async ({ page }) => {
		await page.goto("/operate-mcp");

		const modeRow = page.locator("[data-mcp-mode-row='mcp_open_design']");
		await expect(modeRow).toBeVisible();
		await expect(modeRow).toHaveAttribute("role", "toolbar");
		await expect(modeRow).toHaveAttribute("data-density", "compact");
		await expect(modeRow).toHaveAttribute("aria-label", "Step modes");
		await expect(modeRow.locator("[data-slot='mode-row-option']")).toHaveCount(4);

		// Selecting a mode updates the row's data-value (DESIGN.md §4.13).
		await modeRow.locator("[data-mode='play']").click();
		await expect(modeRow).toHaveAttribute("data-value", "play");
	});

	test("Probe all probes every server and Probe surfaces version + tools", async ({ page }) => {
		await page.goto("/operate-mcp");

		await page.locator("[data-mcp-probe-all]").click();
		await expect(page.locator("[data-mcp-probe-result='mcp_open_design']")).toBeVisible();
		await expect(page.locator("[data-probe-outcome='mcp_open_design']")).toContainText(
			"available",
		);
		await expect(page.locator("[data-probe-version='mcp_open_design']")).toContainText("1.0.0");

		// A degraded server reports the failure reason instead of tools.
		await expect(page.locator("[data-probe-outcome='mcp_context_mode']")).toContainText(
			"unavailable",
		);
		await expect(page.locator("[data-probe-reason='mcp_context_mode']")).toContainText(
			"p99 latency 6.4 s",
		);
	});

	test("expanding tools shows name, description, and schema preview", async ({ page }) => {
		await page.goto("/operate-mcp");

		await page.locator("[data-mcp-probe='mcp_open_design']").click();
		await page.locator("[data-mcp-tools-toggle='mcp_open_design']").click();
		const list = page.locator("[data-mcp-tools-list='mcp_open_design']");
		await expect(list).toBeVisible();
		await expect(list.locator("[data-mcp-tool='get_artifact']")).toContainText(
			"Fetch a design artifact",
		);
		await expect(list.locator("[data-mcp-tool='list_files']")).toContainText("schema:");
	});

	test("Add server form opens and registers a server to the active agent", async ({ page }) => {
		await page.goto("/operate-mcp");

		await page.locator("[data-mcp-register-open]").click();
		await expect(page.locator("[data-mcp-register-form]")).toBeVisible();
		await expect(page.locator("[data-mcp-register-form]")).toContainText("Claude Opus 4.7");
		await expect(page.locator("[data-mcp-register-url]")).toBeVisible();

		await page.locator("[data-mcp-register-name]").fill("Acme Search");
		await page.locator("[data-mcp-register-url]").fill("https://search.acme.test/mcp");
		await page.locator("[data-mcp-register-submit]").click();

		await expect(page.locator("[data-mcp-server-row='mcp_acme_search']")).toBeVisible();
		await expect(page.locator("[data-mcp-server-status='mcp_acme_search']")).toHaveAttribute(
			"data-mcp-health",
			"down",
		);
	});

	test("stdio protocol swaps the form to command/args/env fields", async ({ page }) => {
		await page.goto("/operate-mcp");

		await page.locator("[data-mcp-register-open]").click();
		await page.locator("[data-mcp-register-protocol]").selectOption("stdio");
		await expect(page.locator("[data-mcp-register-command]")).toBeVisible();
		await expect(page.locator("[data-mcp-register-args]")).toBeVisible();
		await expect(page.locator("[data-mcp-register-env]")).toBeVisible();
		await expect(page.locator("[data-mcp-register-url]")).toHaveCount(0);
	});

	test("credential input redacts the auth token by default", async ({ page }) => {
		await page.goto("/operate-mcp");

		await page.locator("[data-mcp-register-open]").click();
		const credential = page.locator("[data-slot='credential-input-root']");
		await expect(credential).toBeVisible();
		await expect(credential).toHaveAttribute("data-visible", "false");
		// The underlying field is a masked (password) input until toggled.
		await expect(page.locator("[data-slot='credential-input']")).toHaveAttribute(
			"type",
			"password",
		);
	});

	test("error state renders the OD probe-failure banner with a trace id", async ({ page }) => {
		await page.goto("/operate-mcp?state=error");

		await expect(page.locator("[data-operate-mcp]")).toHaveAttribute("data-state", "error");
		const banner = page.locator("[data-mcp-probe-error]");
		await expect(banner).toBeVisible();
		await expect(banner).toHaveAttribute("data-slot", "error-banner");
		await expect(banner).toHaveAttribute("role", "alert");
		await expect(banner).toContainText("Probe failed for Claude Opus 4.7");
		await expect(banner.locator("[data-slot='error-banner-retry']")).toContainText("Probe all");
	});

	test("keeps the surface usable on mobile without horizontal page overflow", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/operate-mcp");

		await expect(page.locator("[data-operate-mcp]")).toBeVisible();
		const overflow = await page
			.locator("[data-operate-mcp]")
			.evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
