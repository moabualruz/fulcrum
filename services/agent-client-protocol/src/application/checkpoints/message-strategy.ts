import { join } from "node:path";

import type { CheckpointEnvironment, CheckpointStrategy } from "./strategy.ts";
import type { CheckpointSnapshotPayload, CheckpointTriggerContext } from "./types.ts";

/**
 * MessageCheckpointStrategy persists an ACP `session/load`-compatible
 * snapshot of the running message history. The snapshot is small (JSON),
 * so we keep the full payload at
 * `<root>/sessions/<sessionId>/messages/<turnIndex>.json`.
 */
export class MessageCheckpointStrategy implements CheckpointStrategy {
	readonly kind = "message" as const;

	constructor(
		private readonly env: CheckpointEnvironment,
		private readonly root: string,
		private readonly loadHistory: (sessionId: string) => Promise<unknown>,
	) {}

	private snapshotPath(sessionId: string, turnIndex: number): string {
		return join(this.root, "sessions", sessionId, "messages", `${turnIndex}.json`);
	}

	async snapshot(ctx: CheckpointTriggerContext): Promise<CheckpointSnapshotPayload> {
		const path = this.snapshotPath(ctx.sessionId, ctx.turnIndex);
		await this.env.mkdir(dirOf(path));
		const history = await this.loadHistory(ctx.sessionId);
		await this.env.writeJson(path, {
			sessionId: ctx.sessionId,
			turnIndex: ctx.turnIndex,
			messageUuid: ctx.messageUuid,
			history,
		});
		return { kind: this.kind, ref: path };
	}

	async restore(_ref: string, _ctx: CheckpointTriggerContext): Promise<void> {
		// Restore is consumed by the ACP load flow; the engine surfaces the
		// stored payload via readSnapshot rather than mutating the working
		// session in place.
	}

	async readSnapshot(ref: string): Promise<unknown> {
		return this.env.readJson(ref);
	}
}

function dirOf(path: string): string {
	const i = path.lastIndexOf("/");
	return i < 0 ? "." : path.slice(0, i);
}
