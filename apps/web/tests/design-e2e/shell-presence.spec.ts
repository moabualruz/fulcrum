import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { captureScreenshot, DESKTOP_VIEWPORT } from "../../scripts/run-design-e2e.ts";

const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;

/**
 * Wave-2 shell-presence design gate (`prd-design-gate-shell-assertions`).
 *
 * `prd-design-gate-rendered-screenshots` (wave 0) is now an assertion-free
 * rendering harness — it boots a real preview server and captures screenshots
 * but explicitly does NOT assert OD shell primitives, because those primitives
 * are wave-1 deliverables (`prd-web-shell-stage-rail`,
 * `prd-web-shell-scope-bar`, `prd-web-shell-status-footer-ai-assist`,
 * `prd-web-global-ai-assist-drawer`). A wave-0 gate could not assert wave-1
 * output, so the shell-presence assertions move HERE, to wave 2, after the
 * shell primitives exist — the gate is now real and can self-resolve.
 *
 * This spec is the shell-assertions half of the split design gate. It CONSUMES
 * the wave-0 harness — it imports `captureScreenshot` / `DESKTOP_VIEWPORT` from
 * `run-design-e2e.ts` and is run by that harness's spec phase — it never
 * re-implements rendering or server bootstrap.
 *
 * It drives chromium over the six required PRODUCTION routes and asserts the
 * OD shell chrome renders on every one of them:
 *   - StageRail   (`[data-slot='stage-rail']`)
 *   - ScopeBar    (`[data-slot='scope-bar']`)
 *   - StatusFooter(`[data-slot='status-footer']`)
 *   - TraceBadge  (`[data-slot='trace-chip'][data-variant='badge']`)
 *   - AI Assist   (StatusFooter `✨ AI Assist` segment + `⌘/` drawer)
 *
 * Source: `index.html`, `desktop-shell.html`, `ai-assist.html`;
 * `DESIGN.md §3` + `§3.1`, `IA-MAP.md §3` + `§5`, `design-alignment/shell.md`.
 *
 * Axis-ownership note (`prd-web-shell-stage-axis-ownership-fix`): the six-stage
 * Capture→Operate workflow axis is owned by the ScopeBar tab strip
 * (`[data-slot='scope-bar-tab']`), NOT the StageRail. The StageRail renders the
 * active stage's sub-navigation and stays synced to the active stage via
 * `data-current`. So "the active stage carries `aria-current`" is proven on the
 * ScopeBar tab (the navigable six-stage axis), and the StageRail's synced
 * active-stage marker is proven via its `data-current` attribute.
 *
 * States covered: `populated` (the rendered shell on every required route) and
 * `forced-colors` (Windows high-contrast emulation — the shell stays present).
 */

/** The six required production routes the OD shell gate covers. */
const REQUIRED_ROUTES = [
	{ path: "/", slug: "root" },
	{ path: "/ai-assist", slug: "ai-assist" },
	{ path: "/build-board", slug: "build-board" },
	{ path: "/runs", slug: "runs" },
	{ path: "/plan-session", slug: "plan-session" },
	{ path: "/operate-mcp", slug: "operate-mcp" },
] as const;

/** Stable data-slot hooks the OD shell primitives expose. */
const STAGE_RAIL = "[data-slot='stage-rail']";
const SCOPE_BAR = "[data-slot='scope-bar']";
const STATUS_FOOTER = "[data-slot='status-footer']";
const TRACE_BADGE = "[data-slot='trace-chip'][data-variant='badge']";
const AI_ASSIST_SEGMENT = "[data-slot='status-footer-ai-assist']";
const ACP_DRAWER = "[data-slot='acp-drawer']";
const MOBILE_STAGE_TABS = "[data-slot='mobile-stage-tabs']";
const MOBILE_AI_ASSIST_TAB = "[data-slot='mobile-stage-tab-ai-assist']";

/** The exact six workflow stage labels — never the legacy `Dashboard` bucket. */
const WORKFLOW_STAGE_LABELS = ["Capture", "Plan", "Build", "Review", "Ship", "Operate"];

/**
 * Persist a rendered screenshot to the recovery-packet evidence dir so the PRD
 * `evidence_refs` can cite an on-disk path. Best-effort: skipped silently when
 * the env var is absent. The harness `captureScreenshot` helper writes the
 * primary artifact into the Playwright test-output dir; this writes a second
 * copy under `.scratch/.../screenshots/` when the gate is run for evidence.
 */
async function writeEvidenceShot(name: string, body: Buffer): Promise<void> {
	const dir = process.env.FULCRUM_DESIGN_EVIDENCE_DIR;
	if (!dir) return;
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, name), body);
}

/** Toggle the global AI Assist drawer with the `⌘/` chord (DESIGN.md §3.1). */
async function pressAiAssistChord(page: Page): Promise<void> {
	// The `⌘/` keydown listener is registered in the layout's `onMount`; wait
	// for the hydration marker so the chord is never pressed before it binds.
	await page.locator("body[data-fulcrum-hydrated='true']").waitFor({ state: "attached" });
	const modifier = process.platform === "darwin" ? "Meta" : "Control";
	await page.keyboard.press(`${modifier}+Slash`);
}

test.describe("OD shell presence — every required production route", () => {
	for (const route of REQUIRED_ROUTES) {
		test(`shell chrome renders on ${route.path}`, async ({ page }, testInfo) => {
			await page.setViewportSize({ ...DESKTOP_VIEWPORT });
			await page.goto(route.path, { waitUntil: "load" });

			// --- StageRail present (DESIGN.md §3.1, IA-MAP.md §3) ---------------
			const rail = page.locator(STAGE_RAIL).first();
			await expect(rail).toBeVisible();

			// --- ScopeBar present (DESIGN.md §3.1: 48px top chrome) -------------
			const scopeBar = page.locator(SCOPE_BAR).first();
			await expect(scopeBar).toBeVisible();

			// --- StatusFooter present (DESIGN.md §3.1: 44px fixed bottom) ------
			const footer = page.locator(STATUS_FOOTER).first();
			await expect(footer).toBeVisible();

			// --- TraceBadge present (DESIGN.md §4.10) --------------------------
			// The shared TraceBadge renders in both the ScopeBar right cluster
			// and the StatusFooter right cluster — at least one must be present.
			const traceBadge = page.locator(TRACE_BADGE).first();
			await expect(traceBadge).toBeVisible();
			await expect(traceBadge.locator("[data-slot='trace-chip-prefix']")).toHaveText("trace:");

			// --- AI Assist entry present (DESIGN.md §3.1, IA-MAP.md §5) --------
			// The AI Assist entry point lives in the StatusFooter right-most
			// segment, accent left-border, `✨ AI Assist` + `⌘/` kbd hint.
			const aiAssist = footer.locator(AI_ASSIST_SEGMENT);
			await expect(aiAssist).toBeVisible();
			await expect(aiAssist).toContainText("AI Assist");

			// Consume the wave-0 harness `captureScreenshot` helper for evidence.
			const dir = testInfo.outputPath("shell-presence-screenshots");
			const artifact = await captureScreenshot(page, `shell-${route.slug}`, { dir });
			expect(artifact).toContain(`shell-${route.slug}.png`);
			await testInfo.attach(`shell-${route.slug}`, { path: artifact, contentType: "image/png" });
			await writeEvidenceShot(`shell-presence-${route.slug}.png`, await page.screenshot({ fullPage: true }));
		});
	}
});

test.describe("OD shell presence — workflow stage axis, never Dashboard", () => {
	test("the root shell renders the six workflow stage labels and never a Dashboard stage-nav label", async ({
		page,
	}) => {
		await page.setViewportSize({ ...DESKTOP_VIEWPORT });
		await page.goto("/", { waitUntil: "load" });

		// The six-stage Capture→Operate axis is owned by the ScopeBar tab strip
		// (`prd-web-shell-stage-axis-ownership-fix`). The tabs must read exactly
		// the six workflow stage labels — in order — and never `Dashboard`.
		const scopeBar = page.locator(SCOPE_BAR).first();
		const tabs = scopeBar.locator("[data-slot='scope-bar-tab']");
		await expect(tabs).toHaveCount(6);
		await expect(tabs).toHaveText(WORKFLOW_STAGE_LABELS);

		// Copy assertion: the legacy `Dashboard` feature-bucket label must not
		// appear anywhere in the ScopeBar stage axis or the StageRail.
		await expect(scopeBar.locator("[data-slot='scope-bar-tab']", { hasText: "Dashboard" })).toHaveCount(0);
		const rail = page.locator(STAGE_RAIL).first();
		await expect(rail.locator("[data-slot='stage-rail-item']", { hasText: "Dashboard" })).toHaveCount(0);
		await expect(rail.locator("[data-slot='stage-rail-substage-item']", { hasText: "Dashboard" })).toHaveCount(0);

		await test.info().attach("shell-presence-stage-axis", {
			body: await page.screenshot({ fullPage: true }),
			contentType: "image/png",
		});
	});

	test("the active stage carries aria-current and the StageRail stays synced via data-current", async ({
		page,
	}) => {
		await page.setViewportSize({ ...DESKTOP_VIEWPORT });

		// Each required route resolves to a workflow stage. The ScopeBar tab for
		// that stage carries `aria-current="page"` (the navigable six-stage
		// axis); the StageRail mirrors the active stage via `data-current`.
		const cases = [
			{ path: "/", stage: "capture" },
			{ path: "/plan-session", stage: "plan" },
			{ path: "/build-board", stage: "build" },
			{ path: "/operate-mcp", stage: "operate" },
		];

		for (const item of cases) {
			await page.goto(item.path, { waitUntil: "load" });

			const activeTab = page.locator("[data-slot='scope-bar-tab'][data-active='true']").first();
			await expect(activeTab).toHaveAttribute("data-stage", item.stage);
			await expect(activeTab).toHaveAttribute("aria-current", "page");

			const rail = page.locator(STAGE_RAIL).first();
			await expect(rail).toHaveAttribute("data-current", item.stage);
		}
	});
});

test.describe("OD shell presence — global AI Assist drawer (⌘/)", () => {
	test("⌘/ opens the global AI Assist drawer on a rendered production route", async ({ page }) => {
		await page.setViewportSize({ ...DESKTOP_VIEWPORT });
		await page.goto("/build-board", { waitUntil: "load" });

		// The drawer is a shell-level overlay, closed until invoked.
		await expect(page.locator(ACP_DRAWER)).toHaveCount(0);

		await pressAiAssistChord(page);

		const drawer = page.locator(ACP_DRAWER);
		await expect(drawer).toBeVisible();
		await expect(drawer).toHaveAttribute("data-open", "true");
		await expect(drawer).toHaveAttribute("role", "dialog");
		await expect(drawer.locator("[data-slot='acp-drawer-title']")).toHaveText("AI Assist");

		await test.info().attach("shell-presence-ai-assist-drawer", {
			body: await page.screenshot({ fullPage: false }),
			contentType: "image/png",
		});
		await writeEvidenceShot("shell-presence-ai-assist-drawer.png", await page.screenshot({ fullPage: false }));
	});

	test("the StatusFooter AI Assist segment opens the same shell drawer", async ({ page }) => {
		await page.setViewportSize({ ...DESKTOP_VIEWPORT });
		await page.goto("/runs", { waitUntil: "load" });

		const aiAssist = page.locator(STATUS_FOOTER).first().locator(AI_ASSIST_SEGMENT);
		await expect(aiAssist).toBeVisible();
		await aiAssist.click();

		const drawer = page.locator(ACP_DRAWER);
		await expect(drawer).toBeVisible();
		await expect(drawer).toHaveAttribute("data-open", "true");
	});
});

test.describe("OD shell presence — mobile bottom stage tabs", () => {
	for (const route of REQUIRED_ROUTES) {
		test(`mobile bottom stage tabs render on ${route.path}`, async ({ page }) => {
			await page.setViewportSize({ ...MOBILE_VIEWPORT });
			await page.goto(route.path, { waitUntil: "load" });

			await expect(page.locator(STATUS_FOOTER)).toHaveCount(0);
			await expect(page.locator("[data-mobile-sheet-trigger]")).toHaveCount(0);

			const tabs = page.locator(MOBILE_STAGE_TABS);
			await expect(tabs).toBeVisible();
			await expect(tabs.locator("[data-slot='mobile-stage-tab-label']")).toHaveText([
				"Capture",
				"Plan",
				"Build",
				"Review",
				"Ship",
				"Operate",
				"AI Assist",
			]);
			await expect(tabs.locator(MOBILE_AI_ASSIST_TAB)).toBeVisible();

			if ((await page.locator(ACP_DRAWER).count()) === 0) {
				await tabs.locator(MOBILE_AI_ASSIST_TAB).click();
			}
			const drawer = page.locator(ACP_DRAWER);
			await expect(drawer).toBeVisible();
			await expect(drawer).toHaveAttribute("data-open", "true");
			await expect(drawer.locator("[data-slot='acp-drawer-title']")).toHaveText("AI Assist");

			await writeEvidenceShot(`shell-mobile-bottom-tabs-${route.slug}.png`, await page.screenshot({ fullPage: true }));
		});
	}

	test("mobile Cmd+/ opens the same global AI Assist bottom sheet", async ({ page }) => {
		await page.setViewportSize({ ...MOBILE_VIEWPORT });
		await page.goto("/operate-mcp", { waitUntil: "load" });
		await expect(page.locator(ACP_DRAWER)).toHaveCount(0);

		await pressAiAssistChord(page);

		const drawer = page.locator(ACP_DRAWER);
		await expect(drawer).toBeVisible();
		await expect(drawer).toHaveAttribute("data-side", "bottom");
		await expect(drawer.locator("[data-slot='acp-drawer-title']")).toHaveText("AI Assist");
		await writeEvidenceShot("shell-mobile-ai-assist-bottom-sheet.png", await page.screenshot({ fullPage: true }));
	});
});

test.describe("OD shell presence — forced-colors", () => {
	test("the shell chrome stays present under Windows high-contrast emulation", async ({ page }) => {
		await page.emulateMedia({ forcedColors: "active" });
		await page.setViewportSize({ ...DESKTOP_VIEWPORT });
		await page.goto("/", { waitUntil: "load" });

		await expect(page.locator(STAGE_RAIL).first()).toBeVisible();
		await expect(page.locator(SCOPE_BAR).first()).toBeVisible();
		const footer = page.locator(STATUS_FOOTER).first();
		await expect(footer).toBeVisible();
		await expect(footer.locator(AI_ASSIST_SEGMENT)).toBeVisible();
		await expect(page.locator(TRACE_BADGE).first()).toBeVisible();

		await test.info().attach("shell-presence-forced-colors", {
			body: await page.screenshot({ fullPage: true }),
			contentType: "image/png",
		});
	});
});
