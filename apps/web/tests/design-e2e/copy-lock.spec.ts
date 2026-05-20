import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

/**
 * Copy-lock design-e2e spec — owns the COPY.md text contracts.
 *
 * This spec RENDERS `/design-kit#copy-lock` and asserts every COPY.md §1/§4/§6/
 * §10/§11/§12/§13 literal is present verbatim. The ban-list / voice-rule checks
 * (em dash, first-person plural, ACP chrome label, status synonyms) are SCOPED
 * to the rendered copy-lock fixture DOM only — the OD-referenced surface — per
 * the PRD recovery_note. It does NOT scan raw app source for WIP/voice strings;
 * the over-broad source scan is what blocked the prior attempt.
 */

async function openDesignKit(page: Page): Promise<void> {
	await page.goto("/design-kit");
	await expect(page.locator("[data-design-kit-ready='true']")).toBeVisible();
}

function copyLockSection(page: Page): Locator {
	return page.locator("[data-design-kit-section='copy-lock'][data-copy-lock]");
}

// COPY.md §6 — canonical 8-state vocabulary and its rendered labels.
const CANONICAL_STATUS: ReadonlyArray<{ status: string; label: string }> = [
	{ status: "queued", label: "Queued" },
	{ status: "running", label: "Running" },
	{ status: "waiting-input", label: "Waiting input" },
	{ status: "passing", label: "Passing" },
	{ status: "failing", label: "Failing" },
	{ status: "completed", label: "Completed" },
	{ status: "cancelled", label: "Cancelled" },
	{ status: "blocked", label: "Blocked" },
];

// COPY.md §6 — banned status synonyms.
const BANNED_STATUS = ["In Flight", "WIP", "Doing", "Stuck", "Done!"] as const;

// COPY.md §10 — permission prompt buttons (three, never two).
const PERMISSION_BUTTONS: ReadonlyArray<{ id: string; label: string }> = [
	{ id: "allow-once", label: "Allow once" },
	{ id: "allow-always", label: "Allow always for `claude` in this project" },
	{ id: "deny", label: "Deny" },
];

// COPY.md §10 — AI Assist abort reason labels.
const ABORT_REASONS: ReadonlyArray<{ id: string; label: string }> = [
	{ id: "user-cancel", label: "User cancel" },
	{ id: "dangerous-output", label: "Dangerous output" },
	{ id: "wrong-context", label: "Wrong context" },
	{ id: "cost-cap", label: "Cost cap" },
];

// COPY.md §13 — telemetry first-run options.
const TELEMETRY_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
	{ id: "on", label: "On" },
	{ id: "anonymous-only", label: "Anonymous only" },
	{ id: "off", label: "Off" },
];

// COPY.md §11 — notification templates.
const NOTIFICATIONS: ReadonlyArray<{ id: string; label: string }> = [
	{ id: "mention", label: '@you mentioned in "Plan: auth refactor"' },
	{ id: "review-requested", label: "Review requested by claude on TASK-471" },
	{ id: "run-completed", label: "Run 01HXYZ… completed (12 of 47 tasks done)" },
	{ id: "run-failed", label: 'Run 01HXYZ… failed at step "build". [ View ]' },
	{ id: "permission-requested", label: "claude requests permission to run shell command. [ Review ]" },
	{ id: "artifact-shipped", label: 'Artifact "release-v2.tgz" ready in Ship' },
	{ id: "cycle-ending", label: 'Cycle "May sprint" ends in 2 days. 4 tasks in progress.' },
];

// COPY.md §4 — confirmation copy literals.
const CONFIRMATIONS: ReadonlyArray<{ id: string; label: string }> = [
	{ id: "saved", label: "Saved 8s ago" },
	{ id: "saving", label: "Saving…" },
	{ id: "confirm-archive", label: "Confirm archive? (3)" },
	{ id: "session-choice", label: "Session choice saved" },
];

test.describe("copy-lock fixture — COPY.md text contracts", () => {
	test("the /design-kit#copy-lock fixture section renders", async ({ page }) => {
		await openDesignKit(page);
		const section = copyLockSection(page);
		await expect(section).toBeVisible();
		// COPY.md §6 status labels, §4, §10, §11, §12, §13 groups all present.
		for (const group of [
			"status-labels",
			"confirmations",
			"permission",
			"notifications",
			"settings",
			"telemetry",
		]) {
			await expect(section.locator(`[data-copy-lock-group='${group}']`)).toBeVisible();
		}
	});

	test("COPY.md §6 — every canonical status label renders, no synonym present", async ({ page }) => {
		await openDesignKit(page);
		const section = copyLockSection(page);
		for (const { status, label } of CANONICAL_STATUS) {
			const wrapper = section.locator(`[data-copy-lock-status='${status}']`);
			await expect(wrapper).toBeVisible();
			const badge = wrapper.locator("[data-slot='status-badge']");
			await expect(badge).toHaveAttribute("data-status", status);
			await expect(badge).toContainText(label);
		}
		// Canonical vocab string is exactly the COPY.md §6 closing line.
		await expect(section.locator("[data-copy-lock-status-vocab]")).toHaveText(
			"queued / running / waiting-input / passing / failing / completed / cancelled / blocked",
		);
		// No banned status synonym rendered as a visible status label.
		const statusText = (await section.locator("[data-copy-lock-group='status-labels']").innerText()).trim();
		for (const banned of BANNED_STATUS) {
			expect(statusText).not.toContain(banned);
		}
	});

	test("COPY.md §4 — confirmation copy literals render verbatim", async ({ page }) => {
		await openDesignKit(page);
		const section = copyLockSection(page);
		for (const { id, label } of CONFIRMATIONS) {
			await expect(section.locator(`[data-copy-lock-confirmation='${id}']`)).toHaveText(label);
		}
	});

	test("COPY.md §10 — permission prompt has three buttons, abort reasons exact", async ({ page }) => {
		await openDesignKit(page);
		const section = copyLockSection(page);
		const buttons = section.locator("[data-copy-lock-permission-button]");
		await expect(buttons).toHaveCount(3);
		for (const { id, label } of PERMISSION_BUTTONS) {
			await expect(
				section.locator(`[data-copy-lock-permission-button='${id}']`),
			).toHaveText(label);
		}
		await expect(section.locator("[data-copy-lock-abort-title]")).toHaveText("Abort active work?");
		for (const { id, label } of ABORT_REASONS) {
			await expect(section.locator(`[data-copy-lock-abort-reason='${id}']`)).toHaveText(label);
		}
	});

	test("COPY.md §11 — notification templates render verbatim", async ({ page }) => {
		await openDesignKit(page);
		const section = copyLockSection(page);
		for (const { id, label } of NOTIFICATIONS) {
			await expect(section.locator(`[data-copy-lock-notification='${id}']`)).toHaveText(label);
		}
	});

	test("COPY.md §12 — settings inheritance chips render", async ({ page }) => {
		await openDesignKit(page);
		const section = copyLockSection(page);
		for (const id of ["inherited", "overridden", "locked"]) {
			await expect(section.locator(`[data-copy-lock-settings-chip='${id}']`)).toBeVisible();
		}
	});

	test("COPY.md §13 — telemetry options are exactly On / Anonymous only / Off", async ({ page }) => {
		await openDesignKit(page);
		const section = copyLockSection(page);
		const options = section.locator("[data-copy-lock-telemetry-option]");
		await expect(options).toHaveCount(3);
		for (const { id, label } of TELEMETRY_OPTIONS) {
			await expect(
				section.locator(`[data-copy-lock-telemetry-option='${id}']`),
			).toHaveText(label);
		}
	});

	test("COPY.md §1 voice rules — no em dash, no first-person plural, no ACP chrome label", async ({
		page,
	}) => {
		await openDesignKit(page);
		const section = copyLockSection(page);
		// Scoped to the OD-referenced locked-copy groups (recovery_note): the
		// per-section data-copy-lock-group blocks render the verbatim COPY.md
		// literals. The fixture's own explanatory header is not locked copy and
		// is excluded — the scan targets shippable user-visible copy only.
		const groups = section.locator("[data-copy-lock-group]");
		const count = await groups.count();
		expect(count).toBeGreaterThan(0);
		for (let index = 0; index < count; index += 1) {
			const renderedCopy = (await groups.nth(index).innerText()).trim();
			// Rule 6 — no em dash.
			expect(renderedCopy).not.toContain("—");
			// Rule 8 — first-person plural is banned.
			expect(renderedCopy).not.toMatch(/\bWe (couldn't|can't|cannot|could not)\b/i);
			// Rule 10 — "ACP" must never leak as a chrome label; surfaces say
			// "AI Assist". A standalone "ACP" token in locked copy is a violation.
			expect(renderedCopy).not.toMatch(/\bACP\b/);
		}
	});

	test("forced-colors — copy-lock fixture stays readable with a forced palette", async ({ page }) => {
		await page.emulateMedia({ forcedColors: "active" });
		await openDesignKit(page);
		const section = copyLockSection(page);
		await expect(section).toBeVisible();
		await expect(section.locator("[data-copy-lock-group='status-labels']")).toBeVisible();
		// Canonical status badges still render their labels under forced-colors.
		for (const { status, label } of CANONICAL_STATUS) {
			await expect(
				section.locator(`[data-copy-lock-status='${status}'] [data-slot='status-badge']`),
			).toContainText(label);
		}
	});
});
