import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOT = join(import.meta.dir, "..", "..");
const WEB_ROUTES = join(ROOT, "apps", "web", "src", "routes");

// Allow-list of pre-migration sites that still use a raw <input type="password">.
// Target is 0 entries. New violations OUTSIDE this allow-list must use the
// `CredentialInput` primitive from `@fulcrum/ui-kit`. Remove entries here as
// migration lands; do not add new ones without a follow-up PRD.
const ALLOW_LIST: ReadonlySet<string> = new Set([
	// Remaining raw type="password" sites pending follow-up migration to
	// CredentialInput. New violations OUTSIDE this allow-list must fail.
	"apps/web/src/routes/auth-flows/+page.svelte",
	"apps/web/src/routes/auth/login/+page.svelte",
	"apps/web/src/routes/auth/invite/[token]/+page.svelte",
	"apps/web/src/routes/build-graph/+page.svelte",
	"apps/web/src/routes/inference/+page.svelte",
]);

async function walkSvelte(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const out: string[] = [];
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
			out.push(...(await walkSvelte(full)));
		} else if (entry.isFile() && entry.name.endsWith(".svelte")) {
			out.push(full);
		}
	}
	return out;
}

describe("CredentialInput primitive coverage", () => {
	test("primitive is exported from @fulcrum/ui-kit", async () => {
		const barrel = await readFile(join(ROOT, "packages/ui-kit/src/index.ts"), "utf8");
		expect(barrel).toContain("CredentialInput");
	});

	test("primitive source file exists", async () => {
		const source = await readFile(
			join(ROOT, "packages/ui-kit/src/components/credential-input/credential-input.svelte"),
			"utf8",
		);
		expect(source).toContain('type={visible ? "text" : "password"}');
		expect(source).toContain("data-slot");
		expect(source).toContain("aria-pressed");
	});

	test("no NEW raw type=\"password\" inputs outside CredentialInput", async () => {
		const files = await walkSvelte(WEB_ROUTES);
		const rawPasswordPattern = /<input[^>]*\stype\s*=\s*["']password["']/;
		const violations: string[] = [];
		for (const file of files) {
			const text = await readFile(file, "utf8");
			if (!rawPasswordPattern.test(text)) continue;
			const rel = relative(ROOT, file);
			if (!ALLOW_LIST.has(rel)) violations.push(rel);
		}
		expect(violations).toEqual([]);
	});

	test("allow-list entries still exist on disk (catch dead allow-list rot)", async () => {
		const stale: string[] = [];
		for (const rel of ALLOW_LIST) {
			try {
				await readFile(join(ROOT, rel), "utf8");
			} catch {
				stale.push(rel);
			}
		}
		expect(stale).toEqual([]);
	});
});
