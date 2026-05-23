import { describe, expect, test } from "bun:test";
import { GitCheckpointStrategy, detectGitWorkingTree } from "./git-strategy.ts";
import { FileCheckpointStrategy } from "./file-strategy.ts";
import { MessageCheckpointStrategy } from "./message-strategy.ts";
import type { CheckpointEnvironment } from "./strategy.ts";

interface RecordedExec {
	cmd: string;
	args: readonly string[];
	cwd?: string;
}

function makeEnv(initial?: Partial<CheckpointEnvironment>): {
	env: CheckpointEnvironment;
	execCalls: RecordedExec[];
	mkdirCalls: string[];
	copyCalls: Array<{ source: string; target: string }>;
	writes: Array<{ path: string; payload: unknown }>;
	files: Map<string, unknown>;
} {
	const execCalls: RecordedExec[] = [];
	const mkdirCalls: string[] = [];
	const copyCalls: Array<{ source: string; target: string }> = [];
	const writes: Array<{ path: string; payload: unknown }> = [];
	const files = new Map<string, unknown>();
	const env: CheckpointEnvironment = {
		async exec(cmd, args, opts) {
			execCalls.push({ cmd, args, cwd: opts?.cwd });
			if (cmd === "git" && args[0] === "write-tree") {
				return { stdout: "tree-sha\n", stderr: "", exitCode: 0 };
			}
			if (cmd === "git" && args[0] === "commit-tree") {
				return { stdout: "commit-sha\n", stderr: "", exitCode: 0 };
			}
			if (cmd === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") {
				return { stdout: opts?.cwd ?? "", stderr: "", exitCode: opts?.cwd ? 0 : 128 };
			}
			if (cmd === "git" && args[0] === "rev-parse") {
				return { stdout: "abc123\n", stderr: "", exitCode: 0 };
			}
			return { stdout: "", stderr: "", exitCode: 0 };
		},
		async mkdir(dir) {
			mkdirCalls.push(dir);
		},
		async copyFile(source, target) {
			copyCalls.push({ source, target });
		},
		async writeJson(path, payload) {
			writes.push({ path, payload });
			files.set(path, payload);
		},
		async readJson(path) {
			return files.get(path) ?? {};
		},
		async listTracked(_cwd) {
			return ["src/a.ts", "src/b.ts"];
		},
		...initial,
	};
	return { env, execCalls, mkdirCalls, copyCalls, writes, files };
}

describe("GitCheckpointStrategy", () => {
	test("snapshot writes orphan tree + ref and reports the ref path", async () => {
		const harness = makeEnv();
		const strategy = new GitCheckpointStrategy(harness.env);
		const out = await strategy.snapshot({
			sessionId: "s1",
			cwd: "/tmp/repo",
			turnIndex: 4,
			messageUuid: "m",
		});
		expect(out.kind).toBe("git");
		expect(out.ref).toBe("refs/fulcrum/checkpoints/s1/4");
		const updateRef = harness.execCalls.find((c) => c.args[0] === "update-ref");
		expect(updateRef?.args).toEqual(["update-ref", "refs/fulcrum/checkpoints/s1/4", "commit-sha"]);
	});

	test("restore rewrites the index from the recorded ref", async () => {
		const harness = makeEnv();
		const strategy = new GitCheckpointStrategy(harness.env);
		await strategy.restore("refs/fulcrum/checkpoints/s1/4", {
			sessionId: "s1",
			cwd: "/tmp/repo",
			turnIndex: 4,
			messageUuid: "m",
		});
		const checkout = harness.execCalls.find((c) => c.args[0] === "checkout-index");
		expect(checkout).toBeDefined();
	});

	test("detectGitWorkingTree returns true only when rev-parse succeeds", async () => {
		const harness = makeEnv();
		const yes = await detectGitWorkingTree(harness.env, "/tmp/repo");
		expect(yes).toBe(true);
		const no = await detectGitWorkingTree(harness.env, null);
		expect(no).toBe(false);
	});
});

describe("FileCheckpointStrategy", () => {
	test("snapshot copies tracked files into the per-turn snapshot dir", async () => {
		const harness = makeEnv();
		const strategy = new FileCheckpointStrategy(harness.env, "/snap");
		const out = await strategy.snapshot({
			sessionId: "s1",
			cwd: "/tmp/repo",
			turnIndex: 2,
			messageUuid: "m",
		});
		expect(out.ref).toBe("/snap/sessions/s1/files/2");
		expect(harness.copyCalls).toHaveLength(2);
		expect(harness.copyCalls[0]?.target).toContain("/snap/sessions/s1/files/2/src/a.ts");
	});
});

describe("MessageCheckpointStrategy", () => {
	test("snapshot persists history payload at the per-turn json path", async () => {
		const harness = makeEnv();
		const strategy = new MessageCheckpointStrategy(harness.env, "/snap", async (id) => ({
			messages: [{ role: "user", content: id }],
		}));
		const out = await strategy.snapshot({
			sessionId: "s1",
			cwd: "/tmp/repo",
			turnIndex: 9,
			messageUuid: "m9",
		});
		expect(out.ref).toBe("/snap/sessions/s1/messages/9.json");
		expect(harness.writes).toHaveLength(1);
		const snapshot = harness.writes[0]?.payload as {
			sessionId: string;
			turnIndex: number;
			history: { messages: Array<{ role: string; content: string }> };
		};
		expect(snapshot.sessionId).toBe("s1");
		expect(snapshot.turnIndex).toBe(9);
		expect(snapshot.history.messages[0]?.content).toBe("s1");
	});
});
