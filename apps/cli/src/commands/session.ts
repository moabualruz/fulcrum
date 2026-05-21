/**
 * `fulcrum session <verb>` — pause / resume / abort / checkpoint / restore /
 * checkpoints / list / watch.
 *
 * Verbs delegate to the in-process AcpSessionRepository + AcpSessionManager
 * (created via the local CLI caller). The CLI surface is thin: parse args,
 * validate required flags, return a `fulcrum.cli.v1` JSON envelope or
 * human-readable text, exit non-zero on failure.
 *
 * The implementation is parameterised by an injectable `SessionCommandHost`
 * so unit tests can run every verb without spinning up the Nest container.
 */

import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { DataSource } from "typeorm";
import { AcpSessionCheckpoint } from "@agent-client-protocol/infrastructure/database/entities/AcpSessionCheckpoint.ts";
import { AcpSession } from "@agent-client-protocol/infrastructure/database/entities/AcpSession.ts";
import { AcpSessionRepository } from "@agent-client-protocol/infrastructure/database/repositories/AcpSessionRepository.ts";
import { buildLocalApplicationContainer } from "@platform-core/application/runtime/local-application-container.ts";
import { parseArgs } from "../arg-parser.ts";
import { emitResult } from "../lib/cli-output.ts";

export const CLI_ENVELOPE_KIND = "fulcrum.cli.v1" as const;

export const SESSION_HELP = `fulcrum session — persisted AI Assist sessions

Usage:
  fulcrum session <list|pause|resume|abort|checkpoint|restore|checkpoints|watch> [--json] [--no-spawn]

Options:
  --json      Canonical fulcrum.cli.v1 JSON envelope
  --no-spawn  Do not auto-start fulcrumd before running the command
`;

export type SessionVerb =
	| "list"
	| "pause"
	| "resume"
	| "abort"
	| "checkpoint"
	| "restore"
	| "checkpoints"
	| "watch";

export const SESSION_VERBS: ReadonlySet<SessionVerb> = new Set([
	"list",
	"pause",
	"resume",
	"abort",
	"checkpoint",
	"restore",
	"checkpoints",
	"watch",
]);

export const ABORT_REASONS = [
	"user-cancel",
	"dangerous-output",
	"wrong-context",
	"cost-cap",
] as const;
export type AbortReason = (typeof ABORT_REASONS)[number];

export interface SessionSummary {
	id: string;
	status: string;
	mode: string | null;
	model: string | null;
	pausedAt: string | null;
	pausedReason: string | null;
	currentCheckpointId: string | null;
}

export interface CheckpointSummary {
	id: string;
	sessionId: string;
	kind: "git" | "file" | "message";
	ref: string;
	turnIndex: number;
	label: string;
	createdAt: string;
}

export interface SessionEventLine {
	type: string;
	[key: string]: unknown;
}

export interface SessionCommandHost {
	listSessions(): Promise<SessionSummary[]>;
	activeSessionId(): Promise<string | null>;
	pause(id: string, reason: string | null): Promise<SessionSummary>;
	resume(id: string, opts: { fromCheckpointId?: string | null }): Promise<SessionSummary>;
	abort(id: string, opts: { reason: AbortReason; note: string }): Promise<SessionSummary>;
	createCheckpoint(id: string, opts: { label?: string | null }): Promise<CheckpointSummary>;
	restoreCheckpoint(id: string, opts: { checkpointId: string }): Promise<{ session: SessionSummary; forked: boolean }>;
	listCheckpoints(id: string): Promise<CheckpointSummary[]>;
	watch(id: string, sink: (event: SessionEventLine) => void, signal: AbortSignal): Promise<void>;
	/** Best-effort: returns true when fulcrumd's pid+socket are healthy. */
	isDaemonHealthy(): Promise<boolean>;
	/** Launch fulcrumd in the background if not already healthy. */
	spawnDaemon(): Promise<void>;
}

export interface LocalSessionCommandHost {
	host: SessionCommandHost;
	cleanup(): Promise<void>;
}

export interface CommandIO {
	stdout: { write(chunk: string): void };
	stderr: { write(chunk: string): void };
	signal: AbortSignal;
}

export interface SessionEnvelope<T> {
	kind: typeof CLI_ENVELOPE_KIND;
	verb: SessionVerb;
	ok: boolean;
	data?: T;
	error?: { code: string; message: string };
}

export function envelope<T>(
	verb: SessionVerb,
	data: T | undefined,
	error?: { code: string; message: string },
): SessionEnvelope<T> {
	return {
		kind: CLI_ENVELOPE_KIND,
		verb,
		ok: !error,
		...(data !== undefined ? { data } : {}),
		...(error ? { error } : {}),
	};
}

export async function createLocalSessionCommandHost(): Promise<LocalSessionCommandHost> {
	const { container, cleanup } = await buildLocalApplicationContainer();
	const dataSource = container.get(DataSource);
	const host = new DataSourceSessionCommandHost(dataSource);
	return { host, cleanup };
}

export interface RunSessionResult {
	exitCode: number;
}

const SESSION_BOOLEAN_FLAGS: ReadonlySet<string> = new Set([
	"--json",
	"--no-spawn",
]);

export async function runSessionCommand(
	argv: readonly string[],
	host: SessionCommandHost,
	io: CommandIO,
): Promise<RunSessionResult> {
	const parsed = parseArgs(argv, SESSION_BOOLEAN_FLAGS);
	const [verb, ...positionals] = parsed.positionals;
	if (!verb || verb === "help" || verb === "--help" || verb === "-h") {
		io.stdout.write(SESSION_HELP);
		return { exitCode: 0 };
	}
	if (!verb || !SESSION_VERBS.has(verb as SessionVerb)) {
		writeError(io, `unknown session verb: '${verb ?? ""}'`);
		writeError(io, `verbs: ${[...SESSION_VERBS].join(", ")}`);
		return { exitCode: 2 };
	}
	const json = parsed.flags["--json"] === true;
	const skipSpawn = parsed.flags["--no-spawn"] === true;

	if (!skipSpawn && !(await host.isDaemonHealthy())) {
		await host.spawnDaemon();
	}

	try {
		switch (verb as SessionVerb) {
			case "list":
				return await runList(host, io, { json });
			case "pause":
				return await runPause(host, io, positionals, parsed.flags, { json });
			case "resume":
				return await runResume(host, io, positionals, parsed.flags, { json });
			case "abort":
				return await runAbort(host, io, positionals, parsed.flags, { json });
			case "checkpoint":
				return await runCheckpoint(host, io, positionals, parsed.flags, { json });
			case "restore":
				return await runRestore(host, io, positionals, parsed.flags, { json });
			case "checkpoints":
				return await runCheckpoints(host, io, positionals, { json });
			case "watch":
				return await runWatch(host, io, positionals, { json });
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const result = envelope(verb as SessionVerb, undefined, {
			code: "session-command-failed",
			message,
		});
		if (json) {
			io.stdout.write(`${JSON.stringify(result)}\n`);
		} else {
			writeError(io, message);
		}
		return { exitCode: 1 };
	}
	return { exitCode: 1 };
}

async function runList(host: SessionCommandHost, io: CommandIO, opts: { json: boolean }): Promise<RunSessionResult> {
	const sessions = await host.listSessions();
	if (opts.json) {
		emit(io, "list", sessions, opts);
	} else {
		if (sessions.length === 0) io.stdout.write("(no sessions)\n");
		for (const s of sessions) {
			io.stdout.write(`${s.id}  ${s.status}  ${s.mode ?? "-"}  ${s.model ?? "-"}\n`);
		}
	}
	return { exitCode: 0 };
}

async function resolveSessionId(
	host: SessionCommandHost,
	positionals: readonly string[],
): Promise<string> {
	const explicit = positionals[0];
	if (explicit) return explicit;
	const active = await host.activeSessionId();
	if (!active) throw new Error("no active session; pass <id> explicitly");
	return active;
}

async function runPause(
	host: SessionCommandHost,
	io: CommandIO,
	positionals: readonly string[],
	flags: Record<string, string | true>,
	opts: { json: boolean },
): Promise<RunSessionResult> {
	const id = await resolveSessionId(host, positionals);
	const reason = typeof flags["--reason"] === "string" ? flags["--reason"] : null;
	const out = await host.pause(id, reason);
	emit(io, "pause", out, opts);
	return { exitCode: 0 };
}

async function runResume(
	host: SessionCommandHost,
	io: CommandIO,
	positionals: readonly string[],
	flags: Record<string, string | true>,
	opts: { json: boolean },
): Promise<RunSessionResult> {
	const id = await resolveSessionId(host, positionals);
	const fromCheckpointId =
		typeof flags["--from-checkpoint"] === "string" ? flags["--from-checkpoint"] : null;
	const out = await host.resume(id, { fromCheckpointId });
	emit(io, "resume", out, opts);
	return { exitCode: 0 };
}

async function runAbort(
	host: SessionCommandHost,
	io: CommandIO,
	positionals: readonly string[],
	flags: Record<string, string | true>,
	opts: { json: boolean },
): Promise<RunSessionResult> {
	const id = positionals[0];
	if (!id) throw new Error("usage: fulcrum session abort <id> --reason <r> --note <n>");
	const rawReason = flags["--reason"];
	const rawNote = flags["--note"];
	if (typeof rawReason !== "string" || !ABORT_REASONS.includes(rawReason as AbortReason)) {
		throw new Error(`--reason required (one of: ${ABORT_REASONS.join(", ")})`);
	}
	if (typeof rawNote !== "string" || rawNote.trim().length === 0) {
		throw new Error("--note required (non-empty audit string)");
	}
	const out = await host.abort(id, { reason: rawReason as AbortReason, note: rawNote });
	emit(io, "abort", out, opts);
	return { exitCode: 0 };
}

async function runCheckpoint(
	host: SessionCommandHost,
	io: CommandIO,
	positionals: readonly string[],
	flags: Record<string, string | true>,
	opts: { json: boolean },
): Promise<RunSessionResult> {
	const id = await resolveSessionId(host, positionals);
	const label = typeof flags["--label"] === "string" ? flags["--label"] : null;
	const out = await host.createCheckpoint(id, { label });
	emit(io, "checkpoint", out, opts);
	return { exitCode: 0 };
}

async function runRestore(
	host: SessionCommandHost,
	io: CommandIO,
	positionals: readonly string[],
	flags: Record<string, string | true>,
	opts: { json: boolean },
): Promise<RunSessionResult> {
	const id = positionals[0];
	if (!id) throw new Error("usage: fulcrum session restore <id> --checkpoint <ckpt-id>");
	const checkpointId = flags["--checkpoint"];
	if (typeof checkpointId !== "string") throw new Error("--checkpoint required");
	const out = await host.restoreCheckpoint(id, { checkpointId });
	emit(io, "restore", out, opts);
	return { exitCode: 0 };
}

async function runCheckpoints(
	host: SessionCommandHost,
	io: CommandIO,
	positionals: readonly string[],
	opts: { json: boolean },
): Promise<RunSessionResult> {
	const id = positionals[0];
	if (!id) throw new Error("usage: fulcrum session checkpoints <id>");
	const checkpoints = await host.listCheckpoints(id);
	if (opts.json) {
		emit(io, "checkpoints", checkpoints, opts);
	} else {
		if (checkpoints.length === 0) io.stdout.write("(no checkpoints)\n");
		for (const c of checkpoints) {
			io.stdout.write(`${c.id}  ${c.kind}  turn=${c.turnIndex}  ${c.label}\n`);
		}
	}
	return { exitCode: 0 };
}

async function runWatch(
	host: SessionCommandHost,
	io: CommandIO,
	positionals: readonly string[],
	opts: { json: boolean },
): Promise<RunSessionResult> {
	const id = positionals[0];
	if (!id) throw new Error("usage: fulcrum session watch <id>");
	await host.watch(
		id,
		(event) => {
			if (opts.json) {
				io.stdout.write(`${JSON.stringify(event)}\n`);
			} else {
				io.stdout.write(`[${event.type}] ${JSON.stringify(event)}\n`);
			}
		},
		io.signal,
	);
	return { exitCode: 0 };
}

function emit<T>(io: CommandIO, verb: SessionVerb, data: T, opts: { json: boolean }): void {
	if (opts.json) {
		emitResult(
			{
				argv: ["--json"],
				command: `fulcrum session ${verb}`,
				args: { verb },
				result: data,
				renderHuman: () => {},
			},
			{
				print: (line) => io.stdout.write(`${line}\n`),
				printErr: (line) => io.stderr.write(`${line}\n`),
			},
		);
	} else {
		io.stdout.write(`${verb} ok\n${JSON.stringify(data, null, 2)}\n`);
	}
}

function writeError(io: CommandIO, message: string): void {
	io.stderr.write(`${message}\n`);
}

class DataSourceSessionCommandHost implements SessionCommandHost {
	private readonly sessionRepo: AcpSessionRepository;

	constructor(private readonly dataSource: DataSource) {
		this.sessionRepo = new AcpSessionRepository(this.dataSource.getRepository(AcpSession));
	}

	async listSessions(): Promise<SessionSummary[]> {
		const rows = await this.dataSource.getRepository(AcpSession).find({
			order: { updatedAt: "DESC" },
		});
		return rows.map(toSessionSummary);
	}

	async activeSessionId(): Promise<string | null> {
		const active = await this.dataSource.getRepository(AcpSession).findOne({
			where: { status: "active" },
			order: { updatedAt: "DESC" },
		});
		return active?.id ?? null;
	}

	async pause(id: string, reason: string | null): Promise<SessionSummary> {
		await this.requireSession(id);
		await this.sessionRepo.pause(id, reason);
		return this.reloadSummary(id);
	}

	async resume(id: string, opts: { fromCheckpointId?: string | null }): Promise<SessionSummary> {
		await this.requireSession(id);
		if (opts.fromCheckpointId) {
			await this.setCurrentCheckpoint(id, opts.fromCheckpointId);
		} else {
			const latest = await this.latestCheckpoint(id);
			if (latest) await this.setCurrentCheckpoint(id, latest.id);
		}
		await this.sessionRepo.resume(id);
		return this.reloadSummary(id);
	}

	async abort(id: string, opts: { reason: AbortReason; note: string }): Promise<SessionSummary> {
		await this.requireSession(id);
		await this.sessionRepo.abort(id, opts);
		return this.reloadSummary(id);
	}

	async createCheckpoint(id: string, opts: { label?: string | null }): Promise<CheckpointSummary> {
		await this.requireSession(id);
		const count = await this.dataSource.getRepository(AcpSessionCheckpoint).count({
			where: { sessionId: id },
		});
		const checkpoint = await this.sessionRepo.createCheckpoint({
			id: makeCheckpointId(id),
			sessionId: id,
			kind: "message",
			ref: `manual:${id}:${count}`,
			turnIndex: count,
			messageUuid: makeCheckpointId("message"),
			label: opts.label ?? "Manual",
		});
		return toCheckpointSummary(checkpoint);
	}

	async restoreCheckpoint(id: string, opts: { checkpointId: string }): Promise<{ session: SessionSummary; forked: boolean }> {
		const session = await this.requireSession(id);
		const checkpoint = await this.requireCheckpoint(id, opts.checkpointId);
		const current = session.currentCheckpointId
			? await this.dataSource.getRepository(AcpSessionCheckpoint).findOneBy({ id: session.currentCheckpointId })
			: null;
		const forked = current ? checkpoint.createdAt.getTime() < current.createdAt.getTime() : false;
		if (forked) {
			const forkId = makeForkSessionId(id);
			await this.dataSource.getRepository(AcpSession).save({
				...session,
				id: forkId,
				traceId: `${session.traceId}:fork:${checkpoint.id}`.slice(0, 160),
				status: "active",
				currentCheckpointId: checkpoint.id,
				pausedAt: null,
				pausedReason: null,
			});
			return { session: await this.reloadSummary(forkId), forked };
		}
		await this.setCurrentCheckpoint(id, checkpoint.id);
		await this.sessionRepo.resume(id);
		return { session: await this.reloadSummary(id), forked };
	}

	async listCheckpoints(id: string): Promise<CheckpointSummary[]> {
		await this.requireSession(id);
		const rows = await this.dataSource.getRepository(AcpSessionCheckpoint).find({
			where: { sessionId: id },
			order: { createdAt: "DESC" },
		});
		return rows.map(toCheckpointSummary);
	}

	async watch(id: string, sink: (event: SessionEventLine) => void, signal: AbortSignal): Promise<void> {
		let last = "";
		while (!signal.aborted) {
			const session = await this.requireSession(id);
			const summary = toSessionSummary(session);
			const encoded = JSON.stringify(summary);
			if (encoded !== last) {
				last = encoded;
				sink({ type: "acp.session.status", session: summary });
			}
			await sleep(1000, signal);
		}
	}

	async isDaemonHealthy(): Promise<boolean> {
		const home = fulcrumHome();
		const pidfile = join(home, "daemon.pid");
		const socket = join(home, "daemon.sock");
		try {
			await access(socket);
			const pid = Number((await readFile(pidfile, "utf8")).trim());
			if (!Number.isInteger(pid) || pid <= 0) return false;
			process.kill(pid, 0);
			return true;
		} catch {
			return false;
		}
	}

	async spawnDaemon(): Promise<void> {
		const executable = (typeof Bun !== "undefined" ? Bun.which("fulcrumd") : null) ?? "bun";
		const args = executable === "bun" ? ["run", "apps/daemon/src/index.ts"] : [];
		const child = Bun.spawn({
			cmd: [executable, ...args],
			stdout: "ignore",
			stderr: "ignore",
			stdin: "ignore",
			env: process.env,
		});
		child.unref();
	}

	private async requireSession(id: string): Promise<AcpSession> {
		const session = await this.dataSource.getRepository(AcpSession).findOneBy({ id });
		if (!session) throw new Error(`session not found: ${id}`);
		return session;
	}

	private async reloadSummary(id: string): Promise<SessionSummary> {
		return toSessionSummary(await this.requireSession(id));
	}

	private async latestCheckpoint(id: string): Promise<AcpSessionCheckpoint | null> {
		return this.dataSource.getRepository(AcpSessionCheckpoint).findOne({
			where: { sessionId: id },
			order: { createdAt: "DESC" },
		});
	}

	private async requireCheckpoint(sessionId: string, checkpointId: string): Promise<AcpSessionCheckpoint> {
		const checkpoint = await this.dataSource.getRepository(AcpSessionCheckpoint).findOneBy({
			id: checkpointId,
			sessionId,
		});
		if (!checkpoint) throw new Error(`checkpoint not found: ${checkpointId}`);
		return checkpoint;
	}

	private async setCurrentCheckpoint(sessionId: string, checkpointId: string): Promise<void> {
		await this.requireCheckpoint(sessionId, checkpointId);
		await this.dataSource.getRepository(AcpSession).update(sessionId, {
			currentCheckpointId: checkpointId,
		});
	}
}

function toSessionSummary(session: AcpSession): SessionSummary {
	return {
		id: session.id,
		status: session.status,
		mode: session.mode ?? session.modeId ?? null,
		model: session.model ?? session.modelId ?? null,
		pausedAt: session.pausedAt ? session.pausedAt.toISOString() : null,
		pausedReason: session.pausedReason ?? null,
		currentCheckpointId: session.currentCheckpointId ?? null,
	};
}

function toCheckpointSummary(checkpoint: AcpSessionCheckpoint): CheckpointSummary {
	return {
		id: checkpoint.id,
		sessionId: checkpoint.sessionId,
		kind: checkpoint.kind,
		ref: checkpoint.ref,
		turnIndex: checkpoint.turnIndex,
		label: checkpoint.label ?? "",
		createdAt: checkpoint.createdAt.toISOString(),
	};
}

function makeCheckpointId(prefix: string): string {
	return `${prefix.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeForkSessionId(id: string): string {
	return `${id.slice(0, 96)}_fork_${Date.now().toString(36)}`;
}

function fulcrumHome(): string {
	return process.env["FULCRUM_HOME"] ?? join(process.env["HOME"] ?? "", ".fulcrum");
}

async function sleep(ms: number, signal: AbortSignal): Promise<void> {
	await new Promise<void>((resolve) => {
		const timer = setTimeout(resolve, ms);
		if (signal.aborted) {
			clearTimeout(timer);
			resolve();
			return;
		}
		signal.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				resolve();
			},
			{ once: true },
		);
	});
}
