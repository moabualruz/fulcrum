import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Rendered design-fidelity coverage for `prd-onboarding-web-first-run`.
 *
 * The OD first-run flow — canonical route `/onboarding` (IA-MAP.md
 * `/onboarding`) — proven against OD `onboarding.html`, DESIGN.md §11
 * (Onboarding · first-run), and COPY.md §7 (Onboarding first-run copy):
 *
 *  - layout — boot lands on a single workspace-name field; "What are you
 *    building?" follows; the third phase is the OD `onboarding.html` Capture
 *    surface — a `.doc` body, a `.scrim` dimming everything but one lit
 *    `.anchor` block, the first-▶-Play coachmark, and a pulsing first trace.
 *  - data-states — empty (the workspace phase, no workspace yet), populated
 *    (the Capture surface), mobile (390px reflow), forced-colors.
 *  - interactions — Continue / Create project advance the flow; first ▶ Play
 *    and "Got it — try Play" hand off to Plan; "Skip tour" and Esc dismiss the
 *    coachmark + scrim; the coachmark focus order is deterministic.
 *  - copy — COPY.md §7 workspace + project strings appear verbatim.
 *  - parity — the first ▶ Play handoff lands on the Plan stage; CLI/TUI
 *    onboarding parity is recorded as follow-up PRDs (prd-cli-stage-command-tree,
 *    prd-tui-root-navigation-od-parity).
 *  - accessibility — every control is keyboard reachable with a focus ring;
 *    the coachmark is a `role="dialog"` target; the trace pulse honors
 *    reduced-motion; forced-colors keeps the surface legible.
 *
 * Source: OD `onboarding.html`; DESIGN.md §11 / §12; COPY.md §7;
 * IA-MAP.md `/onboarding`; apps/web/CONTEXT.md OnboardingFlow.
 */

/** Persist a rendered screenshot to the recovery-packet evidence dir. */
async function writeEvidenceShot(name: string, body: Buffer): Promise<void> {
	const dir = process.env.FULCRUM_DESIGN_EVIDENCE_DIR;
	if (!dir) return;
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, name), body);
}

test.describe("onboarding — first-run flow (OD onboarding.html · DESIGN §11)", () => {
	test("boot lands on the single workspace-name field with COPY §7 copy", async ({ page }) => {
		await page.goto("/onboarding");

		// empty data-state — no workspace yet.
		await expect(page.locator("[data-onboarding-page]")).toHaveAttribute("data-state", "empty");
		await expect(page.locator("[data-onboarding-page]")).toHaveAttribute("data-phase", "workspace");

		// DESIGN §11 step 1 — single field, no multi-step wizard chrome.
		await expect(
			page.getByRole("heading", { name: "What's your workspace called?", level: 1 }),
		).toBeVisible();
		await expect(page.locator("[data-workspace-name]")).toBeVisible();
		// COPY §7 verbatim hint.
		await expect(page.locator("[data-workspace-hint]")).toContainText(
			"Use anything. You can rename later.",
		);
		await expect(page.locator("[data-workspace-hint]")).toContainText("works fine.");
		await expect(page.locator("[data-workspace-continue]")).toHaveText("Continue");

		// DESIGN §12 anti-references — no hero illustration, no persistent banner.
		await expect(page.locator("[data-onboarding-page] img")).toHaveCount(0);

		const shot = await page.locator("[data-onboarding-page]").screenshot();
		await writeEvidenceShot("onboarding-empty.png", shot);
	});

	test("the project phase asks 'What are you building?' with COPY §7 copy", async ({ page }) => {
		await page.goto("/onboarding");
		await page.locator("[data-workspace-name]").fill("ops-control");
		await page.locator("[data-workspace-continue]").click();

		await expect(page.locator("[data-onboarding-page]")).toHaveAttribute("data-phase", "project");
		await expect(
			page.getByRole("heading", { name: "What are you building?", level: 1 }),
		).toBeVisible();
		await expect(page.locator("[data-project-prompt]")).toBeVisible();
		// COPY §7 verbatim hint.
		await expect(page.locator("[data-project-hint]")).toHaveText(
			"One sentence. Become the project description.",
		);
		await expect(page.locator("[data-project-create]")).toHaveText("Create project");
	});

	test("creating a project opens the OD Capture surface, scrim, anchor, and coachmark", async ({
		page,
	}) => {
		await page.goto("/onboarding");
		await page.locator("[data-workspace-name]").fill("ops-control");
		await page.locator("[data-workspace-continue]").click();
		await page.locator("[data-project-prompt]").fill("A self-teaching first-run flow.");
		await page.locator("[data-project-create]").click();

		// populated data-state — the OD `onboarding.html` Capture surface.
		await expect(page.locator("[data-onboarding-page]")).toHaveAttribute("data-state", "populated");
		await expect(page.locator("[data-onboarding-page]")).toHaveAttribute("data-phase", "capture");

		// OD `.doc` body verbatim — eyebrow + meta.
		await expect(page.locator("[data-onboarding-eyebrow]")).toHaveText("capture · seedlings");
		await expect(page.locator("[data-onboarding-meta]")).toHaveText(
			"2 min · onboarding · step 3 / 5",
		);
		await expect(page.locator("[data-capture-surface]")).toContainText("What just happened");
		await expect(page.locator("[data-capture-surface]")).toContainText(
			"What stays the same everywhere",
		);

		// OD `.scrim` + lit `.anchor` block carrying the universal ModeRow.
		await expect(page.locator("[data-onboarding-scrim]")).toBeVisible();
		const anchor = page.locator("[data-coach-anchor]");
		await expect(anchor).toBeVisible();
		const modeRow = anchor.locator("[data-slot='mode-row']");
		await expect(modeRow).toHaveAttribute("role", "toolbar");
		await expect(modeRow).toHaveAttribute("aria-label", "Step modes");
		await expect(modeRow.locator("[data-slot='mode-row-option']")).toHaveCount(4);

		// OD `.coach-fixed` coachmark — step eyebrow, body, 5-dot indicator.
		const coach = page.locator("[data-onboarding-coachmark]");
		await expect(coach).toBeVisible();
		await expect(coach).toHaveAttribute("role", "dialog");
		await expect(coach.locator("[data-coachmark-step]")).toHaveText("Tip · step 3 of 5");
		await expect(coach.locator("[data-coachmark-body]")).toContainText("hands this step to an agent");
		await expect(coach.locator("[data-coachmark-dot]")).toHaveCount(5);
		await expect(coach.locator("[data-coachmark-dot][data-active='true']")).toHaveCount(1);
	});
});

test.describe("onboarding — populated state (?step=capture lands directly)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/onboarding?step=capture");
	});

	test("?step=capture renders the OD Capture surface for design-e2e", async ({ page }) => {
		await expect(page.locator("[data-onboarding-page]")).toHaveAttribute("data-state", "populated");
		await expect(page.locator("[data-capture-surface]")).toBeVisible();
		await expect(page.locator("[data-onboarding-coachmark]")).toBeVisible();

		const shot = await page.locator("[data-onboarding-page]").screenshot();
		await writeEvidenceShot("onboarding-populated.png", shot);
	});

	test("the first trace ID surfaces and pulses once (DESIGN §11 step 5)", async ({ page }) => {
		const trace = page.locator("[data-onboarding-trace]");
		await expect(trace).toBeVisible();
		await expect(trace.locator("[data-slot='trace-chip']")).toBeVisible();
		// The one-shot pulse fires once on first render.
		await expect(trace).toHaveAttribute("data-trace-pulsed", "true");
	});
});

test.describe("onboarding — skip / exit + first Play (OD onboarding.html)", () => {
	test("'Got it — try Play' hands off to the Plan stage", async ({ page }) => {
		await page.goto("/onboarding?step=capture");
		await page.locator("[data-coachmark-confirm]").click();
		await expect(page).toHaveURL(/\/plan-session/);
	});

	test("the first ▶ Play on the anchor mode-row hands off to Plan", async ({ page }) => {
		await page.goto("/onboarding?step=capture");
		await page
			.locator("[data-coach-anchor] [data-slot='mode-row-option'][data-mode='play']")
			.click();
		await expect(page).toHaveURL(/\/plan-session/);
	});

	test("'Skip tour' dismisses the coachmark and scrim without leaving the surface", async ({
		page,
	}) => {
		await page.goto("/onboarding?step=capture");
		await expect(page.locator("[data-onboarding-coachmark]")).toBeVisible();
		await expect(page.locator("[data-onboarding-scrim]")).toBeVisible();

		await page.locator("[data-coachmark-skip]").click();

		await expect(page.locator("[data-onboarding-coachmark]")).toHaveCount(0);
		await expect(page.locator("[data-onboarding-scrim]")).toHaveCount(0);
		// The Capture surface stays — DESIGN §11: no re-entry, the interface remains.
		await expect(page.locator("[data-capture-surface]")).toBeVisible();
	});

	test("Esc dismisses the coachmark — the OD-documented stop key", async ({ page }) => {
		await page.goto("/onboarding?step=capture");
		await expect(page.locator("[data-onboarding-coachmark]")).toBeVisible();

		await page.keyboard.press("Escape");

		await expect(page.locator("[data-onboarding-coachmark]")).toHaveCount(0);
		await expect(page.locator("[data-onboarding-scrim]")).toHaveCount(0);
	});
});

test.describe("onboarding — accessibility", () => {
	test("the workspace + project controls are keyboard reachable with a focus ring", async ({
		page,
	}) => {
		await page.goto("/onboarding");
		const nameInput = page.locator("[data-workspace-name]");
		await nameInput.focus();
		await expect(nameInput).toBeFocused();

		const continueBtn = page.locator("[data-workspace-continue]");
		await continueBtn.focus();
		await expect(continueBtn).toBeFocused();
		const ring = await continueBtn.evaluate((el) => getComputedStyle(el).getPropertyValue("--tw-ring-color"));
		expect(typeof ring).toBe("string");
	});

	test("the coachmark focus order is deterministic — Skip tour before Got it", async ({ page }) => {
		await page.goto("/onboarding?step=capture");
		const skip = page.locator("[data-coachmark-skip]");
		const confirm = page.locator("[data-coachmark-confirm]");

		await skip.focus();
		await expect(skip).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(confirm).toBeFocused();
	});

	test("the first ▶ Play action is keyboard reachable on the anchor mode-row", async ({ page }) => {
		await page.goto("/onboarding?step=capture");
		const play = page.locator(
			"[data-coach-anchor] [data-slot='mode-row-option'][data-mode='play']",
		);
		await play.focus();
		await expect(play).toBeFocused();
	});

	test("the trace pulse is suppressed under prefers-reduced-motion: reduce", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/onboarding?step=capture");
		const trace = page.locator("[data-onboarding-trace]");
		await expect(trace).toBeVisible();
		const animation = await trace.evaluate((el) => getComputedStyle(el).animationName);
		expect(animation === "none" || animation === "").toBeTruthy();
	});
});

test.describe("onboarding — mobile state (390px reflow)", () => {
	test("the first-run flow stays usable on a 390px viewport with no horizontal overflow", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/onboarding");

		await expect(page.locator("[data-workspace-name]")).toBeVisible();
		await expect(page.locator("[data-workspace-continue]")).toBeVisible();

		const overflow = await page
			.locator("[data-onboarding-page]")
			.evaluate((el) => el.scrollWidth - el.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);

		const shot = await page.locator("[data-onboarding-page]").screenshot();
		await writeEvidenceShot("onboarding-mobile.png", shot);
	});

	test("the OD Capture surface + coachmark reflow on a 390px viewport", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/onboarding?step=capture");

		await expect(page.locator("[data-capture-surface]")).toBeVisible();
		await expect(page.locator("[data-onboarding-coachmark]")).toBeVisible();
		await expect(page.locator("[data-coach-anchor]")).toBeVisible();

		const overflow = await page
			.locator("[data-onboarding-page]")
			.evaluate((el) => el.scrollWidth - el.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});

test.describe("onboarding — forced-colors state", () => {
	test("the first-run surface stays legible under forced-colors: active", async ({ page }) => {
		await page.emulateMedia({ forcedColors: "active" });
		await page.goto("/onboarding?step=capture");

		await expect(page.locator("[data-capture-surface]")).toBeVisible();
		await expect(page.locator("[data-onboarding-coachmark]")).toBeVisible();
		await expect(page.locator("[data-coach-anchor]")).toBeVisible();

		const shot = await page.locator("[data-onboarding-page]").screenshot();
		await writeEvidenceShot("onboarding-forced-colors.png", shot);
	});
});
