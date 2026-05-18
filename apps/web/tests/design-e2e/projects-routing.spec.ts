import { expect, test } from "../e2e/fixtures";

const bugConditions = JSON.stringify({ all: [{ fact: "task", path: "$.kind", operator: "equal", value: "bug" }] });
const docsConditions = JSON.stringify({ all: [{ fact: "task", path: "$.kind", operator: "equal", value: "docs" }] });

test.describe("projects routing route interaction coverage", () => {
	test("creates, edits, reorders, tests, and deletes project routing rules", async ({ page, fulcrumHome }) => {
		const project = await fulcrumHome.seedProject("routing-design-desktop", "Routing Design Desktop");
		await page.goto("/auth/auto-session");
		await page.goto(`/projects/${project.id}/routing`);

		await expect(page.locator("[data-routing-settings]")).toBeVisible();
		await expect(page.locator("[data-routing-project-scope]")).toBeVisible();
		await createRule(page, "Bugs to Codex", "codex", bugConditions);
		await expect(page.getByText("Bugs to Codex")).toBeVisible();

		await page.locator("[data-routing-create-panel] summary").click();
		await createRule(page, "Docs to Claude", "claude", docsConditions);
		await expect(page.getByText("Docs to Claude")).toBeVisible();

		await page.locator("summary", { hasText: "Edit" }).first().click();
		await page.getByLabel("Edit name Bugs to Codex").fill("Bugs to Codex Updated");
		await page.locator("form[action='?/update']").first().getByRole("button", { name: "Save" }).click();
		await expect(page.getByText("Bugs to Codex Updated")).toBeVisible();

		await page.locator("[data-routing-reorder-down]").first().click();
		await expect(page.locator("[data-routing-rules-table]")).toBeVisible();

		await page.locator("[data-tab='test']").click();
		await page.getByLabel("Task JSON").fill(JSON.stringify({ title: "Fix bug", kind: "bug", priority: "high", tags: [] }));
		await page.getByRole("button", { name: "Test routing" }).click();
		await expect(page.locator("[data-routing-dry-run-result]")).toBeVisible();

		await page.locator("[data-tab='drafts']").click();
		await expect(page.locator("[data-routing-drafts-table]")).toBeVisible();
		await page.locator("[data-tab='llm-gate']").click();
		await page.getByLabel("Enable LLM routing fallback").check();
		await page.getByLabel("Input mode").selectOption("task_facts");
		await page.getByRole("button", { name: "Save configuration" }).click();
		await expect(page.locator("[data-routing-settings]")).toBeVisible();
		await page.locator("[data-tab='evidence']").click();
		await expect(page.locator("[data-routing-evidence]")).toBeVisible();

		await page.locator("[data-tab='rules']").click();
		await page.locator("[data-routing-delete]").first().click();
		await expect(page.locator("[data-routing-settings]")).toBeVisible();

		await test.info().attach("projects-routing-desktop", {
			body: await page.screenshot({ fullPage: true }),
			contentType: "image/png",
		});
	});

	test("keeps routing controls usable on mobile without horizontal overflow", async ({ page, fulcrumHome }) => {
		const project = await fulcrumHome.seedProject("routing-design-mobile", "Routing Design Mobile");
		await page.goto("/auth/auto-session");
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(`/projects/${project.id}/routing`);

		for (const tab of ["rules", "drafts", "test", "llm-gate", "evidence"]) {
			await page.locator(`[data-tab='${tab}']`).click();
			await expect(page.locator(`[data-routing-${tab === "llm-gate" ? "llm-gate" : tab}-tab], [data-routing-evidence]`).first()).toBeVisible();
		}

		const overflow = await page.locator("[data-routing-settings]").evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
		await test.info().attach("projects-routing-mobile", {
			body: await page.screenshot({ fullPage: true }),
			contentType: "image/png",
		});
	});

	test("falls back to project recovery when the project is missing", async ({ page }) => {
		await page.goto("/auth/auto-session");
		const response = await page.goto("/projects/missing-project-id/routing");
		expect(response?.status()).toBe(404);

		await expect(page.locator("[data-project-detail-error]")).toBeVisible();
	});
});

async function createRule(page: import("@playwright/test").Page, name: string, agent: string, conditionsJson: string): Promise<void> {
	const panel = page.locator("[data-routing-create-panel]");
	await expect(panel).toBeVisible();
	const form = panel.locator("form");
	await expect(form).toBeVisible();
	await form.getByLabel("Rule name").fill(name);
	await form.getByLabel("Agent").fill(agent);
	await form.getByLabel("Conditions JSON").fill(conditionsJson);
	await form.getByRole("button", { name: "Save rule" }).click();
}
