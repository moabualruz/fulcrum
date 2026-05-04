import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

describe("+error.svelte", () => {
	test("renders Permission denied state for FORBIDDEN route errors", () => {
		const source = readFileSync(join(process.cwd(), "src/web/src/routes/+error.svelte"), "utf8");

		expect(source).toContain("Permission denied");
		expect(source).toContain("FORBIDDEN");
		expect(source).toContain('href="/"');
	});
});
