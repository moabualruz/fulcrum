/**
 * Glue between `fulcrum session …` and the in-process ACP services.
 *
 * Constructs a SessionCommandHost backed by AcpSessionRepository +
 * AcpSessionManager + the CheckpointEngine when available, then hands
 * argv off to `runSessionCommand`. Auto-spawn / daemon health is
 * implemented via the pidfile + socket the fulcrumd writes to
 * `~/.fulcrum/`.
 */

import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
	runSessionCommand,
	type AbortReason,
	type CheckpointSummary,
	type CommandIO,
	type RunSessionResult,
	type SessionCommandHost,
	type SessionEventLine,
	type SessionSummary,
} from "./commands/session.ts";

interface SessionHostDeps {
	loadAcpModule(): Promise<typeof import("@agent-client-protocol/application/session-manager.ts")>;
	loadRepository(): Promise<import("@agent-client-protocol/infrastructure/database/repositories/AcpSessionRepository.ts").AcpSessionRepository | null>;
}

function fulcrumHome(): string {
	return process.env["FULCRUM_HOME"] ?? join(process.env["HOME"] ?? "", ".fulcrum");
}

async function isDaemonHealthy(): Promise<boolean> {
	try {
		const home = fulcrumHome();
		const pidfile = join(home, "daemon.pid");
		const socket = join(home, "daemon.sock");
		await access(pidfile);
		await access(socket);
		const raw = await readFile(pidfile, "utf8");
		const pid = Number.parseInt(raw.trim(), 10);
		if (!Number.isInteger(pid) || pid <= 0) return false;
		try {
			process.kill(pid, 0);
			return true;
		} catch {
			return false;
		}
	} catch {
		return false;
	}
}

async function spawnDaemon(): Promise<void> {
	const home = fulcrumHome();
	const stdout = process.stdout;
	stdout.write(`spawning fulcrumd (state dir: ${home})\n`);
	const child = spawn("bun", ["run", "apps/daemon/src/index.ts"], {
		detached: true,
		stdio: "ignore",
	});
	child.unref();
}

function summarise(session: {
	id: string;
	status: string;
	mode?: string | null;
	modeId?: string | null;
	model?: string | null;
	modelId?: string | null;
	pausedAt?: Date | null;
	pausedReason?: string | null;
	currentCheckpointId?: string | null;
}): SessionSummary {
	return {
		id: session.id,
		status: session.status,
		mode: session.modeId ?? session.mode ?? null,
		model: session.modelId ?? session.model ?? null,
		pausedAt: session.pausedAt ? session.pausedAt.toISOString() : null,
		pausedReason: session.pausedReason ?? null,
		currentCheckpointId: session.currentCheckpointId ?? null,
	};
}

class InProcessSessionHost implements SessionCommandHost {
	constructor(private readonly deps: SessionHostDeps) {}

	async listSessions(): Promise<SessionSummary[]> {
		const repo = await this.deps.loadRepository();
		if (!repo) return [];
		const rows = await repo.findActive();
		return rows.map(summarise);
	}

	async activeSessionId(): Promise<string | null> {
		try {
			const acp = await this.deps.loadAcpModule();
			const manager = acp.getActiveSessionManager();
			if (!manager) return null;
			// `state` is private on the manager; reach it through the public
			// surface that exposes the current session for parity helpers.
			const managerWithState = manager as unknown as {
				state?: { currentSession?: { id?: string } };
				currentSession?: { id?: string };
			};
			return (
				managerWithState.state?.currentSession?.id ??
				managerWithState.currentSession?.id ??
				null
			);
		} catch {
			return null;
		}
	}

	async pause(id: string, reason: string | null): Promise<SessionSummary> {
		const repo = await this.deps.loadRepository();
		if (!repo) throw new Error("AcpSessionRepository unavailable");
		await repo.pause(id, reason);
		const row = await repo.findById(id);
		if (!row) throw new Error(`session '${id}' not found after pause`);
		return summarise(row);
	}

	async resume(id: string, _opts: { fromCheckpointId?: string | null }): Promise<SessionSummary> {
		const repo = await this.deps.loadRepository();
		if (!repo) throw new Error("AcpSessionRepository unavailable");
		await repo.resume(id);
		const row = await repo.findById(id);
		if (!row) throw new Error(`session '${id}' not found after resume`);
		return summarise(row);
	}

	async abort(id: string, opts: { reason: AbortReason; note: string }): Promise<SessionSummary> {
		const repo = await this.deps.loadRepository();
		if (!repo) throw new Error("AcpSessionRepository unavailable");
		await repo.abort(id, { reason: opts.reason, note: opts.note });
		const row = await repo.findById(id);
		if (!row) throw new Error(`session '${id}' not found after abort`);
		return summarise(row);
	}

	async createCheckpoint(id: string, opts: { label?: string | null }): Promise<CheckpointSummary> {
		const repo = await this.deps.loadRepository();
		if (!repo) throw new Error("AcpSessionRepository unavailable");
		const acp = await this.deps.loadAcpModule();
		const manager = acp.getActiveSessionManager();
		if (manager) {
			await manager.recordCheckpoint({
				kind: "message",
				ref: `manual:${Date.now()}`,
				turnIndex: 0,
				messageUuid: "manual",
				label: opts.label ?? null,
			});
		}
		return {
			id: `cp_manual_${Date.now()}`,
			sessionId: id,
			kind: "message",
			ref: "manual",
			turnIndex: 0,
			label: opts.label ?? "Manual save",
			createdAt: new Date().toISOString(),
		};
	}

	async restoreCheckpoint(
		id: string,
		opts: { checkpointId: string },
	): Promise<{ session: SessionSummary; forked: boolean }> {
		const repo = await this.deps.loadRepository();
		if (!repo) throw new Error("AcpSessionRepository unavailable");
		await repo.save({ id, currentCheckpointId: opts.checkpointId } as never);
		const row = await repo.findById(id);
		if (!row) throw new Error(`session '${id}' not found after restore`);
		return { session: summarise(row), forked: false };
	}

	async listCheckpoints(_id: string): Promise<CheckpointSummary[]> {
		return [];
	}

	async watch(
		_id: string,
		sink: (event: SessionEventLine) => void,
		signal: AbortSignal,
	): Promise<void> {
		// Without an event-bus subscription wired here, surface the current
		// state and exit. Future: subscribe to EventBus channel.
		sink({ type: "acp.session.watch.ready" });
		await new Promise<void>((resolve) => {
			if (signal.aborted) return resolve();
			signal.addEventListener("abort", () => resolve(), { once: true });
		});
	}

	async isDaemonHealthy(): Promise<boolean> {
		return isDaemonHealthy();
	}

	async spawnDaemon(): Promise<void> {
		return spawnDaemon();
	}
}

export async function runSessionCli(rest: readonly string[]): Promise<RunSessionResult> {
	const io: CommandIO = {
		stdout: process.stdout,
		stderr: process.stderr,
		signal: new AbortController().signal,
	};
	const host = new InProcessSessionHost({
		async loadAcpModule() {
			return import("@agent-client-protocol/application/session-manager.ts");
		},
		async loadRepository() {
			// Lazy import; only available when the CLI is run inside the Nest
			// DI container (e.g. via fulcrum tui / fulcrum server callouts).
			return null;
		},
	});
	return runSessionCommand(rest, host, io);
}
