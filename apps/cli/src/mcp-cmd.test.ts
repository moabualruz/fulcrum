import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run as runMcp } from "./mcp-cmd.ts";

let TMP: string;
let originalHome: string | undefined;
let originalLog: typeof console.log;
let captured: string[];

beforeEach(async () => {
	TMP = await mkdtemp(join(tmpdir(), "fulcrum-mcp-cmd-"));
	originalHome = process.env["HOME"];
	process.env["HOME"] = TMP;
	captured = [];
	originalLog = console.log;
	console.log = (...args: unknown[]) => {
		captured.push(args.map(String).join(" "));
	};
});

afterEach(async () => {
	console.log = originalLog;
	if (originalHome !== undefined) process.env["HOME"] = originalHome;
	else delete process.env["HOME"];
	await rm(TMP, { recursive: true, force: true });
});

describe("fulcrum mcp list", () => {
	test("registers an http MCP and lists it with transport and vendor", async () => {
		await runMcp(["register", "demo", "--http", "https://example.com/mcp", "--vendor", "acme", "--description", "demo http"]);
		captured.length = 0;
		await runMcp(["list"]);
		const out = captured.join("\n");
		expect(out).toContain("demo");
		expect(out).toContain("acme");
		expect(out).toContain("http");
		expect(out).toContain("https://example.com/mcp");
	});

	test("--json emits a canonical envelope with transport and enabled status in result", async () => {
		await runMcp(["register", "stdio-demo", "--stdio", "echo hello", "--vendor", "acme", "--description", "demo stdio"]);
		captured.length = 0;
		await runMcp(["list", "--json"]);
		const out = captured.join("");
		const parsed = JSON.parse(out) as {
			schema: string;
			result: Array<{ name: string; transport: string; vendor: string; agent_state: Record<string, string> }>;
		};
		expect(parsed.schema).toBe("fulcrum.cli.v1");
		expect(Array.isArray(parsed.result)).toBe(true);
		const entry = parsed.result.find((e) => e.name === "stdio-demo");
		expect(entry).toBeDefined();
		expect(entry?.transport).toBe("stdio");
		expect(entry?.vendor).toBe("acme");
		expect(typeof entry?.agent_state).toBe("object");
	});

	test("empty registry prints a register hint", async () => {
		await runMcp(["list"]);
		const out = captured.join("\n");
		expect(out).toContain("No MCP servers registered");
	});
});
