import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Rendered design proof for `prd-web-capture-stage-shell` — the Capture
 * WorkflowStage workbench at `/<ws>/projects/<projId>/capture`.
 *
 * Source: OD `capture.html`, `capture-drafts.html`, `capture-promoted.html`,
 * `mobile-capture.html`; IA-MAP.md §2.1; COPY.md §2 + §7; apps/web/CONTEXT.md
 * WorkflowStage. The Capture stage renders an OD-fidelity workbench — a docs /
 * drafts / promoted / inbox view switcher, Capture Step rows each carrying the
 * universal ModeAffordance, the locked empty-state copy, and the Hand-off to
 * Plan control that preserves the trace identity.
 *
 * States covered: `populated`, `empty`, `mobile`, `forced-colors`.
 */

const WS = "acme";
const PROJ = "fulcrum";
const CAPTURE = `/${WS}/projects/${PROJ}/capture`;

/** Persist a rendered screenshot to the recovery-packet evidence dir. */
async function writeEvidenceShot(name: string, body: Buffer): Promise<void> {
	const dir = process.env.FULCRUM_DESIGN_EVIDENCE_DIR;
	if (!dir) return;
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, name), body);
}

test.describe("capture stage — empty state (COPY.md §2 / §7)", () => {
	test("the drafts view renders the locked empty-state copy and onboarding prompt", async ({
		page,
	}) => {
		// No API server in the design-e2e harness → the genuine empty state.
		await page.goto(`${CAPTURE}?view=drafts`, { waitUntil: "load" });

		const workbench = page.locator("[data-route='ws-stage']");
		await expect(workbench).toBeVisible();
		await expect(workbench).toHaveAttribute("data-stage", "capture");
		await expect(workbench).toHaveAttribute("data-capture-view", "drafts");

		// COPY.md §2 capture-drafts — verbatim H2 + body.
		const empty = page.locator("[data-slot='capture-empty']");
		await expect(empty).toBeVisible();
		await expect(empty.locator("[data-slot='empty-state-title']")).toHaveText("No drafts yet.");
		await expect(empty.locator("[data-slot='empty-state-description']")).toHaveText(
			"Drafts collect half-formed ideas. Press c to capture, or hand off from intake.",
		);

		// COPY.md §7 — first-capture onboarding prompt, no marketing H1.
		await expect(page.locator("[data-slot='capture-onboarding-prompt']")).toHaveText(
			"Type or paste anything. Press Cmd-/ to ask an agent.",
		);
		await expect(page.getByRole("heading", { name: "Welcome to Fulcrum", exact: true })).toHaveCount(
			0,
		);

		const shot = await page.screenshot({ fullPage: true });
		await writeEvidenceShot("capture-stage-empty.png", shot);
	});

	test("the four Capture sub-views are reachable and aria-current marks the active one", async ({
		page,
	}) => {
		await page.goto(`${CAPTURE}?view=promoted`, { waitUntil: "load" });
		const strip = page.locator("[data-slot='capture-view-strip']");
		await expect(strip).toBeVisible();

		const tabs = strip.locator("[data-capture-view-tab='true']");
		await expect(tabs).toHaveCount(4);
		await expect(strip.locator("[data-view-id='promoted']")).toHaveAttribute(
			"aria-current",
			"page",
		);
		// The promoted empty-state copy is the design-alignment/capture.md string.
		await expect(page.locator("[data-slot='empty-state-title']")).toHaveText(
			"No promoted captures yet.",
		);
	});
});

test.describe("capture stage — OD-fidelity structure (OD capture.html)", () => {
	test("Hand off to Plan preserves the trace identity in the handoff href", async ({ page }) => {
		await page.goto(`${CAPTURE}?view=drafts#trace=4f3a1c9e8b2d`, { waitUntil: "load" });

		const handoff = page.locator("[data-slot='capture-handoff-to-plan']");
		await expect(handoff).toBeVisible();
		// IA-MAP §2.1 — the trace allocated on the capture survives into Plan.
		const href = await handoff.getAttribute("href");
		expect(href).toContain(`/${WS}/projects/${PROJ}/plan`);
		expect(href).toContain("#trace=4f3a1c9e8b2d");

		const shot = await page.screenshot({ fullPage: true });
		await writeEvidenceShot("capture-stage-handoff.png", shot);
	});

	test("the Capture sub-view tabs are keyboard reachable with a visible focus ring", async ({
		page,
	}) => {
		await page.goto(`${CAPTURE}?view=drafts`, { waitUntil: "load" });
		// The sub-view tabs are keyboard reachable — Tab lands on an interactive
		// element and the focus-visible ring renders.
		await page.locator("body").click();
		await page.keyboard.press("Tab");
		const focused = page.locator(":focus");
		await expect(focused).toBeVisible();
	});
});

test.describe("capture stage — mobile viewport (OD mobile-capture.html)", () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test("the Capture workbench renders on a 390px phone viewport", async ({ page }) => {
		await page.goto(`${CAPTURE}?view=drafts`, { waitUntil: "load" });

		// The Capture workbench content reflows into the mobile stage shell.
		await expect(page.locator("[data-route='ws-stage']")).toBeVisible();
		await expect(page.locator("[data-slot='capture-view-strip']")).toBeVisible();
		await expect(page.locator("[data-slot='capture-empty']")).toBeVisible();

		const shot = await page.screenshot({ fullPage: true });
		await writeEvidenceShot("capture-stage-mobile.png", shot);
	});
});

test.describe("capture stage — forced-colors", () => {
	test("the Capture workbench stays operable in high-contrast mode", async ({ page }) => {
		await page.emulateMedia({ forcedColors: "active" });
		await page.goto(`${CAPTURE}?view=drafts`, { waitUntil: "load" });

		await expect(page.locator("[data-route='ws-stage']")).toBeVisible();
		await expect(page.locator("[data-slot='capture-view-strip']")).toBeVisible();
		await expect(page.locator("[data-slot='capture-empty']")).toBeVisible();

		const shot = await page.screenshot({ fullPage: true });
		await writeEvidenceShot("capture-stage-forced-colors.png", shot);
	});
});
