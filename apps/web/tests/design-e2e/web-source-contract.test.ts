import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

/**
 * Web source-contract architecture tests — NOT visual design coverage.
 *
 * These checks assert that production static assets and configuration modules
 * (`app.css`, `app.html`, theme/breakpoint modules, the OpenAPI route) wire the
 * correct contracts. They read source text on purpose: there is no rendered
 * route whose DOM proves an `@media` block exists in the CSS bundle or that a
 * config module exports a constant.
 *
 * They live as a `.test.ts` file (not `.spec.ts`) so the Playwright
 * `design-e2e/**\/*.spec.ts` project never picks them up — visual design proof
 * is exclusively the rendered Playwright specs' job. The design-gate harness
 * runs this suite as a separate, clearly-labelled "source-contract" phase, so
 * CI output distinguishes source contract checks from visual design tests.
 *
 * Extracted from `cross-cutting-motion.spec.ts` and `cross-cutting-mobile.spec.ts`
 * by `prd-design-gate-source-assertion-retirement`: a source string check must
 * never masquerade as a rendered design test for an OD-referenced route.
 */

const WEB_ROOT = process.cwd();

function readWebSource(relativePath: string): string {
	return readFileSync(`${WEB_ROOT}/${relativePath}`, "utf8");
}

describe("web source contract — reduced motion", () => {
	test("production CSS and theme settings wire the reduced-motion override", () => {
		const appCss = readWebSource("src/app.css");
		const themeSettings = readWebSource("src/routes/settings/theme/theme.ts");
		const themePage = readWebSource("src/routes/settings/theme/+page.svelte");

		expect(appCss).toContain("@media (prefers-reduced-motion: reduce)");
		expect(appCss).toContain("animation-duration: 0.001ms !important");
		expect(appCss).toContain("animation-iteration-count: 1 !important");
		expect(appCss).toContain("transition-duration: 0.001ms !important");
		expect(appCss).toContain("scroll-behavior: auto !important");
		expect(themeSettings).toContain("animationSpeed");
		expect(themeSettings).toContain('"reduced"');
		expect(themeSettings).toContain('"off"');
		expect(themePage).toContain("data-animation-speed");
	});
});

describe("web source contract — mobile shell", () => {
	test("production shell wires browser safe-area APIs", () => {
		const appHtml = readWebSource("src/app.html");
		const appCss = readWebSource("src/app.css");
		const layout = readWebSource("src/routes/+layout.svelte");

		expect(appHtml).toContain("viewport-fit=cover");
		expect(appCss).toContain("env(safe-area-inset-top");
		expect(appCss).toContain("env(safe-area-inset-bottom");
		expect(appCss).toContain("env(safe-area-inset-left");
		expect(appCss).toContain("env(safe-area-inset-right");
		expect(layout).toContain("var(--fulcrum-safe-area-top)");
		expect(layout).toContain("var(--fulcrum-gesture-zone-bottom)");
	});

	test("CSS theme documents Tailwind v4 breakpoints and the mobile query matches", () => {
		const appCss = readWebSource("src/app.css");
		const mediaQuery = readWebSource("src/lib/util/media-query.ts");

		for (const [name, rem] of Object.entries({
			xs: "30rem",
			sm: "40rem",
			md: "48rem",
			lg: "64rem",
			xl: "80rem",
			"2xl": "96rem",
		})) {
			expect(appCss).toContain(`--breakpoint-${name}: ${rem};`);
		}

		expect(mediaQuery).toContain("md: 768");
		expect(mediaQuery).toContain("BREAKPOINTS.md - 1");
		expect(mediaQuery).toContain("MOBILE_QUERY");
	});
});

describe("web source contract — public API route wiring", () => {
	test("settings links the OpenAPI document and the route builds the spec", () => {
		const settingsApi = readWebSource("src/routes/settings/api/+page.svelte");
		const openApiRoute = readWebSource("src/routes/api/v1/openapi.json/+server.ts");

		expect(settingsApi).toContain('href="/api/v1/openapi.json"');
		expect(openApiRoute).toContain("_buildOpenApiSpec");
	});
});
