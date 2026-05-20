import { expect, test } from "@playwright/test";
import { captureScreenshot } from "../../scripts/run-design-e2e.ts";

/**
 * Rendered design-gate proof for the DESIGN.md §1.6 / §3 lines 409-411
 * reduced-motion guarantee against the real production shell.
 *
 * DESIGN.md makes `prefers-reduced-motion: reduce` a foundation-token
 * guarantee: "Every animated/transitioned property MUST inherit
 * `@media (prefers-reduced-motion: reduce)` overrides." This spec drives
 * chromium over the production shell route (`/`) and the AI Assist route
 * (`/ai-assist`) with `emulateMedia({ reducedMotion: "reduce" })` and asserts
 * the global guard CSS actually collapses every animation/transition to an
 * effectively instant, single-iteration state — not by reading source, but by
 * resolving computed style on rendered DOM.
 *
 * Owned by `prd-cross-a11y-motion-forced-colors`. State: `reduced-motion`.
 */

/** Largest duration in a CSS time list (`"150ms, 0.3s"` -> seconds). */
function maxSeconds(value: string): number {
	return value
		.split(",")
		.map((part) => part.trim())
		.map((part) => {
			if (part.endsWith("ms")) return Number.parseFloat(part) / 1000;
			if (part.endsWith("s")) return Number.parseFloat(part);
			return Number.parseFloat(part) || 0;
		})
		.reduce((max, item) => Math.max(max, item), 0);
}

/**
 * Walk every element in the rendered page and return the ones whose computed
 * animation or transition timing is still non-instant. Under the reduced-motion
 * guard this list MUST be empty: the guard sets `animation-duration` and
 * `transition-duration` to `0.001ms !important` on `*, *::before, *::after`.
 */
async function elementsWithLiveMotion(
	page: import("@playwright/test").Page,
): Promise<{ count: number; samples: string[] }> {
	return page.evaluate(() => {
		const live: string[] = [];
		const toMaxSeconds = (value: string): number =>
			value
				.split(",")
				.map((part) => part.trim())
				.map((part) => {
					if (part.endsWith("ms")) return Number.parseFloat(part) / 1000;
					if (part.endsWith("s")) return Number.parseFloat(part);
					return Number.parseFloat(part) || 0;
				})
				.reduce((max, item) => Math.max(max, item), 0);

		for (const node of Array.from(document.querySelectorAll("*"))) {
			const style = getComputedStyle(node as Element);
			const animation = toMaxSeconds(style.animationDuration);
			const transition = toMaxSeconds(style.transitionDuration);
			// 1ms tolerance: the guard collapses to 0.001ms, browsers round.
			if (animation > 0.001 || transition > 0.001) {
				const el = node as Element;
				const slot = el.getAttribute("data-slot");
				const label = `${el.tagName.toLowerCase()}${slot ? `[data-slot=${slot}]` : ""}` +
					` anim=${style.animationDuration} trans=${style.transitionDuration}`;
				if (live.length < 12) live.push(label);
			}
		}
		return { count: live.length, samples: live };
	});
}

test.describe("shell reduced-motion guard", () => {
	test("collapses every shell animation and transition to instant under prefers-reduced-motion", async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/", { waitUntil: "load" });
		await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

		// The global guard CSS is applied: no rendered shell element keeps a
		// non-instant animation or transition. This is the acceptance bullet
		// "the test fails if any shell animation lacks a reduced-motion override".
		const live = await elementsWithLiveMotion(page);
		expect(
			live.count,
			`shell elements still animating under reduced motion: ${live.samples.join(" | ")}`,
		).toBe(0);

		// `scroll-behavior` on <html> is forced to `auto` (DESIGN.md §3 line 411).
		const scrollBehavior = await page.evaluate(
			() => getComputedStyle(document.documentElement).scrollBehavior,
		);
		expect(scrollBehavior).toBe("auto");

		// Single-iteration: decorative loops never repeat under reduced motion.
		const maxIteration = await page.evaluate(() => {
			let worst = 1;
			for (const node of Array.from(document.querySelectorAll("*"))) {
				const count = getComputedStyle(node as Element).animationIterationCount;
				if (count === "infinite") {
					worst = Number.POSITIVE_INFINITY;
				} else {
					const parsed = Number.parseFloat(count);
					if (Number.isFinite(parsed)) worst = Math.max(worst, parsed);
				}
			}
			return worst;
		});
		expect(maxIteration).toBeLessThanOrEqual(1);
	});

	test("collapses the StatusFooter AI Assist accent transition under reduced motion", async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/", { waitUntil: "load" });

		// The StatusFooter AI Assist segment ships an OD accent treatment with a
		// `transition-colors` transition (status-footer.svelte). Under reduced
		// motion that transition must collapse to instant.
		const aiAssist = page
			.locator("[data-slot='status-footer-ai-assist']")
			.first();
		await expect(aiAssist).toBeVisible();
		const timing = await aiAssist.evaluate((node) => {
			const style = getComputedStyle(node);
			return {
				transitionDuration: style.transitionDuration,
				animationDuration: style.animationDuration,
			};
		});
		expect(maxSeconds(timing.transitionDuration)).toBeLessThanOrEqual(0.001);
		expect(maxSeconds(timing.animationDuration)).toBeLessThanOrEqual(0.001);
	});

	test("collapses the AI Assist drawer slide-over motion under reduced motion", async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/ai-assist", { waitUntil: "load" });
		await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

		// The AI Assist drawer is the slide-over DESIGN.md §5 calls out as the
		// exact animation that must collapse. Its rendered surface keeps no
		// live transition/animation under reduced motion.
		const drawer = page.locator("[data-ai-assist-drawer]").first();
		await expect(drawer).toBeVisible();
		const drawerTiming = await drawer.evaluate((node) => {
			const style = getComputedStyle(node);
			return {
				transitionDuration: style.transitionDuration,
				animationDuration: style.animationDuration,
				animationIterationCount: style.animationIterationCount,
			};
		});
		expect(maxSeconds(drawerTiming.transitionDuration)).toBeLessThanOrEqual(0.001);
		expect(maxSeconds(drawerTiming.animationDuration)).toBeLessThanOrEqual(0.001);
		expect(drawerTiming.animationIterationCount).toBe("1");

		// Whole-route guard: no element on the AI Assist route keeps live motion.
		const live = await elementsWithLiveMotion(page);
		expect(
			live.count,
			`AI Assist route elements still animating under reduced motion: ${live.samples.join(" | ")}`,
		).toBe(0);
	});

	test("captures a reduced-motion screenshot of the shell as evidence", async ({
		page,
	}, testInfo) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/", { waitUntil: "load" });
		await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

		const shot = await page.screenshot({ fullPage: true });
		await testInfo.attach("shell-reduced-motion", {
			body: shot,
			contentType: "image/png",
		});
		expect(shot.byteLength).toBeGreaterThan(0);

		// Persist the evidence artifact to the stable design-fidelity screenshot
		// directory (alongside the harness route captures) so the reduced-motion
		// proof survives as a durable file, not just a per-run report attachment.
		const file = await captureScreenshot(page, "a11y-reduced-motion-shell");
		await testInfo.attach("shell-reduced-motion-path", { body: file });
	});
});
