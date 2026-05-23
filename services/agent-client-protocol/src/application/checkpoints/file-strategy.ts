import { join } from "node:path";

import type { CheckpointEnvironment, CheckpointStrategy } from "./strategy.ts";
import type { CheckpointSnapshotPayload, CheckpointTriggerContext } from "./types.ts";

/**
 * FileCheckpointStrategy copies tracked-by-session files into
 * `<root>/sessions/<sessionId>/files/<turnIndex>/`. Use when the cwd is
 * not a git repo or when the operator explicitly chose `file` mode.
 *
 * `root` defaults to `~/.fulcrum` but can be overridden for tests.
 */
export class FileCheckpointStrategy implements CheckpointStrategy {
	readonly kind = "file" as const;

	constructor(
		private readonly env: CheckpointEnvironment,
		private readonly root: string,
	) {}

	private snapshotDir(sessionId: string, turnIndex: number): string {
		return join(this.root, "sessions", sessionId, "files", String(turnIndex));
	}

	async snapshot(ctx: CheckpointTriggerContext): Promise<CheckpointSnapshotPayload> {
		if (!ctx.cwd) throw new Error("FileCheckpointStrategy requires a working directory");
		const dir = this.snapshotDir(ctx.sessionId, ctx.turnIndex);
		await this.env.mkdir(dir);
		const tracked = await this.env.listTracked(ctx.cwd);
		for (const rel of tracked) {
			const source = join(ctx.cwd, rel);
			const target = join(dir, rel);
			await this.env.mkdir(dirOf(target));
			await this.env.copyFile(source, target);
		}
		return { kind: this.kind, ref: dir };
	}

	async restore(ref: string, ctx: CheckpointTriggerContext): Promise<void> {
		if (!ctx.cwd) throw new Error("FileCheckpointStrategy requires a working directory");
		const tracked = await this.env.listTracked(ref);
		for (const rel of tracked) {
			const source = join(ref, rel);
			const target = join(ctx.cwd, rel);
			await this.env.mkdir(dirOf(target));
			await this.env.copyFile(source, target);
		}
	}
}

function dirOf(path: string): string {
	const i = path.lastIndexOf("/");
	return i < 0 ? "." : path.slice(0, i);
}
