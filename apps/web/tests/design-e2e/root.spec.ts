import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Rendered design-gate proof for `prd-web-root-default-screen` (IA-MAP §3,
 * `apps/web/CONTEXT.md` PortfolioSurface / WorkflowStage; OD `index.html` +
 * `desktop-shell.html`).
 *
 * The retired root was an `<h1>Dashboard</h1>` over four zero-value
 * MetricCards (`00-executive-review.md` failure 5) — a metric report shown as
 * the default screen. The OD `index.html` canonizes a stage-shell default
 * screen instead. This spec drives the production root `/` over the preview
 * server (no source-only assertions) and proves:
 *
 *  1. With **no active project**, root `/` renders the portfolio Dashboard
 *     PortfolioSurface — a portfolio landing, never the retired metric grid.
 *  2. With an **active project**, root `/` redirects (308) to that project's
 *     Capture WorkflowStage workbench `/<ws>/projects/<projId>/capture`,
 *     through the shared `route-map.ts` grammar.
 *  3. The root never renders a primary `<h1>` of exactly "Dashboard" over a
 *     four-zero-metric card grid (copy assertion).
 *
 * States: `populated`, `forced-colors`.
 */

/** The active-project cookie `getActiveProject` reads (`active-project.ts`). */
const ACTIVE_PROJECT_COOKIE = "fulcrum_active_project";

/** Persist a rendered screenshot to the recovery-packet evidence dir. */
async function writeEvidenceShot(name: string, body: Buffer): Promise<void> {
	const dir = process.env.FULCRUM_DESIGN_EVIDENCE_DIR;
	if (!dir) return;
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, name), body);
}

test.describe("root default screen — no active project (portfolio Dashboard)", () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	test("root / renders the portfolio Dashboard PortfolioSurface, not a metric dashboard", async ({
		page,
	}) => {
		const response = await page.goto("/", { waitUntil: "load" });
		expect(response?.status() ?? 0).toBeLessThan(400);

		// The portfolio Dashboard surface is present with portfolio scope.
		const surface = page.locator("[data-route='portfolio-dashboard']");
		await expect(surface).toBeVisible();
		await expect(surface).toHaveAttribute("data-shell-scope", "portfolio");

		// Its heading is "Portfolio" — a portfolio landing, not "Dashboard".
		await expect(surface.locator("[data-slot='portfolio-hero'] h1")).toHaveText("Portfolio");

		const shot = await page.screenshot({ fullPage: true });
		await test.info().attach("root-portfolio-dashboard", {
			body: shot,
			contentType: "image/png",
		});
		await writeEvidenceShot("root-portfolio-dashboard.png", shot);
	});

	test("root / never renders the retired <h1>Dashboard</h1> four-zero-metric grid", async ({
		page,
	}) => {
		await page.goto("/", { waitUntil: "load" });

		// Copy assertion: no primary heading of exactly "Dashboard".
		const dashboardHeading = page.getByRole("heading", { name: "Dashboard", exact: true });
		await expect(dashboardHeading).toHaveCount(0);

		// The retired metric grid and its MetricCard markers are gone.
		await expect(page.locator("[data-dashboard-header]")).toHaveCount(0);
		await expect(page.locator("[data-metric-card]")).toHaveCount(0);
	});

	test("root / re-homes the run counts as Stat primitives — data relocated, not deleted", async ({
		page,
	}) => {
		await page.goto("/", { waitUntil: "load" });

		// The run counts the metric dashboard carried are re-homed onto the
		// portfolio overview as `@fulcrum/ui-kit` Stat primitives.
		const overview = page.locator("[data-slot='portfolio-overview']");
		await expect(overview).toBeVisible();
		for (const id of ["projects", "open-tasks", "docs", "runs-7d"]) {
			await expect(overview.locator(`[data-stat-id='${id}']`)).toBeVisible();
		}

		// The recent runs / docs / tasks lists are re-homed onto the activity row.
		const activity = page.locator("[data-slot='portfolio-activity']");
		await expect(activity).toBeVisible();
		await expect(activity.locator("[data-recent-runs]")).toBeVisible();
		await expect(activity.locator("[data-recent-docs]")).toBeVisible();
		await expect(activity.locator("[data-top-tasks]")).toBeVisible();
	});

	test("root / portfolio Dashboard holds up under forced-colors", async ({ page }) => {
		await page.emulateMedia({ forcedColors: "active" });
		await page.goto("/", { waitUntil: "load" });
		await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

		const surface = page.locator("[data-route='portfolio-dashboard']");
		await expect(surface).toBeVisible();
		await expect(surface.locator("[data-slot='portfolio-hero'] h1")).toHaveText("Portfolio");

		const shot = await page.screenshot({ fullPage: true });
		await test.info().attach("root-portfolio-dashboard-forced-colors", {
			body: shot,
			contentType: "image/png",
		});
		await writeEvidenceShot("root-portfolio-dashboard-forced-colors.png", shot);
	});
});

test.describe("root default screen — active project (Capture workbench)", () => {
	test("root / with an active project redirects to that project's Capture stage", async ({
		page,
		context,
		baseURL,
	}) => {
		// Seed the active-project cookie — `getActiveProject` validates the slug
		// shape, so the value must be a valid kebab-case slug.
		await context.addCookies([
			{
				name: ACTIVE_PROJECT_COOKIE,
				value: "fulcrum",
				url: baseURL ?? "http://127.0.0.1:4200",
			},
		]);

		await page.goto("/", { waitUntil: "load" });

		// The root resolved to the project's Capture WorkflowStage workbench
		// `/<ws>/projects/<projId>/capture` (route-map.ts `stageRoute` grammar).
		expect(page.url()).toContain("/projects/fulcrum/capture");

		// The Capture workbench is the canonical stage route, not a metric grid.
		const workbench = page.locator("[data-route='ws-stage']");
		await expect(workbench).toHaveAttribute("data-stage", "capture");
		await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toHaveCount(0);

		const shot = await page.screenshot({ fullPage: true });
		await test.info().attach("root-active-project-capture", {
			body: shot,
			contentType: "image/png",
		});
		await writeEvidenceShot("root-active-project-capture.png", shot);
	});

	test("root / preserves the trace hash across the active-project redirect", async ({
		page,
		context,
		baseURL,
	}) => {
		await context.addCookies([
			{
				name: ACTIVE_PROJECT_COOKIE,
				value: "fulcrum",
				url: baseURL ?? "http://127.0.0.1:4200",
			},
		]);

		// IA-MAP §1: "Trace ID survives as URL hash." The root redirect runs
		// `withTrace`, so a `#trace=<id>` deep link to `/` keeps its trace.
		await page.goto("/#trace=9c2e7a1f0d4b", { waitUntil: "load" });
		expect(page.url()).toContain("/projects/fulcrum/capture");
		expect(page.url()).toContain("#trace=9c2e7a1f0d4b");
	});
});
