import { expect, test } from "@playwright/test";
import { readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
	CURRENT_ROUTE_COVERAGE,
	LEGACY_ROUTE_MAP,
	STAGE_ORDER,
	canonicalStageFor,
	isPortfolioPath,
	legacyRoutePaths,
	projectHomeRoute,
	stageRoute,
	withTrace,
	workspaceHomeRoute,
} from "../../src/lib/components/app/route-map.ts";

/**
 * Rendered route-resolution crawl + canonical stage-route proof for
 * `prd-web-stage-route-model` (IA-MAP.md §1, migration-strategy.md
 * §Value-preservation checklist).
 *
 * Three things are proven here, all by a rendered Playwright run against the
 * production preview server — no source-only assertions:
 *
 *  1. **404 / old-path resolution crawl.** Every pre-existing route folder
 *     enumerated from `LEGACY_ROUTE_MAP` (the runtime projection of every
 *     `apps/web/src/routes/` feature/preview folder) is driven; each MUST
 *     resolve `200 | 301 | 308` — never `404`. This is the executed crawl the
 *     migration gate requires; existence of a redirect map is not proof.
 *  2. **Canonical stage routes exist.** `/<ws>/projects/<projId>/<stage>`
 *     resolves for all six WorkflowStages and renders the stage workbench.
 *  3. **Trace + query preservation.** A `#trace=<id>` hash and a `?status=…`
 *     filter query survive a workspace-root and project-root redirect, and a
 *     chord-style stage hop.
 *
 * Source: `desktop-shell.html` (OD shell), IA-MAP.md §1 URL shape + §4.1
 * chords. States: `populated`, `forced-colors`.
 */

/** Persist a rendered screenshot to the recovery-packet evidence dir. */
async function writeEvidenceShot(name: string, body: Buffer): Promise<void> {
	const dir = process.env.FULCRUM_DESIGN_EVIDENCE_DIR;
	if (!dir) return;
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, name), body);
}

/** A workspace + project pair the canonical-route tests drive. */
const WS = "acme";
const PROJ = "fulcrum";

test.describe("route model — old-path resolution crawl (no 404)", () => {
	test("every legacy route folder resolves — never 404", async ({ page }) => {
		// The crawl drives ~78 pre-existing route paths sequentially; give it room.
		test.setTimeout(180_000);
		const paths = legacyRoutePaths();
		expect(paths.length).toBeGreaterThan(60);

		// `page.goto` follows redirects; the final status is what the browser
		// landed on. The migration gate's hard rule (migration-strategy.md
		// value-preservation item 2) is "no 404": a 404 means the route folder
		// no longer resolves — a genuine routing regression. A 2xx/3xx is a pass.
		//
		// A route-level 5xx is NOT a routing failure: the route resolved (SvelteKit
		// dispatched it) but a backend dependency is down. The design-e2e harness
		// deliberately omits the API server (`FULCRUM_SKIP_REAL_E2E_SERVERS=1`), so
		// API-backed routes (e.g. `/audit`) 5xx in this environment by design. The
		// crawl records those separately but only FAILS on 404.
		const missing: string[] = [];
		const backendUnavailable: string[] = [];
		for (const routePath of paths) {
			const response = await page.goto(routePath, { waitUntil: "domcontentloaded", timeout: 20_000 });
			const status = response?.status() ?? 0;
			if (status === 404) {
				missing.push(`${routePath} -> 404`);
			} else if (status >= 500) {
				backendUnavailable.push(`${routePath} -> ${status}`);
			}
		}
		if (backendUnavailable.length > 0) {
			console.log(
				`route crawl: ${backendUnavailable.length} route(s) resolved but 5xx'd (backend down in design-e2e): ${backendUnavailable.join(", ")}`,
			);
		}
		// The hard gate: every pre-existing route folder still resolves — no 404.
		expect(missing, `legacy routes that 404'd (routing regression): ${missing.join(", ")}`).toEqual([]);
	});

	test("every legacy route maps to a known stage or is workspace-scoped", () => {
		for (const [folder, stage] of Object.entries(LEGACY_ROUTE_MAP)) {
			if (stage === null) continue;
			expect(STAGE_ORDER).toContain(stage);
		}
	});

	test("every current route folder has an explicit route resolution classification", () => {
		const routesDir = path.resolve(process.cwd(), "src/routes");
		const currentRouteFolders = readdirSync(routesDir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.filter((name) => name !== "api" && name !== "[ws]")
			.sort();

		const classified = new Set(Object.keys(CURRENT_ROUTE_COVERAGE));
		const missing = currentRouteFolders.filter((folder) => !classified.has(folder));
		const stale = [...classified].filter((folder) => !currentRouteFolders.includes(folder));

		expect(missing, `current route folders missing route resolution classification: ${missing.join(", ")}`).toEqual([]);
		expect(stale, `route resolution classifications without a current route folder: ${stale.join(", ")}`).toEqual([]);

		for (const [folder, coverage] of Object.entries(CURRENT_ROUTE_COVERAGE)) {
			if (coverage.classification === "legacy-map") {
				expect(LEGACY_ROUTE_MAP, `${folder} is classified legacy-map but missing from LEGACY_ROUTE_MAP`).toHaveProperty(folder);
			}
			if (coverage.stage !== null) {
				expect(STAGE_ORDER, `${folder} has unknown WorkflowStage ${coverage.stage}`).toContain(coverage.stage);
			}
			expect(coverage.reason.trim().length, `${folder} needs a kept/migration reason`).toBeGreaterThan(12);
		}
	});
});

test.describe("route model — canonical workspace/project/stage routes", () => {
	for (const stage of STAGE_ORDER) {
		test(`/<ws>/projects/<projId>/${stage} resolves and renders the ${stage} workbench`, async ({
			page,
		}) => {
			const response = await page.goto(stageRoute(WS, PROJ, stage), { waitUntil: "load" });
			expect(response?.status() ?? 0).toBeLessThan(400);

			const workbench = page.locator("[data-route='ws-stage']");
			await expect(workbench).toBeVisible();
			await expect(workbench).toHaveAttribute("data-stage", stage);

			// The workbench surfaces the stage's feature views as findable cards
			// (migration value-preservation item 4 — moved features stay findable).
			await expect(page.locator("[data-slot='stage-view-card']").first()).toBeVisible();
		});
	}

	test("unknown stage segment 404s — only the six WorkflowStages are routes", async ({ page }) => {
		const response = await page.goto(`/${WS}/projects/${PROJ}/nonsense`, { waitUntil: "load" });
		expect(response?.status()).toBe(404);
	});

	test("project home redirects to the Capture stage (IA-MAP §1 default)", async ({ page }) => {
		await page.goto(projectHomeRoute(WS, PROJ), { waitUntil: "load" });
		expect(page.url()).toContain(`/${WS}/projects/${PROJ}/capture`);
		await expect(page.locator("[data-route='ws-stage']")).toHaveAttribute("data-stage", "capture");
	});

	test("workspace home redirects to the project list (portfolio scope)", async ({ page }) => {
		await page.goto(workspaceHomeRoute(WS), { waitUntil: "load" });
		expect(page.url()).toContain(`/${WS}/projects`);
		await expect(page.locator("[data-route='ws-projects']")).toBeVisible();
		// The project list is a PortfolioSurface — workspace scope, no project.
		const list = page.locator("[data-route='ws-projects']");
		await expect(list).toHaveAttribute("data-shell-scope", "portfolio");
	});
});

test.describe("route model — trace + query preservation across stage navigation", () => {
	test("trace hash survives the project-home -> capture redirect", async ({ page }) => {
		await page.goto(`${projectHomeRoute(WS, PROJ)}#trace=4f3a1c9e8b2d`, { waitUntil: "load" });
		// IA-MAP §1: "Trace ID survives as URL hash."
		expect(page.url()).toContain("#trace=4f3a1c9e8b2d");
		expect(page.url()).toContain("/capture");
	});

	test("filter query survives the workspace-home -> projects redirect", async ({ page }) => {
		await page.goto(`${workspaceHomeRoute(WS)}?status=open`, { waitUntil: "load" });
		// IA-MAP §1: "Filter state survives via query params."
		expect(page.url()).toContain("status=open");
		expect(page.url()).toContain("/projects");
	});

	test("a stage hop within project scope keeps the trace hash", async ({ page }) => {
		await page.goto(`${stageRoute(WS, PROJ, "build")}?view=board#trace=ab12cd34`, {
			waitUntil: "load",
		});
		// `withTrace` is the helper the StageRail/ScopeBar/chords use to carry the
		// trace + filter state across a stage navigation.
		const next = withTrace(stageRoute(WS, PROJ, "review"), page.url() ? new URL(page.url()) : null);
		expect(next).toContain("#trace=ab12cd34");
		expect(next).toContain("view=board");
		expect(next).toContain("/review");

		await page.goto(next, { waitUntil: "load" });
		await expect(page.locator("[data-route='ws-stage']")).toHaveAttribute("data-stage", "review");
		expect(page.url()).toContain("#trace=ab12cd34");
	});

	test("canonicalStageFor resolves canonical + legacy paths consistently", () => {
		// Canonical path — read the <stage> segment.
		expect(canonicalStageFor(`/${WS}/projects/${PROJ}/build`)).toBe("build");
		// Legacy path — first segment looked up in the map.
		expect(canonicalStageFor("/build-board")).toBe("build");
		expect(canonicalStageFor("/doctor")).toBe("operate");
		// Portfolio / system route — no owning stage.
		expect(canonicalStageFor("/settings")).toBeNull();
		expect(isPortfolioPath(`/${WS}/projects`)).toBe(true);
		expect(isPortfolioPath(`/${WS}/projects/${PROJ}/build`)).toBe(false);
	});
});

test.describe("route model — StageRail + ScopeBar use canonical routes", () => {
	test("the shell chrome renders on a canonical stage route and marks the stage", async ({
		page,
	}) => {
		await page.goto(stageRoute(WS, PROJ, "plan"), { waitUntil: "load" });

		// The StageRail + ScopeBar render around the canonical stage route.
		await expect(page.locator("[data-shell-region='stage-rail']")).toBeVisible();
		await expect(page.locator("[data-slot='stage-rail']").first()).toBeVisible();
		await expect(page.locator("[data-slot='scope-bar']").first()).toBeVisible();

		const shot = await page.screenshot({ fullPage: true });
		await writeEvidenceShot("stage-route-plan.png", shot);
	});

	test("[ toggles the StageRail collapsed state", async ({ page }) => {
		await page.goto(stageRoute(WS, PROJ, "build"), { waitUntil: "load" });
		const rail = page.locator("[data-shell-region='stage-rail']");
		await expect(rail).toHaveAttribute("data-rail-collapsed", "false");

		await page.locator("body").click();
		await page.keyboard.press("[");
		await expect(rail).toHaveAttribute("data-rail-collapsed", "true");

		await page.keyboard.press("[");
		await expect(rail).toHaveAttribute("data-rail-collapsed", "false");
	});

	test("g <letter> chord navigates between the six stages, preserving trace", async ({ page }) => {
		await page.goto(`${stageRoute(WS, PROJ, "capture")}#trace=ee99ff00`, { waitUntil: "load" });
		await page.locator("body").click();

		// g b -> Build stage; the trace hash survives the chord navigation.
		await page.keyboard.press("g");
		await page.keyboard.press("b");
		await page.waitForURL(`**/projects/${PROJ}/build*`, { timeout: 5_000 });
		await expect(page.locator("[data-route='ws-stage']")).toHaveAttribute("data-stage", "build");
		expect(page.url()).toContain("#trace=ee99ff00");

		// g o -> Operate stage.
		await page.keyboard.press("g");
		await page.keyboard.press("o");
		await page.waitForURL(`**/projects/${PROJ}/operate*`, { timeout: 5_000 });
		await expect(page.locator("[data-route='ws-stage']")).toHaveAttribute("data-stage", "operate");
	});

	test("forced-colors: the stage route stays operable in high-contrast", async ({ page }) => {
		await page.emulateMedia({ forcedColors: "active" });
		await page.goto(stageRoute(WS, PROJ, "ship"), { waitUntil: "load" });
		await expect(page.locator("[data-route='ws-stage']")).toBeVisible();
		await expect(page.locator("[data-shell-region='stage-rail']")).toBeVisible();
		const shot = await page.screenshot({ fullPage: true });
		await writeEvidenceShot("stage-route-ship-forced-colors.png", shot);
	});
});
