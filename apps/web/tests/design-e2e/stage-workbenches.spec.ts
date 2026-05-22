import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
	STAGE_ORDER,
	canonicalRouteForLegacyPath,
	stageRoute,
	stageSubroute,
} from "../../src/lib/components/app/route-map.ts";

const WS = "acme";
const PROJ = "fulcrum";
const BUILD_RUN_ID = "run_56e3d12";
const LEGACY_RUN_DETAIL_ROUTES = [
	"/run-detail",
	"/run-cancel",
	"/run-cost-tracking",
	"/run-fork",
	"/run-rate-limits",
	"/run-retry-policy",
	"/run-retry-prompt",
] as const;

const STAGE_WORKBENCH_ANCHOR = {
	capture: "[data-route='ws-stage'][data-stage='capture']",
	plan: "[data-route='plan-session']",
	build: "[data-build-board]",
	review: "[data-review-queue]",
	ship: "[data-ship-release-table]",
	operate: "[data-route='operate-doctor']",
} as const;

async function writeEvidenceShot(name: string, body: Buffer): Promise<void> {
	const dir = process.env.FULCRUM_DESIGN_EVIDENCE_DIR;
	if (!dir) return;
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, name), body);
}

function buildRunDetailRoute(ws: string, proj: string, runId: string): string {
	return `${stageSubroute(ws, proj, "build", "runs")}/${runId}`;
}

test.describe("project-scoped stage workbench projection", () => {
	for (const stage of STAGE_ORDER) {
		test(`${stage} project route lands on the canonical OD workbench`, async ({ page }) => {
			const response = await page.goto(stageRoute(WS, PROJ, stage), { waitUntil: "load" });
			expect(response?.status() ?? 0).toBeLessThan(400);

			await expect(page.locator(STAGE_WORKBENCH_ANCHOR[stage]).first()).toBeVisible();
			await expect(page.locator("[data-slot='stage-view-grid']")).toHaveCount(0);
			expect(new URL(page.url()).pathname).toBe(stageRoute(WS, PROJ, stage));

			const shot = await page.screenshot({ fullPage: true });
			await writeEvidenceShot(`stage-workbench-${stage}.png`, shot);
		});
	}

	const legacyRoutes = ["/plan-session", "/build-board", "/review", "/ship", "/doctor"] as const;
	for (const legacyRoute of legacyRoutes) {
		test(`${legacyRoute} remains a 308 redirect to its canonical wrapper`, async ({ page }) => {
			const response = await page.request.get(legacyRoute, { maxRedirects: 0 });
			expect(response.status()).toBe(308);
			const location = response.headers().location;
			expect(location).toBe(canonicalRouteForLegacyPath(legacyRoute, "mkh", "fulcrum"));
		});
	}

	for (const legacyRoute of LEGACY_RUN_DETAIL_ROUTES) {
		test(`${legacyRoute} remains a 308 redirect to the canonical Build run detail`, async ({
			page,
		}) => {
			const response = await page.request.get(legacyRoute, { maxRedirects: 0 });
			expect(response.status()).toBe(308);
			expect(response.headers().location).toBe(buildRunDetailRoute("mkh", "fulcrum", BUILD_RUN_ID));
		});
	}

	test("Build live run detail canonical route renders the run-detail workbench", async ({ page }) => {
		const route = buildRunDetailRoute(WS, PROJ, BUILD_RUN_ID);
		const response = await page.goto(route, { waitUntil: "load" });
		expect(response?.status() ?? 0).toBeLessThan(400);
		expect(new URL(page.url()).pathname).toBe(route);

		await expect(page.locator("[data-build-runs-shell]")).toBeVisible();
		await expect(page.locator("[data-live-session-pane]")).toBeVisible();
		await expect(page.locator(`[data-run-row][data-run-id='${BUILD_RUN_ID}']`)).toHaveAttribute(
			"aria-current",
			"true",
		);
		await expect(page.getByRole("heading", { name: "OBS-12 · Dedupe trace-id propagation" })).toBeVisible();
		await expect(page.locator("[data-slot='stage-view-grid']")).toHaveCount(0);
	});

	test("ScopeBar stage tab starts from project scope and lands on Build board", async ({ page }) => {
		await page.goto(stageRoute(WS, PROJ, "capture"), { waitUntil: "load" });

		await page.getByRole("tab", { name: "Build" }).click();
		await page.waitForURL(`**/projects/${PROJ}/build`, { timeout: 5_000 });
		await expect(page.locator("[data-build-board]")).toBeVisible();
	});

	test("StageRail default substage starts from project scope and lands on Capture workbench", async ({
		page,
	}) => {
		await page.goto(stageRoute(WS, PROJ, "capture"), { waitUntil: "load" });

		await page.locator("[data-slot='stage-rail']").getByRole("link", { name: "Inbox" }).click();
		await page.waitForURL(`**/projects/${PROJ}/capture/inbox`, { timeout: 5_000 });
		await expect(page.locator(STAGE_WORKBENCH_ANCHOR.capture)).toBeVisible();
	});

	test("Capture inbox subroute renders the Capture workbench", async ({ page }) => {
		const response = await page.goto(stageSubroute(WS, PROJ, "capture", "inbox"), {
			waitUntil: "load",
		});
		expect(response?.status() ?? 0).toBeLessThan(400);
		expect(new URL(page.url()).pathname).toBe(stageSubroute(WS, PROJ, "capture", "inbox"));
		await expect(page.locator(STAGE_WORKBENCH_ANCHOR.capture)).toBeVisible();
		await expect(page.getByRole("heading", { name: "Inbox is clear." })).toBeVisible();
	});

	test("mobile Capture route renders bottom stage tabs and block actions", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		const response = await page.goto(stageRoute(WS, PROJ, "capture"), { waitUntil: "load" });
		expect(response?.status() ?? 0).toBeLessThan(400);

		await expect(page.locator(STAGE_WORKBENCH_ANCHOR.capture)).toBeVisible();
		await expect(page.getByRole("group", { name: "Block actions" })).toBeVisible();

		const bottomTabs = page.locator("[data-slot='mobile-stage-tabs'][data-bottom-stage-tabs]");
		await expect(bottomTabs).toBeVisible();
		await expect(bottomTabs).toHaveAttribute("data-active-stage", "capture");
		await expect(bottomTabs.locator("[data-slot='mobile-stage-tab']")).toHaveCount(STAGE_ORDER.length);
		for (const stage of STAGE_ORDER) {
			await expect(bottomTabs.locator(`[data-slot='mobile-stage-tab'][data-stage='${stage}']`)).toBeVisible();
		}

		const blockActions = page.locator("[data-slot='capture-block-actions']");
		await expect(blockActions).toHaveAttribute("data-safe-area-reserve", "bottom");
		const tabBox = await bottomTabs.boundingBox();
		const actionsBox = await blockActions.boundingBox();
		expect((actionsBox?.y ?? 0) + (actionsBox?.height ?? 0)).toBeLessThanOrEqual(tabBox?.y ?? 0);
	});
});
