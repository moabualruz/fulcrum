import { describe, expect, test } from "bun:test";
import { CheckpointEngine, type CheckpointEvent, type CheckpointPersistence, type EngineHistoryAccess } from "./engine.ts";
import type { CheckpointEnvironment, CheckpointStrategy } from "./strategy.ts";
import type { CheckpointKind, CheckpointRecord, CheckpointTriggerContext } from "./types.ts";

function fakeEnv(overrides: Partial<CheckpointEnvironment> = {}): CheckpointEnvironment {
	return {
		async exec(_cmd, _args, _opts) {
			return { stdout: "", stderr: "", exitCode: 0 };
		},
		async mkdir(_dir) {},
		async copyFile(_s, _t) {},
		async writeJson(_p, _v) {},
		async readJson(_p) {
			return {};
		},
		async listTracked(_cwd) {
			return [];
		},
		...overrides,
	};
}

function recordingPersistence() {
	const created: CheckpointRecord[] = [];
	const deleted: string[] = [];
	const persistence: CheckpointPersistence = {
		async createCheckpoint(input) {
			const rec: CheckpointRecord = {
				id: input.id,
				sessionId: input.sessionId,
				kind: input.kind,
				ref: input.ref,
				turnIndex: input.turnIndex,
				messageUuid: input.messageUuid,
				label: input.label ?? "label",
				createdAt: new Date(),
			};
			created.push(rec);
			return rec;
		},
		async listCheckpoints(sessionId) {
			return created.filter((r) => r.sessionId === sessionId);
		},
		async deleteCheckpoint(id) {
			deleted.push(id);
		},
		async loadCheckpoint(id) {
			return created.find((r) => r.id === id) ?? null;
		},
	};
	return { persistence, created, deleted };
}

function fakeHistory(): EngineHistoryAccess {
	return {
		async getHistory() {
			return { messages: [] };
		},
		async forkSession(parent, _checkpoint) {
			return `${parent}-fork`;
		},
	};
}

function strategy(kind: CheckpointKind): CheckpointStrategy {
	return {
		kind,
		async snapshot(ctx) {
			return { kind, ref: `${kind}-ref-${ctx.turnIndex}` };
		},
		async restore(_ref, _ctx) {},
	};
}

function ctx(turnIndex: number, overrides: Partial<CheckpointTriggerContext> = {}): CheckpointTriggerContext {
	return {
		sessionId: "session-1",
		cwd: "/tmp/work",
		turnIndex,
		messageUuid: "msg",
		...overrides,
	};
}

describe("CheckpointEngine", () => {
	test("captures via the resolved strategy and emits checkpointed event", async () => {
		const events: CheckpointEvent[] = [];
		const { persistence, created } = recordingPersistence();
		const engine = new CheckpointEngine({
			strategies: { git: strategy("git"), file: strategy("file"), message: strategy("message") },
			persistence,
			env: fakeEnv(),
			history: fakeHistory(),
			emit: (e) => {
				events.push(e);
			},
			createId: () => "cp-1",
		});

		const out = await engine.capture(ctx(3, { label: " hand-written  " }), "explicit-save", "git");
		expect(out.kind).toBe("git");
		expect(out.ref).toBe("git-ref-3");
		expect(created).toHaveLength(1);
		expect(created[0]?.label).toBe("hand-written");
		expect(events[0]?.type).toBe("acp.session.checkpointed");
	});

	test("auto mode picks git when env reports a working tree, file otherwise", async () => {
		const { persistence } = recordingPersistence();
		const engine = new CheckpointEngine({
			strategies: { git: strategy("git"), file: strategy("file"), message: strategy("message") },
			persistence,
			env: fakeEnv({
				async exec(_cmd, args) {
					if (args[0] === "rev-parse") {
						return { stdout: "/tmp/work\n", stderr: "", exitCode: 0 };
					}
					return { stdout: "", stderr: "", exitCode: 0 };
				},
			}),
			history: fakeHistory(),
			emit: () => {},
			createId: () => "cp-auto",
		});
		const gitOut = await engine.capture(ctx(1), "assistant-turn-complete", "auto");
		expect(gitOut.kind).toBe("git");

		const fileEngine = new CheckpointEngine({
			strategies: { git: strategy("git"), file: strategy("file"), message: strategy("message") },
			persistence,
			env: fakeEnv({
				async exec() {
					return { stdout: "", stderr: "not a repo", exitCode: 128 };
				},
			}),
			history: fakeHistory(),
			emit: () => {},
			createId: () => "cp-auto-2",
		});
		const fileOut = await fileEngine.capture(ctx(2), "pause", "auto");
		expect(fileOut.kind).toBe("file");
	});

	test("restore loads the record and emits a restored event", async () => {
		const events: CheckpointEvent[] = [];
		const { persistence } = recordingPersistence();
		const engine = new CheckpointEngine({
			strategies: { git: strategy("git"), file: strategy("file"), message: strategy("message") },
			persistence,
			env: fakeEnv(),
			history: fakeHistory(),
			emit: (e) => {
				events.push(e);
			},
			createId: () => "cp-restore",
		});
		const made = await engine.capture(ctx(5), "pause", "git");
		await engine.restore(made.id, "/tmp/work");
		expect(events.map((e) => e.type)).toEqual([
			"acp.session.checkpointed",
			"acp.session.restored",
		]);
	});

	test("fork produces a new session id and emits the forked event", async () => {
		const events: CheckpointEvent[] = [];
		const { persistence } = recordingPersistence();
		const engine = new CheckpointEngine({
			strategies: { git: strategy("git"), file: strategy("file"), message: strategy("message") },
			persistence,
			env: fakeEnv(),
			history: fakeHistory(),
			emit: (e) => {
				events.push(e);
			},
			createId: () => "cp-fork",
		});
		const made = await engine.capture(ctx(7), "explicit-save", "git");
		const out = await engine.fork(made.id);
		expect(out.forkedSessionId).toBe("session-1-fork");
		const forked = events.find((e) => e.type === "acp.session.forked");
		expect(forked).toBeDefined();
	});

	test("retention gc drops records past the configured count", async () => {
		let idx = 0;
		const { persistence, deleted } = recordingPersistence();
		const engine = new CheckpointEngine({
			strategies: { git: strategy("git"), file: strategy("file"), message: strategy("message") },
			persistence,
			env: fakeEnv(),
			history: fakeHistory(),
			emit: () => {},
			retention: { maxCount: 2, maxAgeDays: 365 },
			createId: () => `cp-${idx++}`,
		});
		for (let turn = 0; turn < 5; turn++) {
			await engine.capture(ctx(turn), "assistant-turn-complete", "git");
		}
		// 5 created, retention keeps 2, so 3 deletions across runs.
		expect(deleted.length).toBeGreaterThanOrEqual(3);
	});

	test("retention gc drops records older than the cutoff", async () => {
		let idx = 0;
		let now = new Date("2026-01-01T00:00:00Z").getTime();
		const persistence: CheckpointPersistence = {
			async createCheckpoint(input) {
				return {
					id: input.id,
					sessionId: input.sessionId,
					kind: input.kind,
					ref: input.ref,
					turnIndex: input.turnIndex,
					messageUuid: input.messageUuid,
					label: input.label ?? "label",
					createdAt: new Date(now),
				};
			},
			async listCheckpoints() {
				return [
					{
						id: "old-1",
						sessionId: "session-1",
						kind: "git",
						ref: "ref-old",
						turnIndex: 0,
						messageUuid: "m",
						label: "label",
						createdAt: new Date("2025-01-01T00:00:00Z"),
					},
					{
						id: "recent-1",
						sessionId: "session-1",
						kind: "git",
						ref: "ref-recent",
						turnIndex: 1,
						messageUuid: "m",
						label: "label",
						createdAt: new Date(now),
					},
				];
			},
			async deleteCheckpoint(id) {
				deleted.push(id);
			},
			async loadCheckpoint(id) {
				return id === "old-1" ? null : null;
			},
		};
		const deleted: string[] = [];
		const engine = new CheckpointEngine({
			strategies: { git: strategy("git"), file: strategy("file"), message: strategy("message") },
			persistence,
			env: fakeEnv(),
			history: fakeHistory(),
			emit: () => {},
			retention: { maxCount: 50, maxAgeDays: 30 },
			now: () => new Date(now),
			createId: () => `cp-${idx++}`,
		});
		await engine.runRetentionGc("session-1");
		expect(deleted).toContain("old-1");
		expect(deleted).not.toContain("recent-1");
	});
});
