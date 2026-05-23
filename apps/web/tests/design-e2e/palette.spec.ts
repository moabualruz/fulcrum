import { expect, test } from "@playwright/test";
import { captureScreenshot, DESKTOP_VIEWPORT } from "../../scripts/run-design-e2e.ts";

/**
 * Rendered OD-fidelity gate for the one canonical `⌘K` command palette
 * (`prd-web-command-palette-od-fidelity`).
 *
 * Source: OD `palette.html` + `index.html`; `IA-MAP.md §6` ("Command palette
 * (⌘K) contents"), `DESIGN.md §4.12`, `design-alignment/shell.md §palette.html`.
 *
 * The palette is a shell overlay — there is no `/palette` route. It is
 * `CommandPalette.svelte`, mounted once in `+layout.svelte`, opened with `⌘K`
 * from any route, and composed from the `@fulcrum/ui-kit` `command-palette`
 * primitive (Root / Input / List / Item / Group). The two former preview
 * routes (`/palette`, `/palette-cmd-k`) are retired and 308-redirect to `/`.
 *
 * This spec drives the PRODUCTION shell: it opens the real palette and proves
 * the IA-MAP §6 section ordering, the active-context scope chip, keyboard
 * navigation, and the Step-actions section conditionality against the rendered
 * DOM — not source.
 *
 * States covered: `populated` (the rendered palette with sections) and
 * `forced-colors` (Windows high-contrast emulation — the palette stays usable).
 */

const PALETTE = "[data-command-palette]";
const SECTION = "[data-palette-section]";
const ITEM = "[data-command-palette-item]";

/** Open the canonical palette on the production shell via the `⌘K` keystroke. */
async function openPalette(page: import("@playwright/test").Page, path = "/") {
	await page.setViewportSize({ ...DESKTOP_VIEWPORT });
	await page.goto(path, { waitUntil: "load" });
	// Wait for the shell to hydrate so the global `⌘K` keydown handler is live
	// before the keystroke is sent (the layout marks `body[data-fulcrum-hydrated]`).
	await expect(page.locator("body[data-fulcrum-hydrated='true']")).toHaveCount(1);
	await page.keyboard.press("ControlOrMeta+k");
	await expect(page.locator(`${PALETTE}[data-state="open"]`)).toHaveCount(1);
}

test.describe("command palette — OD section ordering", () => {
	test("⌘K opens the one canonical palette from any route", async ({ page }) => {
		await openPalette(page, "/");
		await expect(page.locator("[data-command-palette-input]")).toBeVisible();

		// Opens from a non-root production route too — one palette, every frame.
		await page.keyboard.press("Escape");
		await openPalette(page, "/runs");
		await expect(page.locator("[data-command-palette-input]")).toBeVisible();
	});

	test("renders the IA-MAP §6 sections in canonical order", async ({ page }) => {
		await openPalette(page, "/");

		const sectionIds = await page.locator(SECTION).evaluateAll((nodes) =>
			nodes.map((node) => node.getAttribute("data-palette-section")),
		);
		// Step actions is absent without a Step in scope; the remaining sections
		// must keep the IA-MAP §6 relative order.
		const canonical = [
			"recent",
			"stage-nav",
			"project-switcher",
			"step-actions",
			"federated-search",
			"settings-search",
			"workspace-theme",
			"help",
		];
		const present = sectionIds.filter((id): id is string => id !== null);
		const ranked = [...present].sort(
			(a, b) => canonical.indexOf(a) - canonical.indexOf(b),
		);
		expect(present).toEqual(ranked);
		expect(present).toContain("stage-nav");
		expect(present).toContain("workspace-theme");
		expect(present).not.toContain("step-actions");
	});

	test("section headings use the IA-MAP §6 locked labels", async ({ page }) => {
		await openPalette(page, "/");
		const headings = await page
			.locator("[data-slot='command-palette-group-heading']")
			.allInnerTexts();
		expect(headings).toContain("Workflow stage nav");
		expect(headings).toContain("Project switcher");
		expect(headings).toContain("Workspace + theme");
		expect(headings).toContain("Help");

		// Rendered-fidelity evidence: capture the open palette while its content
		// is provably on screen (the scope chip + sections are visible above).
		// `captureScreenshot` writes a persistent PNG under the harness's
		// SCREENSHOT_DIR so the rendered palette is inspectable after the run.
		await expect(page.locator("[data-palette-scope-chip]")).toBeVisible();
		await captureScreenshot(page, "command-palette-sections");
	});

	test("the Workflow stage nav lists Go to Capture…Operate", async ({ page }) => {
		await openPalette(page, "/");
		const stageRows = page.locator("[data-palette-row-section='stage-nav']");
		await expect(stageRows).toHaveCount(6);
		const labels = await stageRows.allInnerTexts();
		const joined = labels.join(" | ");
		for (const stage of ["Capture", "Plan", "Build", "Review", "Ship", "Operate"]) {
			expect(joined).toContain(`Go to ${stage}`);
		}
	});

	test("shows an active-context scope chip in the header", async ({ page }) => {
		await openPalette(page, "/");
		const chip = page.locator("[data-palette-scope-chip]");
		await expect(chip).toBeVisible();
		await expect(chip).toContainText("In scope");
		await expect(page.locator("[data-palette-scope-value]")).not.toBeEmpty();
	});

	test("the scope chip is Scope-aware — it changes with the active stage", async ({ page }) => {
		await openPalette(page, "/");
		const captureChip = (await page.locator("[data-palette-scope-value]").innerText()).trim();
		await page.keyboard.press("Escape");

		await openPalette(page, "/runs");
		const runsChip = (await page.locator("[data-palette-scope-value]").innerText()).trim();
		expect(runsChip).not.toBe(captureChip);
	});
});

test.describe("command palette — keyboard navigation", () => {
	test("Arrow keys move selection and Esc closes the palette", async ({ page }) => {
		await openPalette(page, "/");
		await page.keyboard.press("ArrowDown");
		const selected = page.locator(`${ITEM}[data-selected]`);
		await expect(selected.first()).toBeVisible();

		await page.keyboard.press("Escape");
		await expect(page.locator(`${PALETTE}[data-state="open"]`)).toHaveCount(0);
	});

	test("typing filters the rows down to matches", async ({ page }) => {
		await openPalette(page, "/");
		await page.locator("[data-command-palette-input]").fill("Operate");
		const visibleRows = page.locator(ITEM);
		await expect(visibleRows.first()).toBeVisible();
		const texts = (await visibleRows.allInnerTexts()).join(" | ");
		expect(texts).toContain("Operate");
	});
});

test.describe("command palette — Step actions (IA-MAP §6.4)", () => {
	test("the Step-actions section appears only when a Step is in scope", async ({ page }) => {
		await openPalette(page, "/plan-session");
		await expect(page.locator("[data-palette-section='step-actions']")).toHaveCount(0);
		await page.keyboard.press("Escape");

		// A Step-bearing surface scopes the palette via `fulcrum:palette-step-scope`.
		await page.evaluate(() => {
			window.dispatchEvent(
				new CustomEvent("fulcrum:palette-step-scope", {
					detail: {
						stepId: "AUTH-3",
						kind: "task-card",
						title: "Persist issuance row per kid",
						traceId: "tr_8f29a4c1b3e0d5f7",
						index: 3,
						total: 8,
					},
				}),
			);
		});
		await page.keyboard.press("ControlOrMeta+k");
		await expect(page.locator(`${PALETTE}[data-state="open"]`)).toHaveCount(1);

		const stepSection = page.locator("[data-palette-section='step-actions']");
		await expect(stepSection).toHaveCount(1);
		const stepRows = page.locator("[data-palette-row-section='step-actions']");
		const stepText = (await stepRows.allInnerTexts()).join(" | ");
		expect(stepText).toContain("Play step 3");
		expect(stepText).toContain("Discuss step 3");
		expect(stepText).toContain("Open in AI Assist drawer");
		expect(stepText).toContain("Copy trace ID");
		expect(stepText).toContain("Open in audit");

		await captureScreenshot(page, "command-palette-step-actions");
	});
});

test.describe("command palette — retired preview routes", () => {
	test("the former preview routes redirect to the workspace root", async ({ page }) => {
		for (const path of ["/palette", "/palette-cmd-k"]) {
			const response = await page.goto(path, { waitUntil: "load" });
			expect(response?.status() ?? 200).toBeLessThan(400);
			expect(new URL(page.url()).pathname).toBe("/");
		}
	});
});

test.describe("command palette — forced-colors", () => {
	test("the palette stays usable under Windows high-contrast emulation", async ({ page }) => {
		await page.emulateMedia({ forcedColors: "active" });
		await openPalette(page, "/");
		await expect(page.locator("[data-command-palette-input]")).toBeVisible();
		await expect(page.locator(SECTION).first()).toBeVisible();
		await test.info().attach("command-palette-forced-colors", {
			body: await page.screenshot({ fullPage: true }),
			contentType: "image/png",
		});
	});
});
