import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

/**
 * Regression guard — NOT visual design coverage.
 *
 * A design-e2e `.spec.ts` for a route with a visual OD reference must prove
 * fidelity by RENDERING the route, not by reading Svelte source strings. The
 * historical failure mode: a spec imports `bun:test`, `readFileSync`s a
 * `+page.svelte`, asserts substrings, and reports green while the route never
 * rendered — masking missing shell, broken navigation, or absent drawers.
 *
 * This guard scans every `*.spec.ts` in `design-e2e/` and FAILS if any spec
 * imports `bun:test` without also launching a page (`@playwright/test`,
 * `page.goto`, or `chromium`). Source-contract checks are allowed only in
 * `*.test.ts` files (e.g. `web-source-contract.test.ts`), which the Playwright
 * `design-e2e/**\/*.spec.ts` project never picks up.
 */

const DESIGN_E2E_DIR = path.join(process.cwd(), "tests/design-e2e");

function listSpecFiles(): string[] {
	return readdirSync(DESIGN_E2E_DIR)
		.filter((name) => name.endsWith(".spec.ts"))
		.sort();
}

function importsBunTest(source: string): boolean {
	return /\bfrom\s+["']bun:test["']/.test(source);
}

function launchesPage(source: string): boolean {
	return (
		/\bfrom\s+["']@playwright\/test["']/.test(source) ||
		/page\.goto\(/.test(source) ||
		/\bchromium\b/.test(source)
	);
}

describe("design-e2e specs render, never assert source only", () => {
	test("no design-e2e .spec.ts imports bun:test without launching a page", () => {
		const offenders: string[] = [];
		for (const name of listSpecFiles()) {
			const source = readFileSync(path.join(DESIGN_E2E_DIR, name), "utf8");
			if (importsBunTest(source) && !launchesPage(source)) {
				offenders.push(name);
			}
		}
		expect(offenders).toEqual([]);
	});

	test("every design-e2e .spec.ts launches a page", () => {
		const offenders = listSpecFiles().filter((name) => {
			const source = readFileSync(path.join(DESIGN_E2E_DIR, name), "utf8");
			return !launchesPage(source);
		});
		expect(offenders).toEqual([]);
	});
});
