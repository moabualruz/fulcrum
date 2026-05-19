#!/usr/bin/env bun
/**
 * refresh-prd-assigns — surfaces stale `assigns` paths in
 * `.scratch/prd.jsonl` and proposes refreshed candidates.
 *
 * Never auto-applies. Emits `.scratch/audit/assigns-drift-suggestions.json`
 * for human review; a follow-up commit can ingest accepted suggestions.
 *
 * Algorithm (per done PRD):
 * 1. Walk current assigns paths; flag any that no longer exist on disk.
 * 2. Build a keyword bag from id + title + acceptance bullets.
 * 3. Grep apps/** services/** for files whose paths contain the strongest
 *    keyword tokens; rank by token-hit count.
 * 4. Emit top-N candidates per missing path.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const REPO_ROOT = process.cwd();
const PRD_PATH = join(REPO_ROOT, ".scratch", "prd.jsonl");
const OUT_PATH = join(REPO_ROOT, ".scratch", "audit", "assigns-drift-suggestions.json");

const SEARCH_ROOTS = ["apps", "services", "packages"] as const;
const SOURCE_EXT = new Set([".ts", ".tsx", ".svelte"]);

const TOKEN_STOPWORDS = new Set([
	"the",
	"a",
	"an",
	"and",
	"or",
	"to",
	"of",
	"with",
	"for",
	"via",
	"on",
	"in",
	"by",
	"into",
	"prd",
	"acp",
	"web",
	"cli",
	"tui",
	"api",
	"add",
	"adds",
	"new",
	"page",
	"server",
	"client",
	"task",
	"verify",
	"test",
	"tests",
	"ui",
	"design",
	"e2e",
	"json",
	"data",
	"file",
	"files",
]);

export interface PrdEntry {
	id: string;
	status: string;
	title?: string;
	acceptance?: string[];
	assigns?: string[];
}

export interface DriftSuggestion {
	id: string;
	currentAssigns: string[];
	missingAssigns: string[];
	candidateAssigns: Array<{ path: string; score: number }>;
}

export async function loadPrdEntries(path = PRD_PATH): Promise<PrdEntry[]> {
	const text = await readFile(path, "utf8");
	const out: PrdEntry[] = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			const parsed = JSON.parse(trimmed) as PrdEntry;
			out.push(parsed);
		} catch {
			// skip malformed lines silently — recovery tool, not validator
		}
	}
	return out;
}

export function extractTokens(entry: PrdEntry): string[] {
	const buf: string[] = [];
	buf.push(entry.title ?? "");
	for (const a of entry.acceptance ?? []) buf.push(a);
	const text = buf.join(" ").toLowerCase();
	const tokens = text
		.split(/[^a-z0-9_-]+/)
		.map((t) => t.trim())
		.filter((t) => t.length >= 4 && !TOKEN_STOPWORDS.has(t));
	return Array.from(new Set(tokens));
}

export async function walkSourceTree(roots: readonly string[]): Promise<string[]> {
	const out: string[] = [];
	for (const root of roots) {
		const abs = join(REPO_ROOT, root);
		if (!existsSync(abs)) continue;
		await walk(abs, out);
	}
	return out;
}

async function walk(dir: string, out: string[]): Promise<void> {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
			await walk(full, out);
		} else if (entry.isFile()) {
			if (SOURCE_EXT.has(extname(entry.name))) out.push(relative(REPO_ROOT, full));
		}
	}
}

export function rankCandidates(
	tokens: readonly string[],
	files: readonly string[],
	limit = 5,
): Array<{ path: string; score: number }> {
	if (tokens.length === 0) return [];
	const scored: Array<{ path: string; score: number }> = [];
	for (const file of files) {
		const lower = file.toLowerCase();
		let score = 0;
		for (const token of tokens) {
			if (lower.includes(token)) score++;
		}
		if (score > 0) scored.push({ path: file, score });
	}
	scored.sort((a, b) => b.score - a.score || a.path.length - b.path.length);
	return scored.slice(0, limit);
}

export interface RefreshReport {
	generatedAt: string;
	prdsScanned: number;
	prdsWithMissing: number;
	suggestions: DriftSuggestion[];
}

export async function buildDriftReport(
	entries: readonly PrdEntry[],
	files: readonly string[],
): Promise<RefreshReport> {
	const suggestions: DriftSuggestion[] = [];
	for (const entry of entries) {
		if (entry.status !== "done") continue;
		const assigns = entry.assigns ?? [];
		if (assigns.length === 0) continue;
		const missing = assigns.filter((a) => !existsSync(join(REPO_ROOT, a)));
		if (missing.length === 0) continue;
		const tokens = extractTokens(entry);
		const candidates = rankCandidates(tokens, files);
		suggestions.push({
			id: entry.id,
			currentAssigns: assigns,
			missingAssigns: missing,
			candidateAssigns: candidates,
		});
	}
	const prdsScanned = entries.filter((e) => e.status === "done" && (e.assigns ?? []).length > 0).length;
	return {
		generatedAt: new Date().toISOString(),
		prdsScanned,
		prdsWithMissing: suggestions.length,
		suggestions,
	};
}

export async function writeReport(report: RefreshReport, path = OUT_PATH): Promise<void> {
	await mkdir(join(REPO_ROOT, ".scratch", "audit"), { recursive: true });
	await writeFile(path, JSON.stringify(report, null, 2), "utf8");
}

if (import.meta.main) {
	const entries = await loadPrdEntries();
	const files = await walkSourceTree(SEARCH_ROOTS);
	const report = await buildDriftReport(entries, files);
	await writeReport(report);
	process.stdout.write(
		`drift report written to ${relative(REPO_ROOT, OUT_PATH)} — ${report.prdsWithMissing}/${report.prdsScanned} PRDs need attention\n`,
	);
}
