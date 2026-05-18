import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run as runMcp } from "./mcp-cmd.ts";
import { loadRegistry } from "./mcp-registry.ts";

let TMP: string;
let originalHome: string | undefined;
let originalExit: typeof process.exit;
let exitCode: number | null;
let logs: string[];
let errors: string[];
let originalLog: typeof console.log;
let originalError: typeof console.error;

beforeEach(async () => {
	TMP = await mkdtemp(join(tmpdir(), "fulcrum-mcp-register-"));
	originalHome = process.env["HOME"];
	process.env["HOME"] = TMP;
	exitCode = null;
	originalExit = process.exit;
	process.exit = ((code?: number) => {
		exitCode = code ?? 0;
		throw new Error(`__exit_${exitCode}`);
	}) as typeof process.exit;
	logs = [];
	errors = [];
	originalLog = console.log;
	originalError = console.error;
	console.log = (...a: unknown[]) => { logs.push(a.map(String).join(" ")); };
	console.error = (...a: unknown[]) => { errors.push(a.map(String).join(" ")); };
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

describe("fulcrum mcp register", () => {
	test("--http URL registers an HTTP endpoint", async () => {
		await runOrCatch(["register", "demo-http", "--http", "https://example.com/mcp", "--vendor", "acme"]);
		expect(exitCode).toBeNull();
		const reg = await loadRegistry();
		expect(reg.servers["demo-http"]?.transport).toBe("http");
		expect(reg.servers["demo-http"]?.url).toBe("https://example.com/mcp");
		expect(reg.servers["demo-http"]?.vendor).toBe("acme");
	});

	test("--stdio CMD registers a command transport", async () => {
		await runOrCatch(["register", "demo-stdio", "--stdio", "/usr/bin/echo hello"]);
		expect(exitCode).toBeNull();
		const reg = await loadRegistry();
		expect(reg.servers["demo-stdio"]?.transport).toBe("stdio");
		expect(reg.servers["demo-stdio"]?.command).toBe("/usr/bin/echo hello");
	});

	test("missing name exits with code 2", async () => {
		await runOrCatch(["register"]);
		expect(exitCode).toBe(2);
		expect(errors.join("\n")).toContain("usage");
	});

	test("missing transport exits with code 2", async () => {
		await runOrCatch(["register", "incomplete", "--vendor", "acme"]);
		expect(exitCode).toBe(2);
		expect(errors.join("\n")).toContain("requires a URL");
	});
});
