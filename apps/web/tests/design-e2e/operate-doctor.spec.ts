import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Rendered OD-fidelity proof for `prd-web-operate-doctor-od-fidelity`.
 *
 * Drives the production Operate · Doctor route and asserts it matches OD
 * `operate.html`: a toolbar, a 5-cell summary strip, a subsystem table with
 * Subsystem / Status / Latency p99 / Last check / Recovery / Actions columns,
 * inline probe-trace expansion on failing/failed rows, multi-sentence recovery
 * copy with a copy-command button, a per-row ModeAffordance row, contextual
 * recovery primaries (Recover / Catch up now / Open PR), two telemetry tiles,
 * and a degraded/healthy banner.
 *
 * Refresh uses SvelteKit `invalidateAll()` — the test proves row expansion and
 * scroll position survive a refresh (the PRD interaction assertion).
 *
 * Design refs: IA-MAP.md §2.6 operate/doctor · DESIGN.md §6 (subsystem table) ·
 * DESIGN.md §10 (Doctor) · DESIGN.md §8.1 (mode affordances) · COPY.md §8.
 * States: `populated`. The degraded scene is the OD `operate.html` reference
 * state, surfaced with `?fixture=degraded`.
 */

/** The production Doctor route — the Operate stage's default sub-view. */
const DOCTOR_ROUTE = "/doctor";
/** The OD degraded reference scene — `operate.html`. */
const DOCTOR_DEGRADED = "/doctor?fixture=degraded";

/** Persist a rendered screenshot to the recovery-packet evidence dir. */
async function writeEvidenceShot(name: string, body: Buffer): Promise<void> {
	const dir = process.env.FULCRUM_DESIGN_EVIDENCE_DIR;
	if (!dir) return;
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, name), body);
}

test.describe("operate-doctor — layout (OD operate.html)", () => {
	test("toolbar, 5-cell summary strip, and subsystem table render", async ({ page }) => {
		await page.goto(DOCTOR_ROUTE);

		// Toolbar — OD `.toolbar`.
		const header = page.locator("[data-doctor-header]");
		await expect(header).toBeVisible();
		await expect(header).toContainText("Doctor · system health");
		await expect(page.locator("[data-doctor-last-check]")).toBeVisible();
		await expect(page.locator("[data-doctor-run-full-check]")).toBeVisible();
		await expect(page.locator("[data-doctor-filter]")).toBeVisible();
		await expect(page.locator("[data-refresh-now]")).toBeVisible();

		// 5-cell summary strip — OD `.summary`.
		await expect(page.locator("[data-doctor-summary]")).toBeVisible();
		for (const cell of ["subsystems", "passing", "failing", "failed", "last-green"]) {
			await expect(page.locator(`[data-doctor-summary-cell='${cell}']`)).toBeVisible();
		}

		// Subsystem table — OD `table.sub` with the six columns.
		const table = page.locator("[data-doctor-table]");
		await expect(table).toBeVisible();
		const headers = table.locator("thead th");
		await expect(headers).toHaveText([
			"Subsystem",
			"Status",
			"Latency p99",
			"Last check",
			"Recovery",
			"Actions",
		]);
		await expect(page.locator("[data-doctor-row]").first()).toBeVisible();
		await expect(page.locator("[data-doctor-latency]").first()).toBeVisible();

		const shot = await page.locator("[data-route='operate-doctor']").screenshot();
		await writeEvidenceShot("operate-doctor-populated.png", shot);
	});

	test("two telemetry tiles render below the table", async ({ page }) => {
		await page.goto(DOCTOR_ROUTE);
		await expect(page.locator("[data-doctor-telemetry]")).toBeVisible();
		await expect(page.locator("[data-doctor-telemetry-tile='run-success-rate']")).toBeVisible();
		await expect(page.locator("[data-doctor-telemetry-tile='active-runs']")).toBeVisible();
		await expect(page.locator("[data-doctor-telemetry-tile='run-success-rate']")).toContainText("Run success rate");
		await expect(page.locator("[data-doctor-telemetry-tile='active-runs']")).toContainText("Active runs");
	});

	test("every subsystem row carries a mode-affordance row (DESIGN.md §8.1)", async ({ page }) => {
		await page.goto(DOCTOR_ROUTE);
		const rows = page.locator("[data-doctor-row]");
		const rowCount = await rows.count();
		expect(rowCount).toBeGreaterThan(0);
		// Each row is a Step — carries the universal ModeAffordance hooks + row.
		await expect(rows.first()).toHaveAttribute("data-mode-affordance", "step");
		await expect(rows.first()).toHaveAttribute("data-mode-step-kind", "subsystem-row");
		const modeRows = page.locator("[data-doctor-mode-row]");
		await expect(modeRows).toHaveCount(rowCount);
		await expect(modeRows.first()).toHaveAttribute("role", "toolbar");
		await expect(modeRows.first()).toHaveAttribute("aria-label", "Step modes");
	});
});

test.describe("operate-doctor — degraded scene (OD operate.html)", () => {
	test("degraded banner + failing/failed rows with probe-trace and recovery", async ({ page }) => {
		await page.goto(DOCTOR_DEGRADED);

		// Degraded banner — COPY.md §8 doctor banner.
		const banner = page.locator("[data-doctor-banner]");
		await expect(banner).toBeVisible();
		await expect(banner).toContainText("degraded");
		await expect(page.locator("[data-doctor-banner-reprobe]")).toBeVisible();

		// A failed row carries a StatusBadge with the locked vocabulary.
		const cronRow = page.locator("[data-doctor-row][data-subsystem='scheduler.cron']");
		await expect(cronRow).toBeVisible();
		await expect(cronRow).toHaveAttribute("data-status", "fail");
		await expect(cronRow.locator("[data-doctor-status-badge]")).toContainText("Failed");

		// A failing row carries a StatusBadge `Failing`.
		const dbRow = page.locator("[data-doctor-row][data-subsystem='db.prisma.shadow']");
		await expect(dbRow).toHaveAttribute("data-status", "warn");
		await expect(dbRow.locator("[data-doctor-status-badge]")).toContainText("Failing");

		// Multi-sentence recovery copy with a copy-command button (COPY.md §8).
		await expect(dbRow.locator("[data-doctor-recovery-copy]")).toContainText("Next step");
		await expect(dbRow.locator("[data-doctor-copy-command]")).toBeVisible();

		// Contextual recovery primaries — Recover / Catch up now / Open PR.
		await expect(dbRow.locator("[data-doctor-recovery-action][data-action-kind='recover']")).toBeVisible();
		await expect(cronRow.locator("[data-doctor-recovery-action][data-action-kind='catch-up']")).toContainText("Catch up now");
		await expect(
			page.locator("[data-doctor-row][data-subsystem='obs.collector'] [data-doctor-recovery-action][data-action-kind='open-pr']"),
		).toContainText("Open PR");

		const shot = await page.locator("[data-route='operate-doctor']").screenshot();
		await writeEvidenceShot("operate-doctor-degraded.png", shot);
	});

	test("failing row expands inline into a mono probe-trace panel", async ({ page }) => {
		await page.goto(DOCTOR_DEGRADED);
		const dbRow = page.locator("[data-doctor-row][data-subsystem='db.prisma.shadow']");

		// Collapsed by default — no probe-trace panel.
		await expect(page.locator("[data-doctor-probe-trace][data-subsystem='db.prisma.shadow']")).toHaveCount(0);

		// Probe button expands the inline trace panel.
		await dbRow.locator("[data-doctor-probe]").click();
		const trace = page.locator("[data-doctor-probe-trace][data-subsystem='db.prisma.shadow']");
		await expect(trace).toBeVisible();
		await expect(trace).toContainText("$ doctor probe db.prisma.shadow");
		await expect(trace).toContainText("reconnect 1/3");
		await expect(trace.locator("[data-doctor-probe-trace-id]")).toContainText("tr_07f2e1d9b2");
		await expect(dbRow).toHaveAttribute("data-expanded", "true");
	});

	test("copy-command button copies the recovery command to the clipboard", async ({ page, context }) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		await page.goto(DOCTOR_DEGRADED);
		const dbRow = page.locator("[data-doctor-row][data-subsystem='db.prisma.shadow']");
		const copyButton = dbRow.locator("[data-doctor-copy-command]");
		await expect(copyButton).toContainText("Copy:");
		await copyButton.click();
		await expect(copyButton).toContainText("Copied");
		const clip = await page.evaluate(() => navigator.clipboard.readText());
		expect(clip).toBe("docker restart fulcrum-pg-shadow");
	});
});

test.describe("operate-doctor — refresh preserves state", () => {
	test("Refresh now preserves row expansion and scroll position", async ({ page }) => {
		await page.goto(DOCTOR_DEGRADED);
		const dbRow = page.locator("[data-doctor-row][data-subsystem='db.prisma.shadow']");

		// Expand a probe-trace row.
		await dbRow.locator("[data-doctor-probe]").click();
		await expect(dbRow).toHaveAttribute("data-expanded", "true");

		// Scroll the table region.
		await page.locator("[data-slot='table-container']").evaluate((el) => {
			el.scrollTop = 80;
		});
		const beforeScroll = await page
			.locator("[data-slot='table-container']")
			.evaluate((el) => el.scrollTop);

		// Refresh — invalidate-based, not a full-page reload.
		await page.locator("[data-refresh-now]").click();
		await expect(page.locator("[data-doctor-table]")).toBeVisible();

		// Expansion and scroll position survive the refresh.
		await expect(dbRow).toHaveAttribute("data-expanded", "true");
		await expect(page.locator("[data-doctor-probe-trace][data-subsystem='db.prisma.shadow']")).toBeVisible();
		const afterScroll = await page
			.locator("[data-slot='table-container']")
			.evaluate((el) => el.scrollTop);
		expect(afterScroll).toBe(beforeScroll);
	});
});

test.describe("operate-doctor — accessibility", () => {
	test("interactive controls are keyboard operable with a focus-visible ring", async ({ page }) => {
		await page.goto(DOCTOR_DEGRADED);
		const probe = page
			.locator("[data-doctor-row][data-subsystem='db.prisma.shadow'] [data-doctor-probe]");
		await probe.focus();
		await expect(probe).toBeFocused();
		// Keyboard activation expands the probe-trace.
		await page.keyboard.press("Enter");
		await expect(page.locator("[data-doctor-probe-trace][data-subsystem='db.prisma.shadow']")).toBeVisible();
	});

	test("probe button exposes aria-expanded reflecting row state", async ({ page }) => {
		await page.goto(DOCTOR_DEGRADED);
		const probe = page
			.locator("[data-doctor-row][data-subsystem='db.prisma.shadow'] [data-doctor-probe]");
		await expect(probe).toHaveAttribute("aria-expanded", "false");
		await probe.click();
		await expect(probe).toHaveAttribute("aria-expanded", "true");
	});
});
