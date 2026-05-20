import { expect, test } from "@playwright/test";

/**
 * Rendered design-gate coverage for the `/runs` index route.
 *
 * This spec drives chromium over the production `/runs` route and asserts the
 * rendered DOM — header, dispatch chrome, filter spine, inline reassignment.
 * It replaces an earlier `bun:test` + `readFileSync` source-string spec that
 * only checked Svelte source substrings and never proved the route rendered.
 */
test.describe("runs index route interaction coverage", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/runs", { waitUntil: "load" });
		// `/runs` streams its body behind `{#await data.streamed.data}`; wait for
		// the resolved content rather than the skeleton.
		await page.locator("[data-runs-filter]").waitFor({ state: "visible" });
	});

	test("shows runs header, dispatch button, and filter chrome", async ({ page }) => {
		const header = page.locator("[data-runs-header]");
		await expect(header).toBeVisible();
		await expect(header).toContainText("Agent runs");

		await expect(page.locator("[data-runs-dispatch]")).toBeVisible();
		await expect(page.locator("[data-runs-filter]")).toBeVisible();
		await expect(page.locator("[data-runs-agent-filter]")).toBeVisible();
		await expect(page.locator("[data-runs-status-filter]")).toBeVisible();
		await expect(page.locator("[data-runs-project-filter]")).toBeVisible();
		await expect(page.locator("[data-runs-range-filter]")).toBeVisible();
	});

	test("ships inline agent reassignment without a modal", async ({ page }) => {
		const reassignSection = page.locator("[data-runs-reassign]");
		await expect(reassignSection).toBeVisible();

		// The popover is inline: hidden until the reassign affordance is clicked,
		// never a modal overlay.
		await expect(page.locator("[data-runs-reassign-popover]")).toHaveCount(0);
		await page.locator("[data-action='reassign']").click();

		const popover = page.locator("[data-runs-reassign-popover]");
		await expect(popover).toBeVisible();
		await expect(page.locator("[data-runs-reassign-agent]").first()).toBeVisible();

		const reassignAgent = page.locator("[data-runs-reassign-agent]").first();
		await reassignAgent.click();
		const status = page.locator("[data-runs-reassign-status]");
		await expect(status).toContainText("Reassign in progress");
		await expect(status).toContainText("copied transcript seed");

		await expect(page.locator("[data-modal]")).toHaveCount(0);
	});

	test("keeps filter and dispatch controls usable on mobile without horizontal overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/runs", { waitUntil: "load" });
		await page.locator("[data-runs-filter]").waitFor({ state: "visible" });

		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
		);
		expect(overflow).toBeLessThanOrEqual(1);
		await expect(page.locator("[data-runs-dispatch]")).toBeVisible();
		await expect(page.locator("[data-runs-filter]")).toBeVisible();
	});
});
