import { expect, test } from "@playwright/test";

test.describe("operate-mcp server management", () => {
	test("lists registered servers with protocol, status, and tool count", async ({ page }) => {
		await page.goto("/operate-mcp");

		await expect(page.locator("[data-operate-mcp-header]")).toContainText("MCP servers");
		await expect(page.locator("[data-mcp-server-row='mcp_github']")).toBeVisible();
		await expect(page.locator("[data-mcp-server-protocol='mcp_github']")).toContainText("HTTP");
		await expect(page.locator("[data-mcp-server-status='mcp_github']")).toContainText("connected");
		await expect(page.locator("[data-mcp-server-tool-count='mcp_github']")).toContainText("23");

		await expect(page.locator("[data-mcp-server-protocol='mcp_filesystem']")).toContainText("STDIO");
		await expect(page.locator("[data-mcp-server-command='mcp_filesystem']")).toContainText("/usr/local/bin/mcp-filesystem");

		await expect(page.locator("[data-mcp-server-status='mcp_postgres']")).toContainText("error");
		await expect(page.locator("[data-mcp-server-error='mcp_postgres']")).toContainText("connection refused");
	});

	test("register button opens form with HTTP-specific fields by default", async ({ page }) => {
		await page.goto("/operate-mcp");

		await page.locator("[data-mcp-register-open]").click();
		await expect(page.locator("[data-mcp-register-form]")).toBeVisible();
		await expect(page.locator("[data-mcp-register-url]")).toBeVisible();
		await expect(page.locator("[data-mcp-register-port]")).toBeVisible();
		await expect(page.locator("[data-mcp-register-verify-tls]")).toBeVisible();
		await expect(page.locator("[data-mcp-register-command]")).toHaveCount(0);
	});

	test("switching protocol to stdio swaps form fields", async ({ page }) => {
		await page.goto("/operate-mcp");

		await page.locator("[data-mcp-register-open]").click();
		await page.locator("[data-mcp-register-protocol]").selectOption("stdio");
		await expect(page.locator("[data-mcp-register-command]")).toBeVisible();
		await expect(page.locator("[data-mcp-register-args]")).toBeVisible();
		await expect(page.locator("[data-mcp-register-env]")).toBeVisible();
		await expect(page.locator("[data-mcp-register-url]")).toHaveCount(0);
	});

	test("submit creates a row in the server table", async ({ page }) => {
		await page.goto("/operate-mcp");

		await page.locator("[data-mcp-register-open]").click();
		await page.locator("[data-mcp-register-name]").fill("Acme Search");
		await page.locator("[data-mcp-register-url]").fill("https://search.acme.test/mcp");
		await page.locator("[data-mcp-register-submit]").click();

		await expect(page.locator("[data-mcp-server-row='mcp_acme_search']")).toBeVisible();
		await expect(page.locator("[data-mcp-server-status='mcp_acme_search']")).toContainText("disconnected");
	});

	test("connect transitions status from disconnected to connected", async ({ page }) => {
		await page.goto("/operate-mcp");

		await page.locator("[data-mcp-register-open]").click();
		await page.locator("[data-mcp-register-name]").fill("Acme Tools");
		await page.locator("[data-mcp-register-url]").fill("https://tools.acme.test/mcp");
		await page.locator("[data-mcp-register-submit]").click();

		await page.locator("[data-mcp-connect='mcp_acme_tools']").click();
		await expect(page.locator("[data-mcp-server-status='mcp_acme_tools']")).toContainText("connected");
		await expect(page.locator("[data-mcp-server-tool-count='mcp_acme_tools']")).not.toContainText("0");
	});

	test("disconnect prompts confirmation and removes tool count when confirmed", async ({ page }) => {
		await page.goto("/operate-mcp");

		await page.locator("[data-mcp-disconnect='mcp_github']").click();
		await expect(page.locator("[data-mcp-disconnect-confirm='mcp_github']")).toBeVisible();
		await expect(page.locator("[data-mcp-disconnect-confirm='mcp_github']")).toHaveAttribute("role", "alertdialog");

		await page.locator("[data-mcp-disconnect-confirm-yes]").click();
		await expect(page.locator("[data-mcp-server-status='mcp_github']")).toContainText("disconnected");
		await expect(page.locator("[data-mcp-server-tool-count='mcp_github']")).toContainText("0");
	});

	test("probe shows availability, version, tool count, and timestamp", async ({ page }) => {
		await page.goto("/operate-mcp");

		await page.locator("[data-mcp-probe='mcp_github']").click();
		const probe = page.locator("[data-mcp-probe-result='mcp_github']");
		await expect(probe).toBeVisible();
		await expect(page.locator("[data-probe-outcome='mcp_github']")).toContainText("available");
		await expect(page.locator("[data-probe-version='mcp_github']")).toContainText("1.0.0");
		await expect(page.locator("[data-probe-tool-count='mcp_github']")).toContainText("3");
		await expect(page.locator("[data-probe-checked-at='mcp_github']")).toContainText("checked:");
	});

	test("probe of an error-status server reports the reason instead of tools", async ({ page }) => {
		await page.goto("/operate-mcp");

		await page.locator("[data-mcp-probe='mcp_postgres']").click();
		await expect(page.locator("[data-probe-outcome='mcp_postgres']")).toContainText("unavailable");
		await expect(page.locator("[data-probe-reason='mcp_postgres']")).toContainText("connection refused on port 5432");
		await expect(page.locator("[data-mcp-tools-toggle='mcp_postgres']")).toHaveCount(0);
	});

	test("expanding tools shows name, description, and schema preview", async ({ page }) => {
		await page.goto("/operate-mcp");

		await page.locator("[data-mcp-probe='mcp_filesystem']").click();
		await page.locator("[data-mcp-tools-toggle='mcp_filesystem']").click();
		const list = page.locator("[data-mcp-tools-list='mcp_filesystem']");
		await expect(list).toBeVisible();
		await expect(list.locator("[data-mcp-tool='read_file']")).toContainText("Read a file as UTF-8");
		await expect(list.locator("[data-mcp-tool='write_file']")).toContainText("schema: { path, content }");
	});
});
