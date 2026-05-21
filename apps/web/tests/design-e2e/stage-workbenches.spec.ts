import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
	STAGE_ORDER,
	canonicalRouteForLegacyPath,
	stageRoute,
} from "../../src/lib/components/app/route-map.ts";

const WS = "acme";
const PROJ = "fulcrum";

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
		await page.waitForURL(`**/projects/${PROJ}/capture*`, { timeout: 5_000 });
		await expect(page.locator(STAGE_WORKBENCH_ANCHOR.capture)).toBeVisible();
	});
});
