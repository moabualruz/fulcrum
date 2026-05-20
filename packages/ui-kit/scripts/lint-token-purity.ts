/**
 * OKLCH token-purity lint for the OD shell primitives.
 *
 * AGENTS.md `@fulcrum/ui-kit` rule + prd-web-ui-kit-shell-primitives acceptance:
 * the shell primitives must use only OKLCH design tokens — no `#fff`/`#000`,
 * no raw hex/hsl, and no opacity-modifier shorthands on color utilities
 * (e.g. `bg-accent/40`).
 *
 * Scope: the five PRD-owned shell-primitive directories. Pre-existing
 * primitives carry their own opacity-modifier debt and are not in scope here.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const COMPONENTS_ROOT = new URL("../src/components/", import.meta.url).pathname;

const SCOPED_DIRS = ["stage-rail", "scope-bar", "status-footer", "acp-drawer", "trace-chip"];

const HEX = /(?:bg|text|border|fill|stroke|ring|outline|shadow|from|to|via)-\[#[0-9a-fA-F]{3,8}\]/;
const RAW_HEX = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
const RAW_HSL = /\bhsl\(/;
// Opacity-modifier shorthand on a color utility: bg-accent/40, text-fg/50, …
const OPACITY_MOD =
	/\b(?:bg|text|border|fill|stroke|ring|outline|from|to|via|divide|placeholder)-[a-z][a-z0-9-]*\/[0-9]+\b/;

function svelteFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) out.push(...svelteFiles(full));
		else if (entry.endsWith(".svelte")) out.push(full);
	}
	return out;
}

const violations: string[] = [];

for (const dirName of SCOPED_DIRS) {
	const dir = join(COMPONENTS_ROOT, dirName);
	for (const file of svelteFiles(dir)) {
		const lines = readFileSync(file, "utf8").split(/\n/);
		lines.forEach((line, idx) => {
			const where = `${file}:${idx + 1}`;
			if (RAW_HEX.test(line) || HEX.test(line)) {
				violations.push(`${where} — raw hex color (use an OKLCH token utility): ${line.trim()}`);
			}
			if (RAW_HSL.test(line)) {
				violations.push(`${where} — raw hsl() color (use an OKLCH token utility): ${line.trim()}`);
			}
			if (OPACITY_MOD.test(line)) {
				violations.push(
					`${where} — opacity-modifier shorthand on a color utility (use a solid token): ${line.trim()}`,
				);
			}
		});
	}
}

if (violations.length > 0) {
	console.error("ui-kit token-purity lint FAIL:");
	for (const v of violations) console.error("  " + v);
	process.exit(1);
}

console.log(`ui-kit token-purity lint ok — ${SCOPED_DIRS.length} shell-primitive dirs clean`);
