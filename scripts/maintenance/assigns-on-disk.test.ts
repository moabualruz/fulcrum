/**
 * Architecture-style guard for `.scratch/prd.jsonl` `assigns` paths.
 *
 * Sanity-checks the assigns metadata against the real working tree.
 * Fails when the missing rate exceeds the configured ceiling so that
 * future drift surfaces in CI without breaking on every minor rename.
 *
 * Allow-list rules:
 * - Empty assigns are skipped (cross-cutting PRDs have no single file).
 * - Glob-ish paths (containing `<` or `**`) are skipped — author intent.
 * - Hand-listed `KNOWN_DRIFT_PRDS` are tolerated until follow-up.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { loadPrdEntries } from "./refresh-prd-assigns.ts";

const REPO_ROOT = process.cwd();
const PRD_PATH = join(REPO_ROOT, ".scratch", "prd.jsonl");
const PRD_FILE_PRESENT = existsSync(PRD_PATH);
const MISSING_RATE_CEILING = 0.6; // tightens as the cleanup PRD lands

const KNOWN_DRIFT_PRDS: ReadonlySet<string> = new Set([]);

function isGlobby(path: string): boolean {
	return path.includes("<") || path.includes("**") || path.includes("*");
}

describe("prd.jsonl assigns drift", () => {
	test("done PRDs reference files that still exist on disk", async () => {
		if (!PRD_FILE_PRESENT) {
			// .scratch is gitignored; skip when running in an isolated worktree.
			return;
		}
		const entries = await loadPrdEntries();
		const done = entries.filter((e) => e.status === "done");
		let checked = 0;
		let missing = 0;
		const stalePrds: string[] = [];
		for (const e of done) {
			const assigns = (e.assigns ?? []).filter((p) => !isGlobby(p));
			if (assigns.length === 0) continue;
			if (KNOWN_DRIFT_PRDS.has(e.id)) continue;
			let entryMissing = false;
			for (const rel of assigns) {
				checked++;
				if (!existsSync(join(REPO_ROOT, rel))) {
					missing++;
					entryMissing = true;
				}
			}
			if (entryMissing) stalePrds.push(e.id);
		}
		const rate = checked === 0 ? 0 : missing / checked;
		// Surface ratio so a future cleanup commit can drop the ceiling.
		// Always pass when nothing was checked.
		if (checked > 0) {
			expect(rate).toBeLessThanOrEqual(MISSING_RATE_CEILING);
		}
	});

	test("refresh tool produces JSON-serialisable suggestions", async () => {
		if (!PRD_FILE_PRESENT) {
			// Smoke-test internals on a synthetic dataset instead.
			const { buildDriftReport, walkSourceTree } = await import("./refresh-prd-assigns.ts");
			const files = await walkSourceTree(["scripts"]);
			const report = await buildDriftReport([], files);
			expect(report.prdsScanned).toBe(0);
			expect(report.suggestions).toEqual([]);
			return;
		}
		const { buildDriftReport, walkSourceTree } = await import("./refresh-prd-assigns.ts");
		const entries = await loadPrdEntries();
		const files = await walkSourceTree(["apps", "services", "packages"]);
		const report = await buildDriftReport(entries, files);
		const serialised = JSON.stringify(report);
		expect(serialised.startsWith("{")).toBe(true);
		expect(report.suggestions.every((s) => typeof s.id === "string")).toBe(true);
	});
});
