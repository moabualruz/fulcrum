/**
 * Gated git write operations: commit, push, openPR.
 * All ops require FULCRUM_FEATURES=repo-write-ops to be set.
 * Uses raw `git` CLI via Bun.spawn — no external dependency.
 */

import { assertFeatureEnabled } from "./feature-gate.ts";
import type { ProductDb } from "./db/types.ts";
import { enqueueJob } from "./jobs.ts";

const FEATURE = "repo-write-ops";

export interface CommitInput {
  repoId: string;
  rootPath: string;
  message: string;
  files: string[];
  orgId: string;
}

export interface CommitResult {
  sha: string;
}

export interface PushInput {
  repoId: string;
  rootPath: string;
  branch: string;
  force?: boolean;
}

export interface PushResult {
  ok: true;
}

export interface OpenPRInput {
  repoId: string;
  rootPath: string;
  title: string;
  body?: string;
  head: string;
  base?: string;
}

export interface OpenPRResult {
  url: string;
  number: number;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`git ${args[0]} failed (exit ${code}): ${stderr.trim()}`);
  }
  return stdout.trim();
}

/**
 * Stage files, commit, return new SHA.
 * Triggers repo.sync.local job immediately (no debounce).
 */
export async function gitCommit(
  db: ProductDb,
  input: CommitInput,
): Promise<CommitResult> {
  assertFeatureEnabled(FEATURE);

  if (input.files.length === 0) {
    throw new Error("files[] must not be empty");
  }

  // Stage specified files
  await git(input.rootPath, ["add", "--", ...input.files]);

  // Commit
  await git(input.rootPath, ["commit", "-m", input.message]);

  // Get new HEAD SHA
  const sha = await git(input.rootPath, ["rev-parse", "HEAD"]);

  // Trigger immediate repo.sync.local job
  await enqueueJob(db, {
    orgId: input.orgId,
    queue: "repo.sync",
    kind: "repo.sync.local",
    payload: { repoId: input.repoId },
  });

  return { sha };
}

/**
 * Push branch to remote. Updates last_touched_at on repos row.
 */
export async function gitPush(
  db: ProductDb,
  input: PushInput,
): Promise<PushResult> {
  assertFeatureEnabled(FEATURE);

  const args = ["push", "origin", input.branch];
  if (input.force) args.splice(1, 0, "--force");

  await git(input.rootPath, args);

  // Update last_touched_at
  await db.query(
    `UPDATE repos SET last_seen_at = now() WHERE id = $1`,
    [input.repoId],
  );

  return { ok: true };
}

/**
 * Open a PR via `gh` CLI. Requires gh to be installed and authenticated.
 */
export async function gitOpenPR(
  input: OpenPRInput,
): Promise<OpenPRResult> {
  assertFeatureEnabled(FEATURE);

  const args = [
    "pr", "create",
    "--title", input.title,
    "--head", input.head,
  ];
  if (input.base) args.push("--base", input.base);
  if (input.body) args.push("--body", input.body);

  // Check if gh is available
  const whichProc = Bun.spawn(["which", "gh"], { stdout: "pipe", stderr: "pipe" });
  const whichCode = await whichProc.exited;
  if (whichCode !== 0) {
    throw new Error(
      "gh CLI not found. Install it (https://cli.github.com/) and authenticate with `gh auth login`.",
    );
  }

  const proc = Bun.spawn(["gh", ...args], {
    cwd: input.rootPath,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`gh pr create failed (exit ${code}): ${stderr.trim()}`);
  }

  // gh pr create outputs the PR URL
  const url = stdout.trim();
  // Extract PR number from URL (https://github.com/owner/repo/pull/123)
  const match = url.match(/\/pull\/(\d+)/);
  const number = match?.[1] ? parseInt(match[1], 10) : 0;

  return { url, number };
}
