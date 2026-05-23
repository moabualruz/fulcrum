import { describe, expect, test } from "bun:test";
import { run as runSearch } from "./search.ts";

type ExitFn = (code: number) => void;

function testIo() {
	const out: string[] = [];
	const err: string[] = [];
	const exits: number[] = [];
	return {
		out,
		err,
		exits,
		opts: {
			print: (line: string) => out.push(line),
			printErr: (line: string) => err.push(line),
			exit: ((code: number) => exits.push(code)) as ExitFn,
		},
	};
}

describe("fulcrum search index", () => {
	test("runs a basic query and emits results", async () => {
		const calls: unknown[] = [];
		const io = testIo();
		const caller = {
			search: {
				query: async (input: unknown) => {
					calls.push(input);
					return [{ id: "t1", kind: "task", title: "Test task" }];
				},
				suggest: async () => ({}),
				savedList: async () => [],
				savedCreate: async () => ({ id: "v" }),
				savedDelete: async () => ({ ok: true }),
			},
		};

		await runSearch(["test"], { caller, ...io.opts });

		expect(io.err).toEqual([]);
		expect(io.exits).toEqual([]);
		expect(calls).toHaveLength(1);
		expect((calls[0] as { q: string }).q).toBe("test");
		expect(io.out.join("\n")).toContain("Test task");
	});

	test("--limit caps result count in the request", async () => {
		const calls: unknown[] = [];
		const io = testIo();
		const caller = {
			search: {
				query: async (input: unknown) => {
					calls.push(input);
					return [];
				},
				suggest: async () => ({}),
				savedList: async () => [],
				savedCreate: async () => ({ id: "v" }),
				savedDelete: async () => ({ ok: true }),
			},
		};

		await runSearch(["bug", "--limit", "5"], { caller, ...io.opts });

		expect((calls[0] as { limit: number }).limit).toBe(5);
	});

	test("--json emits a JSON array", async () => {
		const io = testIo();
		const caller = {
			search: {
				query: async () => [{ id: "t1", kind: "task", title: "Json task" }],
				suggest: async () => ({}),
				savedList: async () => [],
				savedCreate: async () => ({ id: "v" }),
				savedDelete: async () => ({ ok: true }),
			},
		};

		await runSearch(["x", "--json"], { caller, ...io.opts });

		expect(io.err).toEqual([]);
		const text = io.out.join("");
		const parsed = JSON.parse(text);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0].title).toBe("Json task");
	});
});
