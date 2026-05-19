import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";

async function openBuildGraph(page: Page): Promise<void> {
	await page.goto("/build-graph", { waitUntil: "domcontentloaded" });
	await expect(page.locator("[data-build-graph-ready='true']")).toBeVisible();
	await page.evaluate(async () => {
		await document.fonts.ready;
		await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
	});
}

function channelToLinear(value: number): number {
	const normalized = value / 255;
	return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([red, green, blue]: [number, number, number]): number {
	return (0.2126 * channelToLinear(red)) + (0.7152 * channelToLinear(green)) + (0.0722 * channelToLinear(blue));
}

function contrastRatio(foreground: [number, number, number], background: [number, number, number]): number {
	const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
	const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
	return (lighter + 0.05) / (darker + 0.05);
}

function parseCssColor(value: string): [number, number, number] {
	const rgbMatch = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
	if (rgbMatch) return [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];

	const oklchMatch = value.match(/oklch\(([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/);
	if (!oklchMatch) throw new Error(`Unsupported color format: ${value}`);

	const lightness = oklchMatch[1].endsWith("%") ? Number(oklchMatch[1].slice(0, -1)) / 100 : Number(oklchMatch[1]);
	const chroma = Number(oklchMatch[2]);
	const hue = Number(oklchMatch[3]) * Math.PI / 180;
	const a = Math.cos(hue) * chroma;
	const b = Math.sin(hue) * chroma;
	const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b;
	const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b;
	const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b;
	const l = lPrime ** 3;
	const m = mPrime ** 3;
	const s = sPrime ** 3;
	const linear = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	];
	return linear.map((channel) => {
		const clamped = Math.min(1, Math.max(0, channel));
		return Math.round((clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * (clamped ** (1 / 2.4)) - 0.055) * 255);
	}) as [number, number, number];
}

test.describe("build graph doc search", () => {
	test("renders the documented semantic typography scale", async ({ page }) => {
		await openBuildGraph(page);

		const scale = await page.locator("[data-type-token]").evaluateAll((elements) => Object.fromEntries(elements.map((element) => {
			const style = getComputedStyle(element);
			return [element.getAttribute("data-type-token") ?? "", {
				fontFamily: style.fontFamily,
				fontSize: style.fontSize,
				fontWeight: style.fontWeight,
				letterSpacing: style.letterSpacing,
				lineHeight: style.lineHeight,
			}];
		})));
		const zeroTracking = expect.stringMatching(/^(0px|normal)$/);

		expect(scale.display).toMatchObject({ fontSize: "40px", fontWeight: "600", letterSpacing: zeroTracking, lineHeight: "48px" });
		expect(scale.h1).toMatchObject({ fontSize: "32px", fontWeight: "600", letterSpacing: zeroTracking, lineHeight: "41.6px" });
		expect(scale.h2).toMatchObject({ fontSize: "24px", fontWeight: "600", letterSpacing: zeroTracking, lineHeight: "33.6px" });
		expect(scale.h3).toMatchObject({ fontSize: "20px", fontWeight: "600", letterSpacing: zeroTracking, lineHeight: "28px" });
		expect(scale.body).toMatchObject({ fontSize: "16px", fontWeight: "400", letterSpacing: zeroTracking, lineHeight: "24px" });
		expect(scale.caption).toMatchObject({ fontSize: "14px", fontWeight: "500", letterSpacing: zeroTracking, lineHeight: "19.6px" });
		expect(scale.code).toMatchObject({ fontSize: "14px", fontWeight: "400", letterSpacing: zeroTracking, lineHeight: "22.4px" });
		expect(scale.display.fontFamily).toContain("Inter Variable");
		expect(scale.body.fontFamily).toContain("Inter Variable");
		expect(scale.code.fontFamily).toContain("Fira Code");

		const source = readFileSync("src/routes/build-graph/+page.svelte", "utf8");
		expect(source.match(/\btext-(?:lg|xl|2xl)\b/g) ?? []).toEqual([]);
	});

	test("keeps build graph on the documented spacing scale", async ({ page }) => {
		await openBuildGraph(page);

		const spacing = await page.evaluate(() => {
			const probe = document.createElement("div");
			document.body.appendChild(probe);
			const values: Record<string, string> = {};
			for (const token of ["1", "2", "3", "4", "6", "8", "12", "16"]) {
				probe.className = `p-${token}`;
				values[`space-${token}`] = getComputedStyle(probe).paddingTop;
			}
			probe.remove();
			return values;
		});

		expect(spacing).toEqual({
			"space-1": "4px",
			"space-2": "8px",
			"space-3": "12px",
			"space-4": "16px",
			"space-6": "24px",
			"space-8": "32px",
			"space-12": "48px",
			"space-16": "64px",
		});

		const source = readFileSync("src/routes/build-graph/+page.svelte", "utf8");
		const offScaleUtilities = source.match(/\b(?:[mp][trblxy]?|gap|space-[xy])-([0-9]+|\[[^\]]+\])/g)
			?.filter((token) => !/(?:^|-)0$|(?:^|-)1$|(?:^|-)2$|(?:^|-)3$|(?:^|-)4$|(?:^|-)6$|(?:^|-)8$|(?:^|-)12$|(?:^|-)16$/.test(token));
		expect(offScaleUtilities ?? []).toEqual([]);
	});

	test("keeps operational surfaces flat without nested card clutter", async ({ page }) => {
		await openBuildGraph(page);

		const nestedCardCount = await page.locator("[data-build-graph-search] .bg-card .bg-card").count();
		expect(nestedCardCount).toBe(0);

		const sectionRadii = await page.locator("[data-build-graph-search] section").evaluateAll((elements) =>
			elements.map((element) => Number.parseFloat(getComputedStyle(element).borderRadius)),
		);
		expect(sectionRadii.every((radius) => radius <= 8)).toBe(true);
	});

	test("shows dependency order, run state, blockers, and execution actions", async ({ page }) => {
		await openBuildGraph(page);

		await expect(page.locator("[data-dependency-panel]")).toBeVisible();
		await expect(page.locator("[data-run-state]")).toContainText("run:ready");
		await expect(page.locator("[data-dependency-node]")).toHaveCount(4);
		await expect(page.locator("[data-dependency-order]").first()).toContainText("1");
		await expect(page.locator("[data-dependency-node][data-task-id='task-build'] [data-dependency-chip]")).toContainText([
			"task-plan",
			"doc-kernel-notes",
		]);
		await expect(page.locator("[data-dependency-node][data-task-id='task-build'] [data-blocker-row]")).toContainText("Waiting for approval");
		await expect(page.locator("[data-feedback-row]").first()).toContainText("Run state loaded");

		await page.locator("[data-action-dispatch]").click();
		await expect(page.locator("[data-run-state]")).toContainText("run:running");
		await expect(page.locator("[data-dependency-node][data-task-id='task-build'] [data-node-status]")).toContainText("running");
		await expect(page.locator("[data-feedback-row]").first()).toContainText("dispatch accepted");

		await page.locator("[data-action-cancel]").click();
		await expect(page.locator("[data-run-state]")).toContainText("run:cancelled");
		await expect(page.locator("[data-feedback-row]").first()).toContainText("cancel requested");
	});

	test("renders scoped doc search results with snippets, filters, and graph actions", async ({ page }) => {
		await openBuildGraph(page);

		await expect(page.locator("[data-build-graph-search]")).toBeVisible();
		await expect(page.locator("[data-doc-search-input]")).toHaveValue("kernel");
		await expect(page.locator("[data-doc-search-filters]")).toContainText("Project");
		await expect(page.locator("[data-doc-search-filters]")).toContainText("Task");
		await expect(page.locator("[data-doc-search-filters]")).toContainText("Run");
		await expect(page.locator("[data-doc-search-filters]")).toContainText("Document type");
		await expect(page.locator("[data-doc-search-filters]")).toContainText("Owner");
		await expect(page.locator("[data-doc-search-filters]")).toContainText("Attachments");

		const firstResult = page.locator("[data-doc-result]").first();
		await expect(firstResult.locator("[data-doc-snippet]")).toContainText("Planning context");
		await expect(firstResult.locator("[data-doc-type]")).toContainText("decision");
		await expect(firstResult.locator("[data-doc-scope]")).toContainText("Project docs");
		await expect(firstResult.locator("[data-updated-at]")).toContainText("2026-05-18");
		await expect(firstResult.locator("[data-graph-counts]")).toContainText("backlinks");

		await firstResult.locator("[data-action-context]").click();
		await expect(page.locator("[data-selected-context]")).toContainText("doc-kernel-notes");
		await firstResult.locator("[data-action-copy]").click();
		await expect(page.locator("[data-copied-link]")).toContainText("/docs/doc-kernel-notes");
		await firstResult.locator("[data-action-reveal]").click();
		await expect(page.locator("[data-tree-reveal]")).toContainText("doc-kernel-notes");
	});

	test("captures spec-backed docs collaboration states", async ({ page }) => {
		await openBuildGraph(page);

		await expect(page.locator("[data-doc-collab-fixture]")).toBeVisible();
		await expect(page.locator("[data-connected-users]")).toContainText("mkh editing intro");
		await expect(page.locator("[data-connected-users]")).toContainText("agent-runner resolving refs");
		await expect(page.locator("[data-cursor-overlays]")).toContainText("paragraph 2");
		await expect(page.locator("[data-collab-connection-state]")).toContainText("connected");
		await expect(page.locator("[data-collab-save-state]")).toContainText("last saved");
		await expect(page.locator("[data-collab-risk-state]")).toContainText("Offline edits");
		await expect(page.locator("[data-collab-retry-save]")).toBeVisible();
		await expect(page.locator("[data-collab-history-context]")).toContainText("conflict-safe merge");
		await expect(page.locator("[data-collab-flag-off]")).toContainText("single-user save remains available");
	});

	test("previews document export package and conflict-safe import", async ({ page }) => {
		await openBuildGraph(page);

		await expect(page.locator("[data-doc-import-export-workflow]")).toBeVisible();
		await expect(page.locator("[data-doc-export-panel]")).toContainText("Package manifest preview");
		await expect(page.locator("[data-export-scope]")).toHaveValue("subtree");
		await expect(page.locator("[data-export-manifest]")).toContainText("manifest:v1");
		await expect(page.locator("[data-export-manifest]")).toContainText("docs:4");
		await expect(page.locator("[data-export-body]")).toContainText("markdown body bundle");
		await expect(page.locator("[data-export-frontmatter]")).toContainText("parentId");
		await expect(page.locator("[data-export-attachments]")).toContainText("handoff-review.txt");
		await expect(page.locator("[data-export-link-map]")).toContainText("doc-kernel-notes -> doc-filter-map");
		await expect(page.locator("[data-export-trace-refs]")).toContainText("trace-e2e-proof");
		await expect(page.locator("[data-export-metadata-policy]")).toContainText("Internal-only metadata excluded by default");

		await page.locator("[data-export-scope]").selectOption("single");
		await expect(page.locator("[data-export-manifest]")).toContainText("docs:1");
		await page.locator("[data-export-scope]").selectOption("subtree");
		await page.locator("[data-attach-export-artifact]").click();
		await expect(page.locator("[data-export-artifact-status]")).toContainText("attached:review handoff artifact");

		await expect(page.locator("[data-doc-import-preview]")).toContainText("Conflict-safe destination");
		await expect(page.locator("[data-import-destination]")).toContainText("Imported handoff");
		await expect(page.locator("[data-import-conflict-row]")).toHaveCount(2);
		await expect(page.locator("[data-import-conflict-row]").first()).toContainText("rename incoming");
		await expect(page.locator("[data-missing-attachment-row]")).toContainText("blocked until replacement mapped");
		await expect(page.locator("[data-remapped-link-row]").first()).toContainText("imported/doc-kernel-notes");
		await expect(page.locator("[data-import-trace-ref]").first()).toContainText("preserved");
		await expect(page.locator("[data-import-trace-ref]").last()).toContainText("remapped");
		await expect(page.locator("[data-source-import-event]")).toContainText("source import event");
		await expect(page.locator("[data-import-overwrite-guard]")).toContainText("No overwrite until conflict preview accepted");
	});

	test("shows document trash impact, restore destination, and permanent delete guard", async ({ page }) => {
		await openBuildGraph(page);

		await expect(page.locator("[data-doc-trash-workflow]")).toBeVisible();
		await expect(page.locator("[data-normal-doc-tree]")).toContainText("Release readiness");
		await expect(page.locator("[data-trash-view]")).toContainText("Legacy runbook");
		await expect(page.locator("[data-delete-impact-preview]")).toContainText("Release readiness");
		await expect(page.locator("[data-impact-children]")).toContainText("QA checklist");
		await expect(page.locator("[data-impact-backlinks]")).toContainText("Ship review");
		await expect(page.locator("[data-impact-attachments]")).toContainText("coverage-export.json");
		await expect(page.locator("[data-impact-context-bundles]")).toContainText("ctx-operator-brief");
		await expect(page.locator("[data-impact-artifacts]")).toContainText("artifact-review-log");

		await page.locator("[data-soft-delete-doc]").click();
		await expect(page.locator("[data-active-doc-row][data-doc-id='doc-release-parent']")).toHaveCount(0);
		await expect(page.locator("[data-trash-doc-row][data-doc-id='doc-release-parent']")).toBeVisible();
		await expect(page.locator("[data-trash-state]")).toContainText("trash");

		await page.locator("[data-restore-doc]").click();
		await expect(page.locator("[data-restore-status]")).toContainText("Release readiness restored to Build graph");
		await expect(page.locator("[data-active-doc-row][data-doc-id='doc-release-parent']")).toBeVisible();

		await page.locator("[data-trash-doc-row][data-doc-id='doc-legacy-runbook'] [data-select-trash-doc]").click();
		await expect(page.locator("[data-restore-parent]").filter({ hasText: "Original parent missing" })).toBeVisible();
		await expect(page.locator("[data-restore-destination-field]")).toContainText("New destination");
		await page.locator("[data-permanent-delete-doc]").click();
		await expect(page.locator("[data-permanent-delete-guard]")).toContainText("requires Knowledge admin permission");
		await expect(page.locator("[data-permanent-delete-guard]")).toContainText("typed document title confirmation");
		await page.locator("[data-restore-destination]").fill("Recovered docs");
		await page.locator("[data-restore-doc]").click();
		await expect(page.locator("[data-restore-status]")).toContainText("Legacy runbook restored to Recovered docs");
	});

	test("filters by owner and attachment state without leaking unrelated rows", async ({ page }) => {
		await openBuildGraph(page);

		await page.locator("[data-filter-owner]").selectOption("ada");
		await expect(page.locator("[data-result-count]")).toContainText("1 visible");
		await expect(page.locator("[data-doc-results], [data-doc-search-results]")).toContainText("Filter map");
		await expect(page.locator("[data-doc-search-results]")).not.toContainText("Kernel search notes");

		await page.locator("[data-filter-attachments]").selectOption("with attachments");
		await expect(page.locator("[data-result-count]")).toContainText("0 visible");
	});

	test("renders spec-backed form field variants and validation states", async ({ page }) => {
		await openBuildGraph(page);

		await expect(page.locator("[data-form-field-fixture]")).toBeVisible();
		for (const type of ["text", "email", "password", "number", "url", "tel", "search", "date", "time", "datetime-local", "textarea"]) {
			expect(await page.locator(`[data-form-field][data-field-type='${type}']`).count(), type).toBeGreaterThanOrEqual(1);
		}

		await expect(page.locator("[data-form-field][data-field-layout='inline']")).toBeVisible();
		const inlineLabelWidth = await page.locator("[data-form-field][data-field-layout='inline'] > span").first().evaluate((element) => element.getBoundingClientRect().width);
		expect(inlineLabelWidth).toBeLessThanOrEqual(200);

		const errorField = page.locator("[data-form-field][data-field-state='error']");
		await expect(errorField.locator("[data-form-control]")).toHaveAttribute("aria-invalid", "true");
		await expect(errorField.locator("[data-field-message]")).toContainText("complete email");

		const successField = page.locator("[data-form-field][data-field-state='success']");
		await expect(successField.locator("[data-field-message]")).toContainText("✓");
		await expect(successField.locator("[data-field-message]")).toContainText("Limit accepted");

		const disabledField = page.locator("[data-form-field][data-field-state='disabled'] [data-form-control]");
		await expect(disabledField).toBeDisabled();
		await expect(disabledField).toHaveCSS("cursor", "not-allowed");

		const textarea = page.locator("[data-form-field][data-field-type='textarea'] textarea");
		await expect(textarea).toHaveAttribute("maxlength", "180");
		await expect(textarea).toHaveAttribute("data-character-counter", "64/180");
		await expect(page.locator("#review-note-counter")).toContainText("64/180 characters");
	});

	test("keeps dependency execution layout inside mobile viewport", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openBuildGraph(page);

		const overflow = await page.locator("[data-build-graph-search]").evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
		await expect(page.locator("[data-run-actions]")).toBeVisible();
	});

	test("keeps build graph text, status, and focus treatments at WCAG AA contrast", async ({ page }) => {
		await openBuildGraph(page);

		const samples = await page.locator("[data-contrast-sample]").evaluateAll((elements) => elements.map((element) => {
			function isTransparentColor(background: string): boolean {
				if (background === "transparent" || background === "rgba(0, 0, 0, 0)") return true;
				const rgbaAlpha = background.match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/)?.[1];
				if (rgbaAlpha !== undefined && Number(rgbaAlpha) < 1) return true;
				const colorFunctionAlpha = background.match(/\/\s*([\d.]+)\)$/)?.[1];
				return colorFunctionAlpha !== undefined && Number(colorFunctionAlpha) < 1;
			}

			function effectiveBackground(target: Element): string {
				let current: Element | null = target;
				while (current) {
					const background = getComputedStyle(current).backgroundColor;
					if (!isTransparentColor(background)) return background;
					current = current.parentElement;
				}
				return getComputedStyle(document.body).backgroundColor;
			}

			const style = getComputedStyle(element);
			return {
				text: element.textContent?.trim() ?? "",
				color: style.color,
				background: effectiveBackground(element),
			};
		}));

		for (const sample of samples) {
			expect(contrastRatio(parseCssColor(sample.color), parseCssColor(sample.background)), sample.text).toBeGreaterThanOrEqual(4.5);
		}

		await page.locator("[data-action-dispatch]").focus();
		const focusRing = await page.locator("[data-action-dispatch]").evaluate((element) => getComputedStyle(element).boxShadow);
		expect(focusRing).not.toBe("none");
		await expect(page.locator("[data-node-status]").first()).toContainText(/✓|●|!|○/);
	});

	test("empty-state fixtures render with icon, headline, description, and actions", async ({ page }) => {
		await openBuildGraph(page);

		const primary = page.locator("[data-empty-state-primary]");
		await expect(primary).toBeVisible();
		await expect(primary).toHaveAttribute("role", "status");
		await expect(primary.locator("[data-empty-state-icon]")).toBeVisible();
		await expect(primary).toContainText("No tasks linked");
		await expect(primary).toContainText("Link a task to surface dependencies");
		await expect(page.locator("[data-empty-state-action='primary']")).toBeVisible();
		await expect(page.locator("[data-empty-state-action='secondary']")).toBeVisible();

		const secondary = page.locator("[data-empty-state-secondary]");
		await expect(secondary).toContainText("Filter has no matches");
		await expect(page.locator("[data-empty-state-clear-filter]")).toBeVisible();
	});
});
