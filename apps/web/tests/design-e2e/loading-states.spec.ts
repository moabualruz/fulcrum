import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const FALLBACK_EVIDENCE_DIR = path.resolve(
	process.cwd(),
	"../../.scratch/design-fidelity-review-2026-05-20/evidence/prd-cross-loading-state-system",
);

async function writeEvidenceShot(name: string, body: Buffer): Promise<void> {
	const dir = process.env.FULCRUM_DESIGN_EVIDENCE_DIR ?? FALLBACK_EVIDENCE_DIR;
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, name), body);
}

async function expectLoading(page: import("@playwright/test").Page, route: string): Promise<void> {
	await page.goto(route, { waitUntil: "domcontentloaded" });
	const state = page.locator("[data-state='loading']").first();
	await expect(state).toBeVisible();
	const loading = page.locator("[data-slot='loading-state']").first();
	await expect(loading).toBeVisible();
	await expect(loading).toHaveAttribute("aria-busy", "true");
	await expect(loading.locator("[data-slot='loading-state-skeletons']")).toBeVisible();
}

test.describe("cross-surface loading states", () => {
	test("representative OD stage routes render deterministic loading skeletons", async ({ page }) => {
		for (const route of [
			"/acme/projects/fulcrum/plan?state=loading",
			"/plan-session?state=loading",
			"/build-runs?state=loading",
			"/review-queue?state=loading",
			"/ship?state=loading",
			"/operate?state=loading",
		]) {
			await expectLoading(page, route);
		}

		await page.goto("/build-runs?state=loading", { waitUntil: "domcontentloaded" });
		await writeEvidenceShot("loading-build-runs.png", await page.screenshot({ fullPage: true }));
	});

	test("reduced-motion loading state keeps skeletons static and persists evidence", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/ship?state=loading", { waitUntil: "domcontentloaded" });

		const skeleton = page.locator(".fulcrum-loading-skeleton").first();
		await expect(skeleton).toBeVisible();
		const animation = await skeleton.evaluate((node) => getComputedStyle(node).animationName);
		expect(animation).toBe("none");

		await writeEvidenceShot(
			"loading-ship-reduced-motion.png",
			await page.screenshot({ fullPage: true }),
		);
	});
});
