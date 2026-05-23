import { detectGitWorkingTree } from "./git-strategy.ts";
import type { CheckpointEnvironment, CheckpointStrategy } from "./strategy.ts";
import {
	type CheckpointKind,
	type CheckpointModeInputs,
	type CheckpointModeOverride,
	type CheckpointRecord,
	type CheckpointRetentionConfig,
	type CheckpointTriggerContext,
	type CheckpointTriggerReason,
	DEFAULT_RETENTION,
	type ResolvedCheckpointMode,
} from "./types.ts";
import { resolveCheckpointMode } from "./mode-resolution.ts";

export type CheckpointEvent =
	| { type: "acp.session.checkpointed"; checkpointId: string; kind: CheckpointKind; turnIndex: number; sessionId: string }
	| { type: "acp.session.restored"; checkpointId: string; sessionId: string }
	| { type: "acp.session.forked"; checkpointId: string; sessionId: string; forkedSessionId: string };

export type CheckpointEventSink = (event: CheckpointEvent) => void | Promise<void>;

/**
 * Bridge between the engine and the existing AcpSessionRepository. We
 * keep the dependency narrow so unit tests can supply a fake without
 * spinning up TypeORM.
 */
export interface CheckpointPersistence {
	createCheckpoint(input: {
		id: string;
		sessionId: string;
		kind: CheckpointKind;
		ref: string;
		turnIndex: number;
		messageUuid: string;
		label?: string | null;
	}): Promise<CheckpointRecord>;
	listCheckpoints(sessionId: string): Promise<CheckpointRecord[]>;
	deleteCheckpoint(checkpointId: string): Promise<void>;
	loadCheckpoint(checkpointId: string): Promise<CheckpointRecord | null>;
}

export interface EngineHistoryAccess {
	/** Returns a serialised snapshot of the session message history. */
	getHistory(sessionId: string): Promise<unknown>;
	/** Forks a session at the recorded turn index, returning the new session id. */
	forkSession(sessionId: string, checkpoint: CheckpointRecord): Promise<string>;
}

export interface CheckpointEngineOptions {
	strategies: Record<CheckpointKind, CheckpointStrategy>;
	persistence: CheckpointPersistence;
	env: CheckpointEnvironment;
	history: EngineHistoryAccess;
	emit: CheckpointEventSink;
	now?: () => Date;
	createId?: () => string;
	retention?: CheckpointRetentionConfig;
}

export class CheckpointEngine {
	private readonly retention: CheckpointRetentionConfig;
	private readonly now: () => Date;
	private readonly createId: () => string;

	constructor(private readonly opts: CheckpointEngineOptions) {
		this.retention = opts.retention ?? DEFAULT_RETENTION;
		this.now = opts.now ?? (() => new Date());
		this.createId = opts.createId ?? defaultCreateId;
	}

	async resolveMode(inputs: CheckpointModeInputs): Promise<ResolvedCheckpointMode> {
		return resolveCheckpointMode(inputs);
	}

	async resolveAuto(cwd: string | null): Promise<CheckpointKind> {
		if (await detectGitWorkingTree(this.opts.env, cwd)) return "git";
		return "file";
	}

	async capture(
		ctx: CheckpointTriggerContext,
		reason: CheckpointTriggerReason,
		mode: CheckpointModeOverride,
	): Promise<CheckpointRecord> {
		const kind: CheckpointKind = mode === "auto" ? await this.resolveAuto(ctx.cwd) : mode;
		const strategy = this.opts.strategies[kind];
		if (!strategy) throw new Error(`No checkpoint strategy registered for kind '${kind}'`);
		const payload = await strategy.snapshot(ctx);
		const label = (ctx.label && ctx.label.trim()) || defaultLabel(reason, this.now());
		const record = await this.opts.persistence.createCheckpoint({
			id: this.createId(),
			sessionId: ctx.sessionId,
			kind: payload.kind,
			ref: payload.ref,
			turnIndex: ctx.turnIndex,
			messageUuid: ctx.messageUuid,
			label,
		});
		await this.opts.emit({
			type: "acp.session.checkpointed",
			checkpointId: record.id,
			kind: record.kind,
			turnIndex: record.turnIndex,
			sessionId: record.sessionId,
		});
		await this.runRetentionGc(ctx.sessionId);
		return record;
	}

	async restore(checkpointId: string, cwd: string | null): Promise<CheckpointRecord> {
		const record = await this.opts.persistence.loadCheckpoint(checkpointId);
		if (!record) throw new Error(`Checkpoint '${checkpointId}' not found`);
		const strategy = this.opts.strategies[record.kind];
		if (!strategy) throw new Error(`No checkpoint strategy registered for kind '${record.kind}'`);
		await strategy.restore(record.ref, {
			sessionId: record.sessionId,
			cwd,
			turnIndex: record.turnIndex,
			messageUuid: record.messageUuid,
		});
		await this.opts.emit({
			type: "acp.session.restored",
			checkpointId: record.id,
			sessionId: record.sessionId,
		});
		return record;
	}

	async fork(checkpointId: string): Promise<{ forkedSessionId: string; checkpoint: CheckpointRecord }> {
		const record = await this.opts.persistence.loadCheckpoint(checkpointId);
		if (!record) throw new Error(`Checkpoint '${checkpointId}' not found`);
		const forkedSessionId = await this.opts.history.forkSession(record.sessionId, record);
		await this.opts.emit({
			type: "acp.session.forked",
			checkpointId: record.id,
			sessionId: record.sessionId,
			forkedSessionId,
		});
		return { forkedSessionId, checkpoint: record };
	}

	async runRetentionGc(sessionId: string): Promise<number> {
		const records = await this.opts.persistence.listCheckpoints(sessionId);
		const sorted = [...records].sort(
			(a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
		);
		const cutoff = this.now().getTime() - this.retention.maxAgeDays * 86_400_000;
		const survivors: CheckpointRecord[] = [];
		const trash: CheckpointRecord[] = [];
		for (const record of sorted) {
			const tooOld = record.createdAt.getTime() < cutoff;
			const overflow = survivors.length >= this.retention.maxCount;
			if (tooOld || overflow) trash.push(record);
			else survivors.push(record);
		}
		for (const record of trash) {
			await this.opts.persistence.deleteCheckpoint(record.id);
		}
		return trash.length;
	}
}

function defaultLabel(reason: CheckpointTriggerReason, when: Date): string {
	if (reason === "explicit-save") return `Manual save at ${when.toISOString()}`;
	if (reason === "pause") return `Paused at ${when.toISOString()}`;
	return `Turn complete at ${when.toISOString()}`;
}

function defaultCreateId(): string {
	const random = Math.random().toString(16).slice(2, 10);
	const stamp = Date.now().toString(36);
	return `cp_${stamp}_${random}`;
}
