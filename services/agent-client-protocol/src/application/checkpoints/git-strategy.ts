import type { CheckpointEnvironment, CheckpointStrategy } from "./strategy.ts";
import type { CheckpointSnapshotPayload, CheckpointTriggerContext } from "./types.ts";

const CHECKPOINT_REF_NAMESPACE = "refs/fulcrum/checkpoints";

/**
 * GitCheckpointStrategy materialises an orphan commit holding the current
 * working tree, then stores its sha under
 * `refs/fulcrum/checkpoints/<session>/<turn>`. Restore = git reset --hard
 * to the recorded ref. Avoids interaction with HEAD or the index.
 */
export class GitCheckpointStrategy implements CheckpointStrategy {
	readonly kind = "git" as const;

	constructor(private readonly env: CheckpointEnvironment) {}

	private refName(sessionId: string, turnIndex: number): string {
		return `${CHECKPOINT_REF_NAMESPACE}/${sessionId}/${turnIndex}`;
	}

	private async run(cwd: string, args: readonly string[]): Promise<string> {
		const result = await this.env.exec("git", args, { cwd });
		if (result.exitCode !== 0) {
			throw new Error(
				`git ${args.join(" ")} failed (exit ${result.exitCode}): ${result.stderr.trim()}`,
			);
		}
		return result.stdout.trim();
	}

	async snapshot(ctx: CheckpointTriggerContext): Promise<CheckpointSnapshotPayload> {
		if (!ctx.cwd) throw new Error("GitCheckpointStrategy requires a working directory");
		const ref = this.refName(ctx.sessionId, ctx.turnIndex);
		await this.run(ctx.cwd, ["add", "-A"]);
		const treeSha = await this.run(ctx.cwd, ["write-tree"]);
		const commitSha = await this.run(ctx.cwd, [
			"commit-tree",
			treeSha,
			"-m",
			`fulcrum checkpoint session=${ctx.sessionId} turn=${ctx.turnIndex}`,
		]);
		await this.run(ctx.cwd, ["update-ref", ref, commitSha]);
		return { kind: this.kind, ref };
	}

	async restore(ref: string, ctx: CheckpointTriggerContext): Promise<void> {
		if (!ctx.cwd) throw new Error("GitCheckpointStrategy requires a working directory");
		const sha = await this.run(ctx.cwd, ["rev-parse", ref]);
		await this.run(ctx.cwd, ["read-tree", sha]);
		await this.run(ctx.cwd, ["checkout-index", "-a", "-f"]);
	}
}

export async function detectGitWorkingTree(
	env: CheckpointEnvironment,
	cwd: string | null,
): Promise<boolean> {
	if (!cwd) return false;
	const result = await env.exec("git", ["rev-parse", "--show-toplevel"], { cwd });
	return result.exitCode === 0 && result.stdout.trim().length > 0;
}
