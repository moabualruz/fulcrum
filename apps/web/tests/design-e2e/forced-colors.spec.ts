import { expect, test } from "@playwright/test";
import { captureScreenshot } from "../../scripts/run-design-e2e.ts";

/**
 * Rendered design-gate proof for the DESIGN.md §1.6 forced-colors guarantee
 * against the real production shell.
 *
 * DESIGN.md §1.6 mandates a `@media (forced-colors: active)` guard:
 *
 *   @media (forced-colors: active) {
 *     :root { --color-border: CanvasText; --color-border-focus: Highlight; }
 *     button, [role="button"] { border: 1px solid ButtonText; }
 *   }
 *
 * This spec drives chromium over the production shell route (`/`) with
 * `emulateMedia({ forcedColors: "active" })` and asserts the rendered shell
 * resolves border tokens to the CSS system keywords and renders system
 * button borders — by resolving computed style, not by reading source.
 *
 * Owned by `prd-cross-a11y-motion-forced-colors`. State: `forced-colors`.
 */

/**
 * Resolve a CSS custom property from `:root`. Returns the raw declared value
 * (`var()` is NOT resolved — a forced-colors guard re-declares the property
 * directly on `:root`, so the declared value carries the system keyword).
 */
async function rootToken(
	page: import("@playwright/test").Page,
	property: string,
): Promise<string> {
	return page.evaluate(
		(name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
		property,
	);
}

/** CSS system colors a forced-colors guard maps border tokens onto. */
const SYSTEM_BORDER_KEYWORDS = ["canvastext", "windowtext", "currentcolor"];
const SYSTEM_FOCUS_KEYWORDS = ["highlight", "linktext", "activetext"];

test.describe("shell forced-colors guard", () => {
	test("re-maps the border token to a system color under forced-colors", async ({
		page,
	}) => {
		await page.emulateMedia({ forcedColors: "active" });
		await page.goto("/", { waitUntil: "load" });
		await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

		// DESIGN.md §1.6: `--color-border` resolves to a system text color so the
		// shell stays legible in Windows high-contrast mode. A raw oklch()/hex
		// value here means the `@media (forced-colors: active)` guard is missing.
		const border = (await rootToken(page, "--color-border")).toLowerCase();
		expect(
			SYSTEM_BORDER_KEYWORDS.some((keyword) => border.includes(keyword)),
			`--color-border under forced-colors resolved to "${border}" — DESIGN.md §1.6 requires a system keyword (CanvasText). The @media (forced-colors: active) guard is missing from production CSS.`,
		).toBe(true);
	});

	test("re-maps the focus border token to a system highlight under forced-colors", async ({
		page,
	}) => {
		await page.emulateMedia({ forcedColors: "active" });
		await page.goto("/", { waitUntil: "load" });
		await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

		// DESIGN.md §1.6: `--color-border-focus` resolves to `Highlight`.
		const focus = (await rootToken(page, "--color-border-focus")).toLowerCase();
		expect(
			SYSTEM_FOCUS_KEYWORDS.some((keyword) => focus.includes(keyword)),
			`--color-border-focus under forced-colors resolved to "${focus}" — DESIGN.md §1.6 requires a system keyword (Highlight). The @media (forced-colors: active) guard is missing from production CSS.`,
		).toBe(true);
	});

	test("renders a system button border under forced-colors", async ({ page }) => {
		await page.emulateMedia({ forcedColors: "active" });
		await page.goto("/", { waitUntil: "load" });
		await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

		// DESIGN.md §1.6: `button, [role="button"] { border: 1px solid ButtonText; }`
		// Every interactive button keeps a visible system border so it is
		// distinguishable when the OKLCH palette is overridden away.
		const button = page
			.locator("button:visible, [role='button']:visible")
			.first();
		await expect(button).toBeVisible();
		const borders = await button.evaluate((node) => {
			const style = getComputedStyle(node);
			return {
				width: style.borderWidth,
				style: style.borderStyle,
			};
		});
		// A real border edge: non-zero width and a drawn style.
		const maxWidth = borders.width
			.split(" ")
			.map((part) => Number.parseFloat(part) || 0)
			.reduce((max, item) => Math.max(max, item), 0);
		expect(
			maxWidth,
			`button border-width under forced-colors was "${borders.width}" — DESIGN.md §1.6 requires a 1px ButtonText border. The @media (forced-colors: active) guard is missing from production CSS.`,
		).toBeGreaterThanOrEqual(1);
		expect(borders.style).not.toBe("none");
	});

	test("keeps the shell chrome operable under forced-colors", async ({ page }) => {
		await page.emulateMedia({ forcedColors: "active" });
		await page.goto("/", { waitUntil: "load" });
		await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

		// The OD shell primitives stay rendered and visible — forced-colors must
		// never blank a region of the shell.
		await expect(page.locator("[data-slot='stage-rail']").first()).toBeVisible();
		await expect(page.locator("[data-slot='scope-bar']").first()).toBeVisible();
		await expect(
			page.locator("[data-slot='status-footer']").first(),
		).toBeVisible();
	});

	test("captures a forced-colors screenshot of the shell as evidence", async ({
		page,
	}, testInfo) => {
		await page.emulateMedia({ forcedColors: "active" });
		await page.goto("/", { waitUntil: "load" });
		await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

		const shot = await page.screenshot({ fullPage: true });
		await testInfo.attach("shell-forced-colors", {
			body: shot,
			contentType: "image/png",
		});
		expect(shot.byteLength).toBeGreaterThan(0);

		// Persist the evidence artifact to the stable design-fidelity screenshot
		// directory (alongside the harness route captures) so the forced-colors
		// proof survives as a durable file, not just a per-run report attachment.
		const file = await captureScreenshot(page, "a11y-forced-colors-shell");
		await testInfo.attach("shell-forced-colors-path", { body: file });
	});
});
