import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Rendered design-fidelity coverage for `prd-web-plan-templates-od-fidelity`.
 *
 * The Plan-stage plan-template library — canonical route
 * `/<ws>/projects/<projId>/plan/templates` (IA-MAP.md §3 `:templates`),
 * rendered at `/plan-templates`. Proven against OD `plan-templates.html`,
 * CLI-TUI-UX.md §1 "Plan template library", COPY.md §2, DESIGN.md §4.11:
 *
 *  - layout — the OD `.lib` two-column grid: a 220px Category/Owner facet
 *    sidebar beside a responsive template card grid.
 *  - cards — each card carries an icon tile, title, one-line description,
 *    monospace meta, and a per-card four-mode ModeRow.
 *  - facets — Category facet narrows the card grid; Owner facet toggles.
 *  - interactions — selecting a template and confirming opens a pre-seeded
 *    planning session (the plan-session New-session handoff).
 *  - data-states — populated / empty.
 *  - copy — COPY.md §2 canonical empty-state shape (H2 / P / two buttons).
 *  - disambiguation — keyed `data-template-kind="plan-template"`, distinct
 *    from the task/recurrence `templates` feature.
 *
 * Source: OD `plan-templates.html`; IA-MAP.md §3; CLI-TUI-UX.md §1; COPY.md §2;
 * DESIGN.md §4.11.
 */

/** Persist a rendered screenshot to the recovery-packet evidence dir. */
async function writeEvidenceShot(name: string, body: Buffer): Promise<void> {
	const dir = process.env.FULCRUM_DESIGN_EVIDENCE_DIR;
	if (!dir) return;
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, name), body);
}

test.describe("plan-templates — plan-template library (OD plan-templates.html)", () => {
	test("renders the page head, subtitle, and the two-column facet + card-grid layout", async ({
		page,
	}) => {
		await page.goto("/plan-templates");

		const root = page.locator("[data-plan-templates-page]");
		await expect(root).toBeVisible();
		await expect(root).toHaveAttribute("data-state", "populated");
		await expect(root).toHaveAttribute("data-template-kind", "plan-template");

		// Page head — title + count + New template action.
		await expect(page.getByRole("heading", { name: "Plan templates", level: 1 })).toBeVisible();
		await expect(page.locator("[data-templates-count]")).toContainText("12 templates");
		await expect(page.locator("[data-new-template]")).toBeVisible();

		// The OD `.lib` two-column grid — facet sidebar + card grid.
		await expect(page.locator("[data-template-facets]")).toBeVisible();
		await expect(page.locator("[data-template-grid]")).toBeVisible();

		// Category facets — All / Refactor / New feature / Bug investigation /
		// Migration / Spike-prototype.
		for (const key of [
			"all",
			"refactor",
			"new-feature",
			"bug-investigation",
			"migration",
			"spike-prototype",
		]) {
			await expect(page.locator(`[data-category-facet='${key}']`)).toBeVisible();
		}
		// Owner facets — Mine / Team.
		await expect(page.locator("[data-owner-facet='mine']")).toBeVisible();
		await expect(page.locator("[data-owner-facet='team']")).toBeVisible();

		// 12 seed templates rendered.
		await expect(page.locator("[data-template-card]")).toHaveCount(12);

		const shot = await root.screenshot();
		await writeEvidenceShot("plan-templates-populated.png", shot);
	});

	test("each card carries an icon tile, title, description, monospace meta, and a mode row", async ({
		page,
	}) => {
		await page.goto("/plan-templates");
		const card = page.locator("[data-template-card='tpl_refactor_module']");
		await expect(card).toBeVisible();
		await expect(card.getByRole("heading", { name: "Refactor a module" })).toBeVisible();
		await expect(card.locator("[data-slot='template-icon']")).toBeVisible();
		await expect(card.locator("[data-slot='template-meta']")).toContainText("used 7×");
		await expect(card.locator("[data-slot='template-meta']")).toContainText("updated 3d ago");

		// The per-card ModeRow — the universal four-mode affordance (DESIGN.md §4.11).
		const modeRow = card.locator("[data-template-mode-row='tpl_refactor_module']");
		await expect(modeRow).toHaveAttribute("role", "toolbar");
		await expect(modeRow.locator("[data-slot='mode-row-option']")).toHaveCount(4);
		await expect(modeRow).toHaveAttribute("data-value", "manual");
	});

	test("Category facet narrows the card grid", async ({ page }) => {
		await page.goto("/plan-templates");
		await expect(page.locator("[data-template-card]")).toHaveCount(12);

		await page.locator("[data-category-facet='refactor']").click();
		await expect(page.locator("[data-category-facet='refactor']")).toHaveAttribute(
			"data-active",
			"true",
		);
		const refactorCards = page.locator("[data-template-card]");
		await expect(refactorCards).toHaveCount(4);
		for (const card of await refactorCards.all()) {
			await expect(card).toHaveAttribute("data-template-category", "refactor");
		}

		await page.locator("[data-category-facet='migration']").click();
		await expect(page.locator("[data-template-card]")).toHaveCount(2);

		await page.locator("[data-category-facet='all']").click();
		await expect(page.locator("[data-template-card]")).toHaveCount(12);
	});

	test("Owner facet toggles and intersects with the Category facet", async ({ page }) => {
		await page.goto("/plan-templates");
		await page.locator("[data-owner-facet='mine']").click();
		await expect(page.locator("[data-owner-facet='mine']")).toHaveAttribute("data-active", "true");
		for (const card of await page.locator("[data-template-card]").all()) {
			await expect(card).toHaveAttribute("data-template-owner", "mine");
		}
		// Clicking the active Owner facet clears it.
		await page.locator("[data-owner-facet='mine']").click();
		await expect(page.locator("[data-owner-facet='mine']")).not.toHaveAttribute("data-active", "true");
		await expect(page.locator("[data-template-card]")).toHaveCount(12);
	});

	test("selecting a template and confirming opens a pre-seeded planning session", async ({
		page,
	}) => {
		await page.goto("/plan-templates");

		await page.locator("[data-use-template='tpl_bug_investigation']").click();
		await expect(page.locator("[data-template-confirm='tpl_bug_investigation']")).toBeVisible();

		await page.locator("[data-confirm-create-template='tpl_bug_investigation']").click();

		// The seeded planning session — the plan-session New-session handoff.
		const seeded = page.locator("[data-seeded-session]");
		await expect(seeded).toBeVisible();
		await expect(seeded).toContainText("Bug investigation");
		const link = page.locator("[data-open-seeded-session]");
		await expect(link).toHaveAttribute("href", /\/plan-session#plan_sess_/);

		const shot = await page.locator("[data-plan-templates-page]").screenshot();
		await writeEvidenceShot("plan-templates-seeded-session.png", shot);
	});

	test("create-from-template can be cancelled before it seeds a session", async ({ page }) => {
		await page.goto("/plan-templates");
		await page.locator("[data-use-template='tpl_schema_migration']").click();
		await expect(page.locator("[data-template-confirm='tpl_schema_migration']")).toBeVisible();
		await page.locator("[data-cancel-create-template]").click();
		await expect(page.locator("[data-template-confirm='tpl_schema_migration']")).toHaveCount(0);
		await expect(page.locator("[data-seeded-session]")).toHaveCount(0);
	});

	test("empty state matches the COPY.md §2 canonical shape", async ({ page }) => {
		await page.goto("/plan-templates");
		await page.locator("[data-clear-templates]").click();

		const root = page.locator("[data-plan-templates-page]");
		await expect(root).toHaveAttribute("data-state", "empty");

		const empty = page.locator("[data-plan-templates-empty]");
		await expect(empty).toBeVisible();
		// Canonical shape — H2 (what's missing) + P (why + next step).
		await expect(empty.getByRole("heading", { name: "No templates yet." })).toBeVisible();
		await expect(empty).toContainText("Templates are reusable plan skeletons.");
		// Two action buttons.
		await expect(page.locator("[data-empty-new-template]")).toBeVisible();
		await expect(page.locator("[data-empty-import-preset]")).toBeVisible();

		const shot = await root.screenshot();
		await writeEvidenceShot("plan-templates-empty.png", shot);

		// New template restores the populated library.
		await page.locator("[data-empty-new-template]").click();
		await expect(root).toHaveAttribute("data-state", "populated");
		await expect(page.locator("[data-template-card]")).toHaveCount(12);
	});

	test("the mode row on a card is keyboard operable and updates the selected mode", async ({
		page,
	}) => {
		await page.goto("/plan-templates");
		const playBtn = page
			.locator("[data-template-mode-row='tpl_refactor_module'] [data-mode='play']");
		await playBtn.click();
		await expect(playBtn).toHaveAttribute("aria-pressed", "true");
		await expect(
			page.locator("[data-template-mode-row='tpl_refactor_module']"),
		).toHaveAttribute("data-value", "play");
	});
});
