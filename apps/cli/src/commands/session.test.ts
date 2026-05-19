import { describe, expect, test } from "bun:test";
import {
	ABORT_REASONS,
	CLI_ENVELOPE_KIND,
	runSessionCommand,
	type CheckpointSummary,
	type SessionCommandHost,
	type SessionEnvelope,
	type SessionEventLine,
	type SessionSummary,
} from "./session.ts";

function summary(over: Partial<SessionSummary> = {}): SessionSummary {
	return {
		id: "s1",
		status: "active",
		mode: "build",
		model: "claude",
		pausedAt: null,
		pausedReason: null,
		currentCheckpointId: null,
		...over,
	};
}

function checkpointSummary(over: Partial<CheckpointSummary> = {}): CheckpointSummary {
	return {
		id: "cp1",
		sessionId: "s1",
		kind: "git",
		ref: "refs/fulcrum/checkpoints/s1/0",
		turnIndex: 0,
		label: "Manual",
		createdAt: new Date("2026-05-19T00:00:00Z").toISOString(),
		...over,
	};
}

function fakeHost(over: Partial<SessionCommandHost> = {}): SessionCommandHost & { calls: string[] } {
	const calls: string[] = [];
	const host: SessionCommandHost = {
		async listSessions() {
			calls.push("list");
			return [summary()];
		},
		async activeSessionId() {
			return "s1";
		},
		async pause(id, reason) {
			calls.push(`pause:${id}:${reason ?? ""}`);
			return summary({ status: "paused", pausedAt: new Date().toISOString(), pausedReason: reason });
		},
		async resume(id, opts) {
			calls.push(`resume:${id}:${opts.fromCheckpointId ?? ""}`);
			return summary();
		},
		async abort(id, opts) {
			calls.push(`abort:${id}:${opts.reason}:${opts.note}`);
			return summary({ status: "aborted" });
		},
		async createCheckpoint(id, opts) {
			calls.push(`checkpoint:${id}:${opts.label ?? ""}`);
			return checkpointSummary({ sessionId: id, label: opts.label ?? "Manual" });
		},
		async restoreCheckpoint(id, opts) {
			calls.push(`restore:${id}:${opts.checkpointId}`);
			return { session: summary({ currentCheckpointId: opts.checkpointId }), forked: false };
		},
		async listCheckpoints(id) {
			calls.push(`checkpoints:${id}`);
			return [checkpointSummary({ sessionId: id })];
		},
		async watch(_id, sink, _signal) {
			calls.push("watch");
			sink({ type: "acp.session.checkpointed", checkpointId: "cp1" });
		},
		async isDaemonHealthy() {
			return true;
		},
		async spawnDaemon() {
			calls.push("spawn");
		},
		...over,
	};
	return Object.assign(host, { calls });
}

function makeIo() {
	const stdoutBuf: string[] = [];
	const stderrBuf: string[] = [];
	const controller = new AbortController();
	return {
		io: {
			stdout: { write: (chunk: string) => stdoutBuf.push(chunk) },
			stderr: { write: (chunk: string) => stderrBuf.push(chunk) },
			signal: controller.signal,
		},
		stdout: () => stdoutBuf.join(""),
		stderr: () => stderrBuf.join(""),
		controller,
	};
}

function lastJsonLine<T>(text: string): SessionEnvelope<T> {
	const trimmed = text.trim().split("\n").filter(Boolean);
	const last = trimmed[trimmed.length - 1] ?? "";
	return JSON.parse(last) as SessionEnvelope<T>;
}

describe("fulcrum session command", () => {
	test("rejects unknown verb with exit code 2", async () => {
		const host = fakeHost();
		const harness = makeIo();
		const out = await runSessionCommand(["bogus"], host, harness.io);
		expect(out.exitCode).toBe(2);
		expect(harness.stderr()).toContain("unknown session verb");
	});

	test("list emits envelope when --json is set", async () => {
		const host = fakeHost();
		const harness = makeIo();
		await runSessionCommand(["list", "--json"], host, harness.io);
		const env = lastJsonLine<SessionSummary[]>(harness.stdout());
		expect(env.kind).toBe(CLI_ENVELOPE_KIND);
		expect(env.verb).toBe("list");
		expect(env.ok).toBe(true);
		expect(env.data?.[0]?.id).toBe("s1");
	});

	test("pause defaults to the active session when id omitted", async () => {
		const host = fakeHost();
		const harness = makeIo();
		await runSessionCommand(["pause", "--json", "--reason", "lunch"], host, harness.io);
		expect(host.calls).toContain("pause:s1:lunch");
	});

	test("resume forwards --from-checkpoint", async () => {
		const host = fakeHost();
		const harness = makeIo();
		await runSessionCommand(
			["resume", "s1", "--from-checkpoint", "cp7", "--json"],
			host,
			harness.io,
		);
		expect(host.calls).toContain("resume:s1:cp7");
	});

	test("abort enforces reason + note", async () => {
		const host = fakeHost();
		const harness = makeIo();
		const noReason = await runSessionCommand(["abort", "s1", "--json"], host, harness.io);
		expect(noReason.exitCode).toBe(1);
		const env = lastJsonLine(harness.stdout());
		expect(env.ok).toBe(false);
		expect(env.error?.message).toContain("--reason");
	});

	test("abort succeeds with valid reason and note", async () => {
		const host = fakeHost();
		const harness = makeIo();
		const ok = await runSessionCommand(
			["abort", "s1", "--reason", "cost-cap", "--note", "exceeded budget", "--json"],
			host,
			harness.io,
		);
		expect(ok.exitCode).toBe(0);
		expect(host.calls.some((c) => c.startsWith("abort:s1:cost-cap"))).toBe(true);
	});

	test("checkpoint passes --label through", async () => {
		const host = fakeHost();
		const harness = makeIo();
		await runSessionCommand(["checkpoint", "--label", "milestone", "--json"], host, harness.io);
		expect(host.calls).toContain("checkpoint:s1:milestone");
	});

	test("restore requires --checkpoint", async () => {
		const host = fakeHost();
		const harness = makeIo();
		const missing = await runSessionCommand(["restore", "s1", "--json"], host, harness.io);
		expect(missing.exitCode).toBe(1);
		const env = lastJsonLine(harness.stdout());
		expect(env.error?.message).toContain("--checkpoint");
	});

	test("checkpoints lists records", async () => {
		const host = fakeHost();
		const harness = makeIo();
		await runSessionCommand(["checkpoints", "s1", "--json"], host, harness.io);
		const env = lastJsonLine<CheckpointSummary[]>(harness.stdout());
		expect(env.data?.[0]?.sessionId).toBe("s1");
	});

	test("watch invokes sink for each event in --json mode", async () => {
		const host = fakeHost();
		const harness = makeIo();
		await runSessionCommand(["watch", "s1", "--json"], host, harness.io);
		const lines = harness.stdout().trim().split("\n").filter(Boolean);
		const parsed = JSON.parse(lines[0] ?? "{}") as SessionEventLine;
		expect(parsed.type).toBe("acp.session.checkpointed");
	});

	test("auto-spawns the daemon when unhealthy and --no-spawn is absent", async () => {
		let healthy = false;
		const host = fakeHost();
		host.isDaemonHealthy = async () => healthy;
		const original = host.spawnDaemon;
		host.spawnDaemon = async () => {
			healthy = true;
			await original.call(host);
		};
		const harness = makeIo();
		await runSessionCommand(["list", "--json"], host, harness.io);
		expect(host.calls).toContain("spawn");
	});

	test("--no-spawn skips daemon auto-spawn", async () => {
		const host = fakeHost({
			async isDaemonHealthy() {
				return false;
			},
		});
		const harness = makeIo();
		await runSessionCommand(["list", "--no-spawn", "--json"], host, harness.io);
		expect(host.calls).not.toContain("spawn");
	});

	test("ABORT_REASONS exposes the documented enum", () => {
		expect(ABORT_REASONS).toEqual(["user-cancel", "dangerous-output", "wrong-context", "cost-cap"]);
	});
});
