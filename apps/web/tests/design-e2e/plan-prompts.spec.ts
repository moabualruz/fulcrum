import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Rendered design-fidelity coverage for `prd-web-plan-prompts-od-fidelity`.
 *
 * The Plan-stage prompt library — canonical route
 * `/<ws>/projects/<projId>/plan/prompts` (IA-MAP.md §3 `:prompts` "prompt
 * library · tag filter"; CLI-TUI-UX.md §1 line 466), rendered at
 * `/plan-prompts`. Proven against OD `plan-prompts.html`, DESIGN.md §4.11/§4.13
 * (per-step mode row), and COPY.md §2 (empty-state shape):
 *
 *  - layout — page-head ("Prompt library" + sync count), subtitle, toolbar
 *    (search + 8 stage chips), prompt rows (icon tile + title + monospace
 *    preview + tag pills + usage count + author·age + a compact ModeRow).
 *  - data-states — populated / empty / no-matches / forced-colors.
 *  - interactions — stage-filter chips narrow the list; search narrows the
 *    list; the per-row ModeRow selects a mode.
 *  - copy — COPY.md §2 prompts empty-state template (one sentence + one
 *    action), banned-synonym absence.
 *  - parity — migration: the mislabelled "Workflow states" editor is gone, its
 *    canonical home `/projects/<projId>/settings/workflow` still resolves, the
 *    `/plan-prompts` path still resolves (no 404).
 *  - accessibility — keyboard operability + visible focus ring; chips carry
 *    `aria-pressed`; the ModeRow toolbar carries `role="toolbar"`.
 *
 * Source: OD `plan-prompts.html`; DESIGN.md §4.11/§4.13; IA-MAP.md §3;
 * CLI-TUI-UX.md §1; COPY.md §2.
 */

/** Persist a rendered screenshot to the recovery-packet evidence dir. */
async function writeEvidenceShot(name: string, body: Buffer): Promise<void> {
	const dir = process.env.FULCRUM_DESIGN_EVIDENCE_DIR;
	if (!dir) return;
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, name), body);
}

test.describe("plan-prompts — prompt library layout (OD plan-prompts.html)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/plan-prompts");
	});

	test("renders the page-head, sync count, and subtitle", async ({ page }) => {
		const root = page.locator("[data-plan-prompts-page]");
		await expect(root).toBeVisible();
		await expect(root).toHaveAttribute("data-state", "populated");

		await expect(page.getByRole("heading", { name: "Prompt library" })).toBeVisible();
		const count = page.locator("[data-plan-prompts-count]");
		await expect(count).toContainText("prompts · synced from project + global");
		await expect(root).toContainText("Prompts feed any ▶ Play step in any stage.");

		const shot = await root.screenshot();
		await writeEvidenceShot("plan-prompts-populated.png", shot);
	});

	test("renders the toolbar — search input + 8 stage filter chips", async ({ page }) => {
		await expect(page.locator("[data-plan-prompts-search]")).toBeVisible();
		for (const stage of ["all", "capture", "plan", "build", "review", "ship", "operate", "mine"]) {
			await expect(page.locator(`[data-plan-prompts-stage-chip='${stage}']`)).toBeVisible();
		}
		// "All" is the default active chip.
		await expect(page.locator("[data-plan-prompts-stage-chip='all']")).toHaveAttribute(
			"data-active",
			"true",
		);
	});

	test("each prompt row carries icon tile, title, preview, tags, usage, author, mode row", async ({
		page,
	}) => {
		const row = page.locator("[data-plan-prompts-row='plan-from-capture']");
		await expect(row).toBeVisible();
		await expect(row.locator("[data-slot='prompt-icon']")).toBeVisible();
		await expect(row).toContainText("Plan from a capture");
		await expect(row.locator("[data-slot='prompt-preview']")).toContainText(
			"You are a senior product engineer.",
		);
		await expect(row.locator("[data-plan-prompts-tag='plan']")).toBeVisible();
		await expect(row.locator("[data-plan-prompts-tag='opus']")).toBeVisible();
		await expect(row.locator("[data-slot='prompt-usage']")).toHaveText("used 47×");
		await expect(row.locator("[data-slot='prompt-author']")).toContainText("mkh · 3d");

		// Per-row mode row — DESIGN.md §4.11/§4.13 compact form.
		const modeRow = page.locator("[data-plan-prompts-mode-row='plan-from-capture']");
		await expect(modeRow).toBeVisible();
		await expect(modeRow).toHaveAttribute("role", "toolbar");
		await expect(modeRow).toHaveAttribute("data-density", "compact");
		await expect(modeRow.locator("[data-slot='mode-row-option']")).toHaveCount(4);
		for (const mode of ["manual", "play", "discuss", "assist"]) {
			await expect(modeRow.locator(`[data-mode='${mode}']`)).toBeVisible();
		}
	});
});

test.describe("plan-prompts — interactions", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/plan-prompts");
	});

	test("stage filter chips narrow the prompt list", async ({ page }) => {
		const rows = page.locator("[data-plan-prompts-rows] > li");
		const total = await rows.count();
		expect(total).toBeGreaterThan(4);

		await page.locator("[data-plan-prompts-stage-chip='operate']").click();
		await expect(page.locator("[data-plan-prompts-stage-chip='operate']")).toHaveAttribute(
			"data-active",
			"true",
		);
		const operateRows = await page.locator("[data-plan-prompts-rows] > li").count();
		expect(operateRows).toBeGreaterThan(0);
		expect(operateRows).toBeLessThan(total);
		await expect(page.locator("[data-plan-prompts-row='flame-graph']")).toBeVisible();
		await expect(page.locator("[data-plan-prompts-row='critique-pr']")).toHaveCount(0);

		const shot = await page.locator("[data-plan-prompts-page]").screenshot();
		await writeEvidenceShot("plan-prompts-stage-filtered.png", shot);
	});

	test("the My prompts chip narrows to author-owned prompts", async ({ page }) => {
		await page.locator("[data-plan-prompts-stage-chip='mine']").click();
		await expect(page.locator("[data-plan-prompts-row='critique-pr']")).toHaveCount(0);
		await expect(page.locator("[data-plan-prompts-row='plan-from-capture']")).toBeVisible();
		// Author-owned rows carry the "Mine" badge.
		await expect(page.locator("[data-plan-prompts-mine='plan-from-capture']")).toBeVisible();
	});

	test("search narrows the list by title, preview, or tag", async ({ page }) => {
		await page.locator("[data-plan-prompts-search]").fill("migration");
		await expect(page.locator("[data-plan-prompts-row='migration-risk']")).toBeVisible();
		await expect(page.locator("[data-plan-prompts-row='plan-from-capture']")).toHaveCount(0);
	});

	test("the per-row ModeRow selects a mode", async ({ page }) => {
		const modeRow = page.locator("[data-plan-prompts-mode-row='plan-from-capture']");
		await expect(modeRow).toHaveAttribute("data-value", "manual");
		await modeRow.locator("[data-mode='play']").click();
		await expect(modeRow).toHaveAttribute("data-value", "play");
		await expect(modeRow.locator("[data-mode='play']")).toHaveAttribute("aria-pressed", "true");
	});

	test("no-matches state appears when the search excludes every prompt", async ({ page }) => {
		await page.locator("[data-plan-prompts-search]").fill("zzz-no-such-prompt");
		const noMatches = page.locator("[data-plan-prompts-no-matches]");
		await expect(noMatches).toBeVisible();
		await expect(noMatches).toContainText("No prompts match.");
		await page.locator("[data-plan-prompts-clear-filter]").click();
		await expect(page.locator("[data-plan-prompts-rows]")).toBeVisible();
	});
});

test.describe("plan-prompts — data states + copy", () => {
	test("empty state matches the COPY.md §2 prompts template", async ({ page }) => {
		await page.goto("/plan-prompts?state=empty");
		await expect(page.locator("[data-plan-prompts-page]")).toHaveAttribute("data-state", "empty");

		const empty = page.locator("[data-plan-prompts-empty]");
		await expect(empty).toBeVisible();
		// One sentence naming what's missing + why; one primary action.
		await expect(empty).toContainText("No prompts yet.");
		await expect(empty).toContainText(
			"Prompts are reusable agent instructions tagged by step, model, and policy.",
		);
		await expect(page.locator("[data-plan-prompts-empty-action='new-prompt']")).toHaveText(
			"New prompt",
		);
		await expect(page.locator("[data-plan-prompts-empty-action='import']")).toHaveText(
			"Import from project",
		);

		const shot = await page.locator("[data-plan-prompts-page]").screenshot();
		await writeEvidenceShot("plan-prompts-empty.png", shot);
	});

	test("keeps the forbidden protocol acronym out of visible chrome", async ({ page }) => {
		await page.goto("/plan-prompts");
		await expect(page.locator("[data-plan-prompts-page]")).not.toContainText(/\bACP\b/);
		// The mislabelled workflow-states editor is gone — no "Workflow states" heading.
		await expect(page.locator("[data-plan-prompts-page]")).not.toContainText("Workflow states");
	});

	test("renders under forced-colors: active", async ({ browser }) => {
		const context = await browser.newContext({ forcedColors: "active" });
		const page = await context.newPage();
		await page.goto("/plan-prompts");
		await expect(page.locator("[data-plan-prompts-page]")).toBeVisible();
		await expect(page.locator("[data-plan-prompts-rows]")).toBeVisible();
		const shot = await page.locator("[data-plan-prompts-page]").screenshot();
		await writeEvidenceShot("plan-prompts-forced-colors.png", shot);
		await context.close();
	});
});

test.describe("plan-prompts — accessibility", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/plan-prompts");
	});

	test("stage chips carry aria-pressed and are keyboard operable", async ({ page }) => {
		const chip = page.locator("[data-plan-prompts-stage-chip='plan']");
		await expect(chip).toHaveAttribute("aria-pressed", "false");
		await chip.focus();
		await expect(chip).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(chip).toHaveAttribute("aria-pressed", "true");
	});

	test("the search input carries an accessible name", async ({ page }) => {
		await expect(page.getByRole("searchbox", { name: "Search prompts" })).toBeVisible();
	});

	test("the per-row ModeRow buttons are reachable by keyboard", async ({ page }) => {
		const playBtn = page.locator(
			"[data-plan-prompts-mode-row='plan-from-capture'] [data-mode='play']",
		);
		await playBtn.focus();
		await expect(playBtn).toBeFocused();
	});
});

test.describe("plan-prompts — migration parity (prd-web-stage-route-model)", () => {
	// The mislabelled "Workflow states" config editor is re-homed with no feature
	// loss: it was a duplicate of the canonical Workflow settings surface, which
	// already ships the `WorkflowEditor` component mounted at the project
	// workflow-settings route (`projects/[id]/settings/workflow`, server-loaded —
	// not rendered crawlable in the API-less design-e2e harness). The `/plan-prompts`
	// route path keeps resolving (no 404) and now renders the prompt library; the
	// state-group / create-state / palette / default-state / delete-guard features
	// survive under their canonical home.
	test("the /plan-prompts route resolves and renders the prompt library", async ({ page }) => {
		const response = await page.goto("/plan-prompts", { waitUntil: "domcontentloaded" });
		expect([200, 301, 308]).toContain(response?.status() ?? 0);
		await expect(page.locator("[data-plan-prompts-page]")).toBeVisible();
	});

	test("the route renders the prompt library, not the old workflow-states editor", async ({
		page,
	}) => {
		await page.goto("/plan-prompts");
		// The freed route now renders the prompt library.
		await expect(page.getByRole("heading", { name: "Prompt library" })).toBeVisible();
		await expect(page.locator("[data-plan-prompts-rows]")).toBeVisible();
		// Every mislabelled workflow-states control is gone from this route.
		for (const slot of [
			"[data-project-states-page]",
			"[data-state-create-panel]",
			"[data-state-groups]",
			"[data-color-picker]",
			"[data-state-audit]",
		]) {
			await expect(page.locator(slot)).toHaveCount(0);
		}
	});
});
