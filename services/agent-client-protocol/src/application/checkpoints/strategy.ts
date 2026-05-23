import type {
	CheckpointKind,
	CheckpointSnapshotPayload,
	CheckpointTriggerContext,
} from "./types.ts";

export interface CheckpointStrategy {
	readonly kind: CheckpointKind;
	snapshot(ctx: CheckpointTriggerContext): Promise<CheckpointSnapshotPayload>;
	restore(ref: string, ctx: CheckpointTriggerContext): Promise<void>;
}

/**
 * Filesystem / process surface a strategy needs. Pulled behind an
 * interface so tests can inject fakes without touching the real
 * working tree.
 */
export interface CheckpointEnvironment {
	exec(cmd: string, args: readonly string[], opts?: { cwd?: string }): Promise<{
		stdout: string;
		stderr: string;
		exitCode: number;
	}>;
	mkdir(dir: string): Promise<void>;
	copyFile(source: string, target: string): Promise<void>;
	writeJson(path: string, payload: unknown): Promise<void>;
	readJson(path: string): Promise<unknown>;
	listTracked(cwd: string): Promise<string[]>;
}
