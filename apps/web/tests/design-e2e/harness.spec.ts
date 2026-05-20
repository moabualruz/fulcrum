import { expect, test } from "@playwright/test";
import { captureScreenshot, DESKTOP_VIEWPORT, enumerateDesignRoutes } from "../../scripts/run-design-e2e.ts";

/**
 * Rendered proof that the design-gate harness is consumed, not dead code.
 *
 * This spec drives chromium over a real production route and exercises the
 * harness `captureScreenshot` helper directly — the same helper the
 * `run-design-e2e.ts` capture phase uses. Shell-presence assertions
 * (StageRail / ScopeBar / StatusFooter / AI Assist) are explicitly OUT OF
 * SCOPE here; they are owned by `prd-design-gate-shell-assertions` (wave 2).
 */
test.describe("design-gate harness", () => {
	test("renders the root production route and exercises captureScreenshot", async ({ page }, testInfo) => {
		await page.setViewportSize({ ...DESKTOP_VIEWPORT });
		await page.goto("/", { waitUntil: "load" });

		// The route renders a real document — capturing it is unconditional and
		// never depends on an OD shell primitive being present.
		await expect(page.locator("body")).toBeVisible();

		const dir = testInfo.outputPath("harness-screenshots");
		const artifact = await captureScreenshot(page, "harness-root", { dir });
		expect(artifact).toContain("harness-root.png");
		await testInfo.attach("harness-root", { path: artifact, contentType: "image/png" });
	});

	test("enumerates production routes with the root route always first", () => {
		const routes = enumerateDesignRoutes("src/routes");
		expect(routes.length).toBeGreaterThan(0);
		expect(routes[0]).toEqual({ path: "/", slug: "root" });
		// API endpoints are not renderable routes and must be excluded.
		expect(routes.some((route) => route.slug === "api")).toBe(false);
	});
});
