import { expect, test } from "@playwright/test";

/**
 * `agent-dependency-board` has been absorbed into the Build graph.
 *
 * Per `prd-web-build-graph-od-fidelity`, the former standalone "Multi-agent
 * dependency board" is no longer a parallel surface — its dependency-graph,
 * status, and agent-assignment responsibilities live in the OD Sugiyama
 * `/build-graph` layout. This route is kept as a forwarding stub so the old
 * path never 404s (migration value-preservation).
 */
test.describe("agent dependency board — absorbed into the Build graph", () => {
	test("the old route still resolves and forwards to the single Build graph", async ({ page }) => {
		const response = await page.goto("/agent-dependency-board", {
			waitUntil: "domcontentloaded",
		});
		expect(response?.status() ?? 200).toBeLessThan(400);

		await page.waitForURL("**/build-graph");
		await expect(page.locator("[data-build-graph]")).toBeVisible();
		await expect(page.locator("[data-build-graph-node]")).toHaveCount(8);
	});

	test("the forwarding stub names the Build graph as the new home", async ({ page }) => {
		await page.goto("/agent-dependency-board", { waitUntil: "commit" });
		// before the client redirect settles, the stub names its destination.
		await expect(page.locator("[data-agent-board-page]")).toHaveAttribute(
			"data-agent-board-absorbed",
			"build-graph",
		);
	});
});
