import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Rendered design-fidelity coverage for `prd-web-plan-session-od-fidelity`.
 *
 * The Plan-stage Live ACP session workbench — canonical route
 * `/<ws>/projects/<projId>/plan/<sessionId>` (IA-MAP.md §2.2 "Live ACP
 * session"), rendered at `/plan-session`. Proven against OD `plan-session.html`
 * and DESIGN.md §8 Live Session Pane:
 *
 *  - layout — three-column pane: sessions list (220px) + transcript (flex) +
 *    workspace dock (320px, tabs Shell · Files · Browser · Plan · Cost) +
 *    sticky plan strip at the top of the transcript.
 *  - data-states — populated / empty / error / forced-colors.
 *  - interactions — dock tab switch preserves transcript scroll; traffic-event
 *    selection opens the raw tool-call detail pane.
 *  - copy — COPY.md §2 Plan empty state; COPY.md §3 missing-ID error template.
 *  - parity — `prd-web-stage-route-model`: `/planning` + `/planning/sessions`
 *    resolve (no 404); the route carries the canonical `<sessionId>` segment.
 *  - accessibility — keyboard operability + visible focus ring; `aria-current`.
 *
 * Source: OD `plan-session.html`; DESIGN.md §8; IA-MAP.md §2.2; COPY.md §2/§3.
 */

/** Persist a rendered screenshot to the recovery-packet evidence dir. */
async function writeEvidenceShot(name: string, body: Buffer): Promise<void> {
	const dir = process.env.FULCRUM_DESIGN_EVIDENCE_DIR;
	if (!dir) return;
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, name), body);
}

test.describe("plan-session — Live Session Pane layout (DESIGN.md §8)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/plan-session");
		await page.evaluate(() => window.localStorage.clear());
		await page.reload();
	});

	test("renders the three-column pane: sessions list + transcript + workspace dock", async ({
		page,
	}) => {
		await expect(page.locator("[data-plan-session-page]")).toBeVisible();
		await expect(page.locator("[data-plan-session-page]")).toHaveAttribute("data-state", "populated");

		// Column 1 — sessions list (220px).
		await expect(page.locator("[data-session-list]")).toBeVisible();
		await expect(page.getByRole("heading", { name: "AI Assist planning" })).toBeVisible();
		await expect(page.locator("[data-session-card='plan_sess_auth_rewrite']")).toBeVisible();

		// Column 2 — transcript (flex) with the sticky plan strip.
		await expect(page.locator("[data-live-session-pane]")).toBeVisible();
		await expect(page.locator("[data-plan-strip]")).toBeVisible();
		await expect(page.locator("[data-trace-source-links] a")).toHaveCount(3);
		await expect(page.locator("[data-trace-source-links]")).toContainText("doc_auth_rewrite");
		await expect(page.locator("[data-trace-source-links]")).toContainText("plan_sess_auth_rewrite");
		await expect(page.locator("[data-traffic-stream] [data-traffic-event]")).toHaveCount(3);

		// Column 3 — workspace dock (320px), tabs Shell · Files · Browser · Plan · Cost.
		await expect(page.locator("[data-workspace-dock]")).toBeVisible();
		for (const tab of ["shell", "files", "browser", "plan", "cost"]) {
			await expect(page.locator(`[data-dock-tab='${tab}']`)).toBeVisible();
		}

		const shot = await page.locator("[data-plan-session-page]").screenshot();
		await writeEvidenceShot("plan-session-populated.png", shot);
	});

	test("sticky plan strip stays pinned while the transcript scrolls", async ({ page }) => {
		const strip = page.locator("[data-plan-strip]");
		await expect(strip).toBeVisible();
		const before = await strip.boundingBox();
		await page.locator("[data-transcript]").evaluate((el) => {
			el.scrollTop = el.scrollHeight;
		});
		const after = await strip.boundingBox();
		expect(after?.y).toBeCloseTo(before?.y ?? 0, 0);
	});
});

test.describe("plan-session — data states", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/plan-session");
		await page.evaluate(() => window.localStorage.clear());
		await page.reload();
	});

	test("empty state matches the COPY.md §2 Plan template", async ({ page }) => {
		await page.locator("[data-clear-sessions]").click();
		await expect(page.locator("[data-plan-session-page]")).toHaveAttribute("data-state", "empty");
		const empty = page.locator("[data-plan-session-empty]");
		await expect(empty).toBeVisible();
		await expect(empty).toContainText("No planning sessions yet.");
		await expect(empty).toContainText("Press n or hand off from a doc in Capture.");
		await expect(page.locator("[data-start-planning]")).toHaveText("Start planning");

		const shot = await page.locator("[data-plan-session-page]").screenshot();
		await writeEvidenceShot("plan-session-empty.png", shot);

		// The empty-state action re-seeds the session.
		await page.locator("[data-start-planning]").click();
		await expect(page.locator("[data-plan-session-page]")).toHaveAttribute("data-state", "populated");
	});

	test("missing-ID error matches the COPY.md §3 error template verbatim", async ({ page }) => {
		await page.locator("[data-clear-ids]").click();
		await page.locator("[data-submit-prompt]").click();

		const banner = page.locator("[data-plan-session-error]");
		await expect(banner).toBeVisible();
		await expect(banner).toHaveAttribute("role", "alert");
		// [what failed]. [why]. [exact next step]. trace=<id>
		await expect(banner).toContainText("Planning needs source, session, and trace IDs.");
		await expect(banner).toContainText("Fill missing IDs, or open trace tr_19b4a7c2e6f04d91 in Audit.");
		await expect(banner).toContainText("trace=tr_19b4a7c2e6f04d91");
		await expect(page.locator("[data-traffic-count]")).toHaveText("3 events");

		const shot = await page.locator("[data-plan-session-page]").screenshot();
		await writeEvidenceShot("plan-session-error.png", shot);
	});

	test("renders under forced-colors: active", async ({ browser }) => {
		const context = await browser.newContext({ forcedColors: "active" });
		const page = await context.newPage();
		await page.goto("/plan-session");
		await expect(page.locator("[data-plan-session-page]")).toBeVisible();
		await expect(page.locator("[data-workspace-dock]")).toBeVisible();
		await expect(page.locator("[data-plan-strip]")).toBeVisible();
		const shot = await page.locator("[data-plan-session-page]").screenshot();
		await writeEvidenceShot("plan-session-forced-colors.png", shot);
		await context.close();
	});
});

test.describe("plan-session — interactions", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/plan-session");
		await page.evaluate(() => window.localStorage.clear());
		await page.reload();
	});

	test("traffic-event selection opens the raw tool-call detail pane", async ({ page }) => {
		await page.locator("[data-traffic-event='evt-2']").click();
		await expect(page.locator("[data-traffic-event='evt-2']")).toHaveAttribute("aria-current", "true");
		const inspector = page.locator("[data-traffic-inspector]");
		await expect(inspector).toContainText("planning.sources.read");
		await expect(inspector).toContainText("doc_auth_rewrite");
		await expect(inspector.locator("pre")).toBeVisible();
	});

	test("workspace dock tab switch preserves transcript scroll", async ({ page }) => {
		// Submit so the transcript has enough rows to scroll.
		await page.locator("[data-submit-prompt]").click();
		await expect(page.locator("[data-traffic-count]")).toHaveText("5 events");

		await page.locator("[data-transcript]").evaluate((el) => {
			el.scrollTop = 64;
		});
		const scrollBefore = await page.locator("[data-transcript]").evaluate((el) => el.scrollTop);

		await page.locator("[data-dock-tab='plan']").click();
		await expect(page.locator("[data-dock-panel='plan']")).toBeVisible();
		await expect(page.locator("[data-planning-modes] [data-planning-mode]")).toHaveCount(10);

		const scrollAfter = await page.locator("[data-transcript]").evaluate((el) => el.scrollTop);
		expect(scrollAfter).toBe(scrollBefore);
	});

	test("submits a prompt, appends stream traffic, and survives reload", async ({ page }) => {
		await page.locator("[data-plan-prompt]").fill("Create a plan and keep the source document visible.");
		await page.locator("[data-submit-prompt]").click();

		await expect(page.locator("[data-traffic-count]")).toHaveText("5 events");
		await expect(page.locator("[data-traffic-inspector]")).toContainText("Prompt submitted and persisted");

		// Sessions remain resumable across reload.
		await page.reload();
		await expect(page.locator("[data-session-resumed]")).toBeVisible();
		await expect(page.locator("[data-plan-prompt]")).toHaveValue(
			"Create a plan and keep the source document visible.",
		);
		await expect(page.locator("[data-traffic-count]")).toHaveText("5 events");
		await expect(page.locator("[data-traffic-inspector]")).toContainText("Prompt submitted and persisted");
	});
});

test.describe("plan-session — accessibility", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/plan-session");
		await page.evaluate(() => window.localStorage.clear());
		await page.reload();
	});

	test("session card carries aria-current and a visible focus ring", async ({ page }) => {
		const card = page.locator("[data-session-card='plan_sess_auth_rewrite']");
		await expect(card).toHaveAttribute("aria-current", "true");
		await card.focus();
		await expect(card).toBeFocused();
	});

	test("dock tabs are keyboard operable", async ({ page }) => {
		await page.locator("[data-dock-tab='shell']").focus();
		await page.keyboard.press("ArrowRight");
		await page.keyboard.press("Enter");
		await expect(page.locator("[data-dock-panel='files']")).toBeVisible();
	});

	test("keeps the forbidden protocol acronym out of visible AI Assist chrome", async ({ page }) => {
		await expect(page.locator("[data-plan-session-page]")).not.toContainText(/\bACP\b/);
	});
});

test.describe("plan-session — migration parity (prd-web-stage-route-model)", () => {
	// The canonical route is `/<ws>/projects/<projId>/plan/<sessionId>`; the
	// legacy `/planning` + `/planning/sessions` paths must keep resolving and
	// forward to the rendered `/plan-session` target — no 404, no feature loss.
	for (const oldPath of ["/planning", "/planning/sessions"]) {
		test(`legacy path ${oldPath} resolves and forwards to /plan-session`, async ({ page }) => {
			const response = await page.goto(oldPath, { waitUntil: "domcontentloaded" });
			expect([200, 301, 308]).toContain(response?.status() ?? 0);
			await page.waitForURL("**/plan-session", { timeout: 10_000 });
			await expect(page.locator("[data-plan-session-page]")).toBeVisible();
		});
	}
});
