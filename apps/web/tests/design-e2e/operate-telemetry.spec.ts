import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Rendered OD-fidelity proof for `prd-web-operate-telemetry-od-fidelity`.
 *
 * Drives the production `/operate-telemetry` route and asserts it matches OD
 * `operate-telemetry.html` while resolving the "Telemetry" name overload
 * (design-alignment/operate.md §operate-telemetry.html). The route hosts two
 * disambiguated sub-views selected by `?view=`:
 *
 *  - `?view=observability` (default) — the OD metrics dashboard: a 4-stat
 *    strip, a p50/p99 step-latency LayerChart line chart, an error-rate-by-
 *    surface table, a runs-by-step LayerChart bar chart on the canonical
 *    six-stage spine, and a local-resources table, with a range selector
 *    (1h/6h/24h/7d/30d) and the universal mode-row.
 *  - `?view=settings` — the COPY.md §13 opt-in 3-state privacy control
 *    (On/Anonymous only/Off), first-run prompt, `DO_NOT_TRACK` handling, and
 *    the opt-in audit trail (DESIGN.md §11 "No telemetry without opt-in").
 *
 * Design refs: IA-MAP.md §2.6 operate/telemetry · COPY.md §13 telemetry
 * opt-in · DESIGN.md §11 no telemetry without opt-in · DESIGN.md §sources
 * 04-observability-trace. States: `populated`, `error`.
 */

/** The production observability dashboard sub-view (route default). */
const DASHBOARD_ROUTE = "/operate-telemetry";
/** The production telemetry-settings sub-view. */
const SETTINGS_ROUTE = "/operate-telemetry?view=settings";
/** The metrics-load failure scene. */
const DASHBOARD_ERROR = "/operate-telemetry?state=error";
/** The `DO_NOT_TRACK=1` settings scene. */
const SETTINGS_DNT = "/operate-telemetry?view=settings&dnt=1";

/** Persist a rendered screenshot to the recovery-packet evidence dir. */
async function writeEvidenceShot(name: string, body: Buffer): Promise<void> {
	const dir = process.env.FULCRUM_DESIGN_EVIDENCE_DIR;
	if (!dir) return;
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, name), body);
}

test.describe("operate-telemetry — name overload resolved", () => {
	test("a two-tab strip splits Observability from Telemetry settings", async ({ page }) => {
		await page.goto(DASHBOARD_ROUTE);

		const tabs = page.locator("[data-telemetry-view-tabs]");
		await expect(tabs).toBeVisible();
		await expect(tabs).toHaveAttribute("role", "tablist");
		await expect(page.locator("[data-telemetry-view-tab='observability']")).toContainText(
			"Observability",
		);
		await expect(page.locator("[data-telemetry-view-tab='settings']")).toContainText(
			"Telemetry settings",
		);

		// The default sub-view is the OD observability dashboard.
		await expect(page.locator("[data-operate-telemetry]")).toHaveAttribute(
			"data-view",
			"observability",
		);
		await expect(page.locator("[data-telemetry-view-tab='observability']")).toHaveAttribute(
			"aria-current",
			"page",
		);

		// The settings sub-view is a distinct, non-conflicting route.
		await page.goto(SETTINGS_ROUTE);
		await expect(page.locator("[data-operate-telemetry]")).toHaveAttribute(
			"data-view",
			"settings",
		);
		await expect(page.locator("[data-telemetry-view-tab='settings']")).toHaveAttribute(
			"aria-current",
			"page",
		);
	});
});

test.describe("operate-telemetry — observability dashboard (OD operate-telemetry.html)", () => {
	test("4-stat strip renders the OD metrics", async ({ page }) => {
		await page.goto(DASHBOARD_ROUTE);

		await expect(page.locator("[data-telemetry-title]")).toContainText("Telemetry");
		await expect(page.locator("[data-telemetry-count]")).toContainText("last 24h");
		await expect(page.locator("[data-telemetry-count]")).toContainText("14k events");
		await expect(page.locator("[data-telemetry-count]")).toContainText("0 drops");

		const strip = page.locator("[data-telemetry-stats]");
		await expect(strip).toBeVisible();
		for (const stat of ["agent-runs", "p50-latency", "p99-latency", "error-rate"]) {
			await expect(page.locator(`[data-telemetry-stat='${stat}']`)).toBeVisible();
		}
		await expect(page.locator("[data-telemetry-stat='agent-runs']")).toContainText("428");
		await expect(page.locator("[data-telemetry-stat='p50-latency']")).toContainText("1.84s");
		await expect(page.locator("[data-telemetry-stat='p99-latency']")).toContainText("12.7s");
		await expect(page.locator("[data-telemetry-stat='error-rate']")).toContainText("0.42%");

		const shot = await page.locator("[data-route='operate-telemetry']").screenshot();
		await writeEvidenceShot("operate-telemetry-populated.png", shot);
	});

	test("p50/p99 line chart, error-rate table, runs-by-step bars, local resources render", async ({
		page,
	}) => {
		await page.goto(DASHBOARD_ROUTE);

		// p50/p99 step-latency line chart — a LayerChart, not hand-rolled SVG.
		await expect(page.locator("[data-telemetry-chart='step-latency']")).toContainText(
			"Step latency (p50 / p99)",
		);
		const latencyChart = page.locator("[data-telemetry-latency-chart]");
		await expect(latencyChart).toBeVisible();
		// LayerChart renders a layercake SVG layout — proves a charting library,
		// not a hand-rolled single SVG path element.
		await expect(latencyChart.locator("svg.layercake-layout-svg").first()).toBeVisible();

		// Error-rate-by-surface table — web shell / CLI / TUI / mobile / API.
		const errorTable = page.locator("[data-telemetry-error-table]");
		await expect(errorTable).toBeVisible();
		for (const surface of ["web shell", "CLI", "TUI", "mobile", "API"]) {
			await expect(
				page.locator(`[data-telemetry-surface-row='${surface}']`),
			).toBeVisible();
		}

		// Runs-by-step bar chart on the canonical six-stage spine.
		await expect(page.locator("[data-telemetry-chart='runs-by-step']")).toContainText(
			"Runs by step",
		);
		await expect(page.locator("[data-telemetry-stage-spine]")).toHaveText(
			"capture → plan → build → review → ship → operate",
		);
		const runsChart = page.locator("[data-telemetry-runs-chart]");
		await expect(runsChart).toBeVisible();
		await expect(runsChart.locator("svg.layercake-layout-svg").first()).toBeVisible();

		// Local-resources table.
		const resources = page.locator("[data-telemetry-resources-table]");
		await expect(resources).toBeVisible();
		for (const res of ["cpu", "memory", "disk", "mcp-rtt", "cold-boot"]) {
			await expect(
				page.locator(`[data-telemetry-resource-row='${res}']`),
			).toBeVisible();
		}
	});

	test("the dashboard header carries a mode-row routed via operate.diagnose", async ({
		page,
	}) => {
		await page.goto(DASHBOARD_ROUTE);
		const modeRow = page.locator("[data-telemetry-mode-row]");
		await expect(modeRow).toBeVisible();
		await expect(modeRow).toHaveAttribute("role", "toolbar");
		await expect(modeRow).toHaveAttribute("aria-label", "Step modes");
		// The dashboard is a Step routed through operate.diagnose.
		await expect(modeRow).toHaveAttribute("data-mode-affordance", "step");
		await expect(modeRow).toHaveAttribute("data-mode-step-id", "operate.diagnose");
	});

	test("the range selector (1h/6h/24h/7d/30d) re-buckets the charts", async ({ page }) => {
		await page.goto(DASHBOARD_ROUTE);

		const range = page.locator("[data-telemetry-range]");
		await expect(range).toHaveAttribute("role", "radiogroup");
		for (const r of ["1h", "6h", "24h", "7d", "30d"]) {
			await expect(page.locator(`[data-telemetry-range-option='${r}']`)).toBeVisible();
		}

		// 24h is the OD default active range.
		await expect(page.locator("[data-telemetry-range-option='24h']")).toHaveAttribute(
			"data-active",
			"true",
		);
		await expect(page.locator("[data-telemetry-stat='agent-runs']")).toContainText("428");

		// Switching to 7d re-buckets every stat + the count line.
		await page.locator("[data-telemetry-range-option='7d']").click();
		await expect(page.locator("[data-telemetry-range-option='7d']")).toHaveAttribute(
			"data-active",
			"true",
		);
		await expect(page.locator("[data-telemetry-range-option='24h']")).not.toHaveAttribute(
			"data-active",
			"true",
		);
		await expect(page.locator("[data-telemetry-count]")).toContainText("last 7d");
		await expect(page.locator("[data-telemetry-count]")).toContainText("98k events");
		await expect(page.locator("[data-telemetry-stat='agent-runs']")).toContainText("2,914");

		// Switching to 1h re-buckets again.
		await page.locator("[data-telemetry-range-option='1h']").click();
		await expect(page.locator("[data-telemetry-count]")).toContainText("last 1h");
		await expect(page.locator("[data-telemetry-stat='agent-runs']")).toContainText("21");
	});

	test("error state renders the metrics-load failure banner with a trace id", async ({
		page,
	}) => {
		await page.goto(DASHBOARD_ERROR);
		await expect(page.locator("[data-operate-telemetry]")).toHaveAttribute(
			"data-state",
			"error",
		);
		const banner = page.locator("[data-telemetry-error]");
		await expect(banner).toBeVisible();
		await expect(banner).toContainText("Telemetry metrics could not load");
		await expect(banner).toContainText("tr_");

		const shot = await page.locator("[data-route='operate-telemetry']").screenshot();
		await writeEvidenceShot("operate-telemetry-error.png", shot);
	});
});

test.describe("operate-telemetry — settings (COPY.md §13 opt-in)", () => {
	test("the opt-in 3-state control matches COPY.md §13 verbatim", async ({ page }) => {
		await page.goto(SETTINGS_ROUTE);

		// First-run prompt — DESIGN.md §11.
		await expect(page.locator("[data-telemetry-first-run-heading]")).toHaveText(
			"Fulcrum is local-first. All telemetry is opt-in.",
		);

		const group = page.locator("[data-telemetry-optin-group]");
		await expect(group).toBeVisible();

		// The three COPY.md §13 modes with verbatim descriptions.
		await expect(page.locator("[data-telemetry-optin-row='on']")).toContainText("On");
		await expect(page.locator("[data-telemetry-optin-desc='on']")).toHaveText(
			"Anonymous usage metrics + crash reports. Helps tune defaults.",
		);
		await expect(page.locator("[data-telemetry-optin-row='anon']")).toContainText(
			"Anonymous only",
		);
		await expect(page.locator("[data-telemetry-optin-desc='anon']")).toHaveText(
			"Crash reports without command-level events.",
		);
		await expect(page.locator("[data-telemetry-optin-desc='off']")).toHaveText(
			"Default. No data leaves your machine.",
		);

		// COPY.md §13 help line — the CLI verb + env var + DO_NOT_TRACK.
		const help = page.locator("[data-telemetry-optin-help]");
		await expect(help).toContainText("fulcrum config telemetry on|anon|off");
		await expect(help).toContainText("FULCRUM_TELEMETRY=off");
		await expect(help).toContainText("DO_NOT_TRACK=1");

		// DESIGN.md §11 — the default is Off, no telemetry without opt-in.
		await expect(page.locator("[data-telemetry-optin-row='off']")).toHaveAttribute(
			"data-selected",
			"true",
		);

		const shot = await page.locator("[data-route='operate-telemetry']").screenshot();
		await writeEvidenceShot("operate-telemetry-settings.png", shot);
	});

	test("the first-run Continue button dismisses the prompt", async ({ page }) => {
		await page.goto(SETTINGS_ROUTE);
		const continueBtn = page.locator("[data-telemetry-first-run-continue]");
		await expect(continueBtn).toBeVisible();
		await expect(continueBtn).toContainText("Continue");
		await continueBtn.click();
		await expect(page.locator("[data-telemetry-first-run]")).toHaveCount(0);
	});

	test("the 3-state radio persists the telemetry mode and records an audit entry", async ({
		page,
	}) => {
		await page.goto(SETTINGS_ROUTE);

		// Audit trail starts empty — no telemetry collected by default.
		await expect(page.locator("[data-telemetry-audit-empty]")).toBeVisible();
		await expect(page.locator("[data-telemetry-config-command]")).toHaveText(
			"fulcrum config telemetry off",
		);

		// Opt in to anonymous-only — persists and records the change.
		await page.locator("[data-telemetry-optin-radio='anon']").click();
		await expect(page.locator("[data-telemetry-optin-row='anon']")).toHaveAttribute(
			"data-selected",
			"true",
		);
		await expect(page.locator("[data-telemetry-config-command]")).toHaveText(
			"fulcrum config telemetry anon",
		);
		await expect(page.locator("[data-telemetry-audit-entry]")).toHaveCount(1);
		await expect(page.locator("[data-telemetry-audit-entry]").first()).toContainText("off");
		await expect(page.locator("[data-telemetry-audit-entry]").first()).toContainText("anon");

		// A second change appends another audit entry.
		await page.locator("[data-telemetry-optin-radio='on']").click();
		await expect(page.locator("[data-telemetry-audit-entry]")).toHaveCount(2);
		await expect(page.locator("[data-telemetry-config-command]")).toHaveText(
			"fulcrum config telemetry on",
		);
	});

	test("DO_NOT_TRACK=1 forces Off and disables the control (COPY.md §13)", async ({ page }) => {
		await page.goto(SETTINGS_DNT);

		await expect(page.locator("[data-telemetry-dnt-note]")).toContainText("DO_NOT_TRACK=1");
		await expect(page.locator("[data-telemetry-optin-row='off']")).toHaveAttribute(
			"data-selected",
			"true",
		);
		await expect(page.locator("[data-telemetry-config-command]")).toHaveText(
			"fulcrum config telemetry off",
		);
		// The radios are disabled — telemetry cannot be enabled while DNT is set.
		await expect(page.locator("[data-telemetry-optin-radio='on']")).toBeDisabled();
	});
});

test.describe("operate-telemetry — accessibility", () => {
	test("the range selector is keyboard operable with a focus-visible ring", async ({ page }) => {
		await page.goto(DASHBOARD_ROUTE);
		const option = page.locator("[data-telemetry-range-option='7d']");
		await option.focus();
		await expect(option).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(option).toHaveAttribute("data-active", "true");
		await expect(page.locator("[data-telemetry-count]")).toContainText("last 7d");
	});

	test("the opt-in radios expose aria-checked reflecting the selected mode", async ({ page }) => {
		await page.goto(SETTINGS_ROUTE);
		const offRadio = page.locator("[data-telemetry-optin-radio='off']");
		await expect(offRadio).toHaveAttribute("aria-checked", "true");
		const anonRadio = page.locator("[data-telemetry-optin-radio='anon']");
		await expect(anonRadio).toHaveAttribute("aria-checked", "false");
		await anonRadio.click();
		await expect(anonRadio).toHaveAttribute("aria-checked", "true");
		await expect(offRadio).toHaveAttribute("aria-checked", "false");
	});

	test("the view tabs carry aria-selected reflecting the active sub-view", async ({ page }) => {
		await page.goto(DASHBOARD_ROUTE);
		await expect(
			page.locator("[data-telemetry-view-tab='observability']"),
		).toHaveAttribute("aria-selected", "true");
		await expect(page.locator("[data-telemetry-view-tab='settings']")).toHaveAttribute(
			"aria-selected",
			"false",
		);
	});
});
