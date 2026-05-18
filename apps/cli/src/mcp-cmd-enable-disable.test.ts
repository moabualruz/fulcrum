import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run as runMcp } from "./mcp-cmd.ts";
import { isEnabled, loadRegistry } from "./mcp-registry.ts";

let TMP: string;
let originalHome: string | undefined;
let originalExit: typeof process.exit;
let exitCode: number | null;
let originalLog: typeof console.log;
let originalError: typeof console.error;

beforeEach(async () => {
	TMP = await mkdtemp(join(tmpdir(), "fulcrum-mcp-en-"));
	originalHome = process.env["HOME"];
	process.env["HOME"] = TMP;
	exitCode = null;
	originalExit = process.exit;
	process.exit = ((code?: number) => {
		exitCode = code ?? 0;
		throw new Error(`__exit_${exitCode}`);
	}) as typeof process.exit;
	originalLog = console.log;
	originalError = console.error;
	console.log = () => {};
	console.error = () => {};
});

afterEach(async () => {
	console.log = originalLog;
	console.error = originalError;
	process.exit = originalExit;
	if (originalHome !== undefined) process.env["HOME"] = originalHome;
	else delete process.env["HOME"];
	await rm(TMP, { recursive: true, force: true });
});

async function runOrCatch(args: string[]): Promise<void> {
	try { await runMcp(args); } catch (err) {
		if (!(err instanceof Error) || !err.message.startsWith("__exit_")) throw err;
	}
}

describe("fulcrum mcp enable/disable", () => {
	test("default (no flags) enables for all agents", async () => {
		await runOrCatch(["register", "demo", "--http", "https://example.com"]);
		await runOrCatch(["enable", "demo"]);
		const reg = await loadRegistry();
		const server = reg.servers["demo"]!;
		expect(isEnabled(server, "claude-code")).toBe(true);
		expect(isEnabled(server, "codex")).toBe(true);
		expect(isEnabled(server, "gemini")).toBe(true);
		expect(isEnabled(server, "opencode")).toBe(true);
		expect(isEnabled(server, "pi")).toBe(true);
	});

	test("--agent enables a specific agent only", async () => {
		await runOrCatch(["register", "single", "--http", "https://example.com"]);
		await runOrCatch(["enable", "single", "--agent", "codex"]);
		const reg = await loadRegistry();
		const server = reg.servers["single"]!;
		expect(isEnabled(server, "codex")).toBe(true);
		expect(isEnabled(server, "claude-code")).toBe(false);
	});

	test("disable subcommand turns the server off for the targeted agents", async () => {
		await runOrCatch(["register", "off-target", "--http", "https://example.com"]);
		await runOrCatch(["enable", "off-target"]);
		await runOrCatch(["disable", "off-target", "--agent", "pi"]);
		const reg = await loadRegistry();
		const server = reg.servers["off-target"]!;
		expect(isEnabled(server, "pi")).toBe(false);
		expect(isEnabled(server, "codex")).toBe(true);
	});

	test("enable on missing server exits with code 2", async () => {
		await runOrCatch(["enable", "ghost"]);
		expect(exitCode).toBe(2);
	});
});
