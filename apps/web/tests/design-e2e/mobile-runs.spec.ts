import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Design-e2e fidelity coverage for the OD `mobile-runs.html` surface — the
 * mobile Build runs feed plus the bottom-sheet run detail.
 *
 * IA-MAP.md §617 (six-icon bottom tab bar), DESIGN.md §4.7 (mobile sheet —
 * full width × 60vh draggable), DESIGN.md §8 (inline permission prompts —
 * one button per option), DESIGN.md §4.10 (trace badge), DESIGN.md §3.1
 * (container queries — no horizontal overflow at 390px).
 *
 * The route renders the mobile stage shell: a 390px phone frame with the
 * `scope-m` header, a scrollable run feed, a draggable bottom-sheet run
 * detail, and the six-stage bottom tab bar.
 */

async function writeEvidenceShot(name: string, body: Buffer): Promise<void> {
	const dir = process.env.FULCRUM_DESIGN_EVIDENCE_DIR;
	if (!dir) return;
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, name), body);
}

async function gotoMobileRuns(page: Page): Promise<void> {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/mobile-runs");
}

test.describe("mobile-runs — mobile Build runs OD fidelity", () => {
	test("renders the OD scope-m header: crumb, run count, trace badge, AI Assist toggle", async ({
		page,
	}) => {
		await gotoMobileRuns(page);

		const root = page.locator("[data-mobile-runs]");
		await expect(root).toBeVisible();
		await expect(root).toHaveAttribute("data-state", "populated");
		// The feed reads the same canonical runs data layer as desktop build-runs.
		await expect(root).toHaveAttribute(
			"data-canonical-runs-source",
			"apps/web/src/routes/build-runs/+page.svelte#feedRuns",
		);

		await expect(page.locator("[data-mobile-runs-crumb]")).toContainText("build · runs · live");
		await expect(page.locator("[data-mobile-runs-count]")).toContainText("6 runs");
		await expect(
			page.locator("[data-mobile-runs-header] [data-slot='trace-chip']"),
		).toBeVisible();
		await expect(page.locator("[data-mobile-runs-assist]")).toBeVisible();
	});

	test("renders the scrollable feed with the horizontal filter chip row and canonical run identities", async ({
		page,
	}) => {
		await gotoMobileRuns(page);

		for (const chip of ["live", "mine", "auth", "failing", "today"]) {
			await expect(page.locator(`[data-mobile-runs-filter='${chip}']`)).toBeVisible();
		}
		await expect(page.locator("[data-mobile-runs-filter='live']")).toHaveAttribute(
			"data-active",
			"true",
		);

		const rows = page.locator("[data-mobile-run-row]");
		await expect(rows).toHaveCount(6);

		const firstRow = page.locator("[data-mobile-run-row][data-run-id='run_8f29a4c']");
		await expect(firstRow.locator("[data-slot='run-feed-item']")).toBeVisible();
		await expect(firstRow.locator("[data-slot='status-badge']")).toBeVisible();
		await expect(firstRow).toContainText("Persist issuance row per kid");
		await expect(firstRow.locator("[data-mobile-run-meta]")).toContainText(
			"AUTH-43 · opus-4.7 · run_8f29a4c · step 3/8",
		);
		await expect(firstRow.locator("[data-mobile-run-sparkline] [data-spark-bar]")).toHaveCount(7);

		await expect(
			page.locator("[data-mobile-run-row][data-run-id='run_56e3d12']"),
		).toContainText("Dedupe trace-id propagation");
	});

	test("clicking a run row draws up the bottom sheet over a backdrop", async ({ page }) => {
		await gotoMobileRuns(page);

		// OD `mobile-runs.html` renders the sheet open on the first run by default.
		const sheet = page.locator("[data-mobile-runs-sheet]");
		await expect(sheet).toBeVisible();
		await expect(page.locator("[data-mobile-runs-sheet-backdrop]")).toBeVisible();
		await expect(sheet).toHaveAttribute("data-draggable", "true");
		await expect(page.locator("#mobile-runs-sheet-title")).toContainText(
			"Persist issuance row per kid",
		);

		// Selecting a different run swaps the sheet content.
		await page.locator("[data-mobile-run-row][data-run-id='run_56e3d12']").click();
		await expect(page.locator("#mobile-runs-sheet-title")).toContainText(
			"Dedupe trace-id propagation",
		);
	});

	test("the sheet grabber is draggable and resizes the sheet height", async ({ page }) => {
		await gotoMobileRuns(page);

		const sheet = page.locator("[data-mobile-runs-sheet]");
		const startVh = Number(await sheet.getAttribute("data-sheet-height-vh"));
		expect(startVh).toBeGreaterThanOrEqual(55);
		expect(startVh).toBeLessThanOrEqual(65);

		const grabber = page.locator("[data-mobile-runs-sheet-grabber]");
		await expect(grabber).toHaveAttribute("role", "slider");
		const box = await grabber.boundingBox();
		expect(box).not.toBeNull();

		await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
		await page.mouse.down();
		await page.mouse.move(box!.x + box!.width / 2, 120, { steps: 8 });
		await page.mouse.up();

		const draggedVh = Number(await sheet.getAttribute("data-sheet-height-vh"));
		expect(draggedVh).toBeGreaterThan(startVh);
	});

	test("the sheet shows an inline permission prompt with a one-button-per-option sticky action bar", async ({
		page,
	}) => {
		await gotoMobileRuns(page);

		const prompt = page.locator("[data-mobile-runs-permission]");
		await expect(prompt).toBeVisible();
		await expect(prompt).toContainText("shell.run needs approval");
		await expect(page.locator("[data-mobile-runs-permission-command]")).toContainText(
			"prisma migrate dev",
		);

		const actions = page.locator("[data-mobile-runs-sheet-actions]");
		await expect(actions).toBeVisible();
		await expect(page.locator("[data-mobile-runs-permission-option='deny']")).toBeVisible();
		await expect(page.locator("[data-mobile-runs-permission-option='allow-once']")).toBeVisible();
		await expect(
			page.locator("[data-mobile-runs-permission-option='allow-continue']"),
		).toBeVisible();

		await page.locator("[data-mobile-runs-permission-option='allow-once']").click();
		await expect(prompt).toHaveAttribute("data-resolved", "true");
		await expect(page.locator("[data-mobile-runs-permission-decision]")).toContainText(
			"allow-once",
		);
	});

	test("the sheet body renders OD tool-call cards with an inline diff", async ({ page }) => {
		await gotoMobileRuns(page);

		await expect(page.locator("[data-mobile-runs-tool-card='edit_file']")).toHaveAttribute(
			"data-open",
			"true",
		);
		await expect(
			page.locator("[data-mobile-runs-tool-card='edit_file'] [data-mobile-runs-diff-line='add']").first(),
		).toBeVisible();
		await expect(page.locator("[data-mobile-runs-tool-card='shell.run']")).toBeVisible();
	});

	test("renders the six-stage bottom tab bar with Build current", async ({ page }) => {
		await gotoMobileRuns(page);

		await expect(page.locator("[data-mobile-runs-tab-bar]")).toBeVisible();
		for (const stage of ["capture", "plan", "build", "review", "ship", "operate"]) {
			await expect(page.locator(`[data-mobile-stage-tab='${stage}']`)).toBeVisible();
		}
		await expect(page.locator("[data-mobile-stage-tab='build']")).toHaveAttribute(
			"aria-current",
			"page",
		);
	});

	test("has no horizontal overflow at 390px", async ({ page }) => {
		await gotoMobileRuns(page);

		const rootOverflow = await page
			.locator("[data-mobile-runs]")
			.evaluate((node) => Math.ceil(node.scrollWidth - node.clientWidth));
		const frameOverflow = await page
			.locator("[data-mobile-runs-frame]")
			.evaluate((node) => Math.ceil(node.scrollWidth - node.clientWidth));
		const sheetOverflow = await page
			.locator("[data-mobile-runs-sheet]")
			.evaluate((node) => Math.ceil(node.scrollWidth - node.clientWidth));

		expect(rootOverflow).toBeLessThanOrEqual(1);
		expect(frameOverflow).toBeLessThanOrEqual(1);
		expect(sheetOverflow).toBeLessThanOrEqual(1);
	});

	test("empty state uses the COPY.md Build runs feed copy", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/mobile-runs?state=empty");

		await expect(page.locator("[data-mobile-runs]")).toHaveAttribute("data-state", "empty");
		await expect(page.locator("[data-mobile-runs-count]")).toContainText("0 runs");
		const empty = page.locator("[data-mobile-runs-empty]");
		await expect(empty).toContainText("No runs yet in this project.");
		await expect(empty).toContainText("Or press ▶ Play on any task.");
		await expect(page.getByRole("button", { name: "Dispatch first run" })).toBeVisible();
	});

	test("captures rendered populated and empty mobile evidence", async ({ page }) => {
		await gotoMobileRuns(page);
		await writeEvidenceShot(
			"mobile-runs-populated.png",
			await page.locator("[data-mobile-runs-frame]").screenshot(),
		);

		await page.goto("/mobile-runs?state=empty");
		await writeEvidenceShot(
			"mobile-runs-empty.png",
			await page.locator("[data-mobile-runs-frame]").screenshot(),
		);
	});
});
