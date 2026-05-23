import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Rendered design-fidelity coverage for `prd-web-plan-review-od-fidelity`.
 *
 * The Plan-stage review surface — canonical route
 * `/<ws>/projects/<projId>/plan/<planId>/review` (IA-MAP.md §2.2 "Plan +
 * prototype + tasks tripane"), rendered at `/plan-review`. Proven against OD
 * `plan-review.html`, IA-MAP.md §2.2 / §4.4 Plannotator, DESIGN.md §4.5/§4.6,
 * and COPY.md §362/§539:
 *
 *  - layout — four-row grid: review head + tab bar + active panel + bottom
 *    gate. The Plan & prototype panel is the tripane — plan markdown (1.1fr) +
 *    prototype callout (1fr) + task breakdown (380px).
 *  - tabs — Plan & prototype / Comments / Free chat / History, each with a count.
 *  - copy — COPY.md §362 canonical 8-state vocab (`waiting-input` verbatim);
 *    COPY.md §539 Plannotator `Mod+Enter` overload.
 *  - interactions — comment anchors bind to `data-commentable` sections; the
 *    `Mod+Enter` overload approves with zero annotations and sends feedback
 *    when annotations exist.
 *  - gate — Request changes / Save without promoting / Approve & promote to
 *    Build, the single approve gate over plan + prototype + tasks.
 *  - accessibility — keyboard-operable tabs, mode-row toolbar, focus ring.
 *
 * Source: OD `plan-review.html`; IA-MAP.md §2.2 / §4.4; DESIGN.md §4.5/§4.6;
 * COPY.md §362 / §539.
 */

/** Persist a rendered screenshot to the recovery-packet evidence dir. */
async function writeEvidenceShot(name: string, body: Buffer): Promise<void> {
	const dir = process.env.FULCRUM_DESIGN_EVIDENCE_DIR;
	if (!dir) return;
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, name), body);
}

test.describe("plan-review — tripane layout (IA-MAP.md §2.2)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/plan-review");
		await page.evaluate(() => window.localStorage.clear());
		await page.reload();
	});

	test("renders the review head, tab bar, tripane, and bottom gate", async ({ page }) => {
		await expect(page.locator("[data-plan-review-page]")).toBeVisible();
		await expect(page.locator("[data-plan-review-page]")).toHaveAttribute("data-state", "populated");

		// Review head — crumbs + plan title + waiting-input badge + mode-row.
		await expect(page.locator("[data-review-head]")).toBeVisible();
		await expect(page.locator("[data-review-crumbs]")).toContainText("plan");
		await expect(page.locator("[data-review-crumbs]")).toContainText("reviews");
		await expect(
			page.getByRole("heading", { name: "Rewrite auth session token rotation" }),
		).toBeVisible();
		await expect(page.locator("[data-review-mode-row]")).toBeVisible();

		// Tab bar — four tabs, each with a count.
		for (const tab of ["content", "comments", "chat", "history"]) {
			await expect(page.locator(`[data-review-tab='${tab}']`)).toBeVisible();
		}
		await expect(page.locator("[data-review-tab='content']")).toContainText("Plan & prototype");

		// Tripane — plan markdown + prototype callout + task breakdown.
		await expect(page.locator("[data-plan-pane]")).toBeVisible();
		await expect(page.locator("[data-prototype-pane]")).toBeVisible();
		await expect(page.locator("[data-tasks-pane]")).toBeVisible();
		await expect(page.locator("[data-task-cards] [data-task-card]")).toHaveCount(8);
		await expect(page.locator("[data-prototype-device]")).toBeVisible();

		// Bottom gate.
		await expect(page.locator("[data-review-gate]")).toBeVisible();

		const shot = await page.locator("[data-plan-review-page]").screenshot();
		await writeEvidenceShot("plan-review-populated.png", shot);
	});

	test("plan markdown sections carry inline-commentable anchors", async ({ page }) => {
		// IA-MAP.md §4.4 Plannotator: comment anchors bind to data-commentable.
		for (const anchor of [
			"plan-why",
			"plan-risk",
			"plan-approach",
			"plan-oos",
			"plan-acceptance",
			"plan-references",
		]) {
			await expect(page.locator(`[data-plan-pane] [data-commentable='${anchor}']`)).toBeVisible();
		}
		// Numbered Approach steps each carry a per-step anchor.
		await expect(page.locator("[data-plan-pane] [data-commentable='plan-step-2']")).toBeVisible();
		// The embedded prototype callout is itself a commentable anchor.
		await expect(
			page.locator("[data-prototype-pane] [data-commentable='proto-sessions']"),
		).toBeVisible();
	});

	test("prototype callout pane embeds the live /sessions device frame", async ({ page }) => {
		const device = page.locator("[data-prototype-device]");
		await expect(device).toContainText("app.fulcrum.dev/settings/sessions");
		await expect(device).toContainText("Active sessions");
		await expect(page.locator("[data-prototype-device-row]")).toHaveCount(3);
		await expect(page.locator("[data-prototype-device-row][data-current='true']")).toContainText(
			"this device",
		);
	});
});

test.describe("plan-review — canonical status copy (COPY.md §362)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/plan-review");
		await page.evaluate(() => window.localStorage.clear());
		await page.reload();
	});

	test("renders the waiting-input badge with the canonical 8-state token", async ({ page }) => {
		// COPY.md §362: canonical 8-state vocab; `waiting-input` is verbatim.
		await expect(page.locator("[data-review-status-badge]")).toHaveAttribute(
			"data-status",
			"waiting-input",
		);
		await expect(page.locator("[data-review-status-label]")).toHaveText("waiting-input");
		// Banned status synonyms never appear in the review chrome.
		for (const banned of ["In Flight", "WIP", "Doing", "Stuck", "Done!"]) {
			await expect(page.locator("[data-plan-review-page]")).not.toContainText(banned);
		}
	});

	test("task cards use the canonical pending status badge", async ({ page }) => {
		const firstTask = page.locator("[data-task-card='task-1']");
		await expect(firstTask.locator("[data-slot='status-badge']")).toHaveAttribute(
			"data-status",
			"pending",
		);
	});
});

test.describe("plan-review — Mod+Enter overload + approve gate (COPY.md §539)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/plan-review");
		await page.evaluate(() => window.localStorage.clear());
		await page.reload();
	});

	test("with open annotations the gate sends feedback, not approval", async ({ page }) => {
		// Seeded with five open review threads — the send-feedback branch.
		await expect(page.locator("[data-plan-review-page]")).toHaveAttribute(
			"data-has-annotations",
			"true",
		);
		const gate = page.locator("[data-approve-gate]");
		await expect(gate).toHaveAttribute("data-overload-branch", "send-feedback");
		await expect(gate).toContainText("Send feedback");

		await gate.click();
		await expect(page.locator("[data-gate-outcome]")).toHaveAttribute(
			"data-gate-outcome",
			"feedback-sent",
		);
		await expect(page.locator("[data-gate-outcome]")).toContainText(
			"Feedback sent to the planning agent",
		);

		const shot = await page.locator("[data-plan-review-page]").screenshot();
		await writeEvidenceShot("plan-review-feedback-sent.png", shot);
	});

	test("with zero annotations the gate approves and promotes to Build", async ({ page }) => {
		// Resolve every open thread so the overload flips to the approve branch.
		await page.locator("[data-review-tab='comments']").click();
		const resolveButtons = page.locator("[data-resolve-thread]");
		let remaining = await resolveButtons.count();
		while (remaining > 0) {
			await resolveButtons.first().click();
			remaining = await resolveButtons.count();
		}
		await expect(page.locator("[data-plan-review-page]")).toHaveAttribute(
			"data-has-annotations",
			"false",
		);

		const gate = page.locator("[data-approve-gate]");
		await expect(gate).toHaveAttribute("data-overload-branch", "approve");
		await expect(gate).toContainText("Approve & promote to Build");

		await gate.click();
		await expect(page.locator("[data-gate-outcome]")).toHaveAttribute(
			"data-gate-outcome",
			"approved",
		);
		await expect(page.locator("[data-gate-outcome]")).toContainText("promoted to Build");

		const shot = await page.locator("[data-plan-review-page]").screenshot();
		await writeEvidenceShot("plan-review-approved.png", shot);
	});

	test("the Mod+Enter chord triggers the same overload as the gate button", async ({ page }) => {
		// The shell command palette opens when a modifier key is released on its
		// own; dismiss any incidental overlay so the chord targets the review.
		const dismissOverlay = async () => {
			await page.keyboard.press("Escape");
			await expect(page.locator("[data-dialog-content]")).toHaveCount(0);
		};

		// With annotations open, the chord sends feedback.
		await page.keyboard.press("ControlOrMeta+Enter");
		await expect(page.locator("[data-gate-outcome]")).toHaveAttribute(
			"data-gate-outcome",
			"feedback-sent",
		);
		await dismissOverlay();

		// Resolve every thread, then the same chord now approves — proving the
		// chord and the gate button share one overloaded control (COPY.md §539).
		await page.locator("[data-review-tab='comments']").click();
		const resolveButtons = page.locator("[data-resolve-thread]");
		let remaining = await resolveButtons.count();
		while (remaining > 0) {
			await resolveButtons.first().click();
			remaining = await resolveButtons.count();
		}
		await page.keyboard.press("ControlOrMeta+Enter");
		await expect(page.locator("[data-gate-outcome]")).toHaveAttribute(
			"data-gate-outcome",
			"approved",
		);
	});

	test("Request changes opens an inline bar; Save without promoting holds the plan", async ({
		page,
	}) => {
		await page.locator("[data-request-changes-toggle]").click();
		await expect(page.locator("[data-request-changes-bar]")).toBeVisible();
		await expect(page.locator("[data-request-changes-bar]")).toContainText("Request changes");
		await page.locator("[data-submit-request-changes]").click();
		await expect(page.locator("[data-gate-outcome]")).toHaveAttribute(
			"data-gate-outcome",
			"changes-requested",
		);

		await page.locator("[data-save-without-promoting]").click();
		await expect(page.locator("[data-gate-outcome]")).toHaveAttribute("data-gate-outcome", "saved");
	});
});

test.describe("plan-review — tabs + threads", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/plan-review");
		await page.evaluate(() => window.localStorage.clear());
		await page.reload();
	});

	test("Comments tab lists every anchored thread with its anchor chip", async ({ page }) => {
		await page.locator("[data-review-tab='comments']").click();
		await expect(page.locator("[data-review-panel='comments']")).toBeVisible();
		await expect(page.locator("[data-review-threads] [data-review-thread]")).toHaveCount(6);
		// Anchors bind to the data-commentable plan/proto/task sections.
		await expect(page.locator("[data-anchor-chip='plan-why']")).toBeVisible();
		await expect(page.locator("[data-anchor-chip='proto-sessions']")).toBeVisible();
		await expect(page.locator("[data-anchor-chip='task-1']")).toBeVisible();
	});

	test("Free chat tab streams reviewers + AI in one composer", async ({ page }) => {
		await page.locator("[data-review-tab='chat']").click();
		await expect(page.locator("[data-chat-stream]")).toBeVisible();
		await expect(page.locator("[data-chat-composer]")).toBeVisible();
		await expect(page.locator("[data-chat-input]")).toBeVisible();
	});

	test("History tab lists plan revisions with diff counts", async ({ page }) => {
		await page.locator("[data-review-tab='history']").click();
		await expect(page.locator("[data-plan-revisions] [data-plan-revision]")).toHaveCount(3);
		await expect(page.locator("[data-plan-revisions]")).toContainText("Revision 3");
	});
});

test.describe("plan-review — data states + accessibility", () => {
	test("renders under forced-colors: active", async ({ browser }) => {
		const context = await browser.newContext({ forcedColors: "active" });
		const page = await context.newPage();
		await page.goto("/plan-review");
		await expect(page.locator("[data-plan-review-page]")).toBeVisible();
		await expect(page.locator("[data-review-gate]")).toBeVisible();
		const shot = await page.locator("[data-plan-review-page]").screenshot();
		await writeEvidenceShot("plan-review-forced-colors.png", shot);
		await context.close();
	});

	test("tabs are keyboard operable", async ({ page }) => {
		await page.goto("/plan-review");
		await page.locator("[data-review-tab='content']").focus();
		await page.keyboard.press("ArrowRight");
		await page.keyboard.press("Enter");
		await expect(page.locator("[data-review-panel='comments']")).toBeVisible();
	});

	test("keeps the forbidden protocol acronym out of visible chrome", async ({ page }) => {
		await page.goto("/plan-review");
		await expect(page.locator("[data-plan-review-page]")).not.toContainText(/\bACP\b/);
	});
});
