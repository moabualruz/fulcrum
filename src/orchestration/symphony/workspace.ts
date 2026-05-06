/**
 * Symphony workspace lifecycle.
 *
 * SPEC naming invariant: workspace keys contain only [A-Za-z0-9._-].
 */

import { existsSync, realpathSync } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { EntityManager } from "@mikro-orm/postgresql";
import type { AgentRun as AgentRunType } from "../../db/entities/orchestration/AgentRun.ts";

import { Org } from "../../db/entities/auth/Org.ts";
import type { AgentRun } from "../../db/entities/orchestration/AgentRun.ts";
import {
  GetWorkspacePathInputSchema,
  WorkspacePathSchema,
  type WorkspacePath,
} from "./schemas.ts";

export { GetWorkspacePathInputSchema, WorkspacePathSchema } from "./schemas.ts";
export type { WorkspacePath } from "./schemas.ts";

const MAX_WORKSPACE_KEY_LENGTH = 128;
const MAX_WORKSPACE_KEY_COLLISION_ATTEMPTS = 1_000;
const WORKSPACE_SAFE_CHARS = /[^A-Za-z0-9._-]/g;
const TERMINAL_FAILURE_STATES = new Set([
  "failed",
  "timed_out",
  "stalled",
  "cancelled",
]);

const TERMINAL_ORCHESTRATION_STATES = new Set([
  "released",
  "succeeded",
  "failed",
  "timed_out",
  "stalled",
  "cancelled",
]);

export interface SanitizeWorkspaceKeyOptions {
  existingKeys?: ReadonlySet<string>;
}

export interface CreateWorkspaceOptions {
  em?: EntityManager;
  root?: string;
}

export interface DestroyWorkspaceOptions {
  em?: EntityManager;
  root?: string;
  keepOnFailure?: boolean;
}

export function sanitizeWorkspaceKey(
  title: string,
  taskId: string,
  opts: SanitizeWorkspaceKeyOptions = {},
): string {
  const fallback = taskId.slice(0, 8) || "workspace";
  const base = (title.replace(WORKSPACE_SAFE_CHARS, "_") || fallback).slice(
    0,
    MAX_WORKSPACE_KEY_LENGTH,
  );

  const existingKeys = opts.existingKeys;
  if (!existingKeys?.has(base)) return base;

  for (let attempt = 1; attempt <= MAX_WORKSPACE_KEY_COLLISION_ATTEMPTS; attempt += 1) {
    const suffix = attempt === 1 ? `_${fallback}` : `_${fallback}_${attempt}`;
    const key = `${base.slice(0, MAX_WORKSPACE_KEY_LENGTH - suffix.length)}${suffix}`;
    if (!existingKeys.has(key)) return key;
  }

  throw new Error(
    `Unable to allocate unique workspace key after ${MAX_WORKSPACE_KEY_COLLISION_ATTEMPTS} attempts`,
  );
}

export async function createWorkspace(
  run: AgentRun,
  opts: CreateWorkspaceOptions = {},
): Promise<string> {
  if (run.workspacePath) {
    assertWorkspacePathInOrgRoot(run.workspacePath, run.org.id, opts.root);
    await mkdir(run.workspacePath, { recursive: true });
    return run.workspacePath;
  }

  const orgId = run.org.id;
  const taskId = run.task?.id ?? run.id;
  const orgRoot = join(workspaceRoot(opts.root), orgId);
  const existingKeys = await readExistingWorkspaceKeys(orgRoot);
  const key = sanitizeWorkspaceKey(workspaceTitle(run), taskId, {
    existingKeys,
  });
  const workspacePath = join(orgRoot, key);

  assertWorkspacePathInOrgRoot(workspacePath, orgId, opts.root);
  await mkdir(workspacePath, { recursive: true });
  run.workspacePath = workspacePath;

  if (opts.em) {
    const fork = opts.em.fork();
    const managedRun = await findManagedRun(fork, run.id);
    managedRun.workspacePath = workspacePath;
    await fork.flush();
  }

  return workspacePath;
}

export async function destroyWorkspace(
  run: AgentRun,
  opts: DestroyWorkspaceOptions = {},
): Promise<void> {
  const workspacePath = run.workspacePath;
  if (!workspacePath) return;
  assertWorkspacePathInOrgRoot(workspacePath, run.org.id, opts.root);

  if (opts.keepOnFailure === true && isFailedRun(run)) {
    if (opts.em) {
      const fork = opts.em.fork();
      const managedRun = await findManagedRun(fork, run.id);
      managedRun.workspacePath = workspacePath;
      await fork.flush();
    }
    return;
  }

  await rm(workspacePath, { recursive: true, force: true });
  run.workspacePath = undefined;

  if (opts.em) {
    const fork = opts.em.fork();
    const managedRun = await findManagedRun(fork, run.id);
    managedRun.workspacePath = undefined;
    await fork.flush();
  }
}

export function assertWorkspacePathInOrgRoot(
  workspacePath: string,
  orgId: string,
  root?: string,
): void {
  const orgRoot = realpathIfExists(resolve(workspaceRoot(root), orgId));
  const target = realpathIfExists(resolve(workspacePath));
  const relativeTarget = relative(orgRoot, target);

  if (relativeTarget !== "" && !relativeTarget.startsWith("..") && !isAbsolute(relativeTarget)) {
    return;
  }

  throw new Error(`Workspace path outside org root: ${workspacePath}`);
}

export async function getWorkspacePath(
  em: EntityManager,
  orgId: string,
  runId: string,
): Promise<WorkspacePath> {
  const input = GetWorkspacePathInputSchema.parse({ orgId, runId });
  const { AgentRun } = await import(
    "../../db/entities/orchestration/AgentRun.ts"
  );
  const fork = em.fork();
  const org = fork.getReference(Org, input.orgId);
  const run = await fork.findOneOrFail(AgentRun, {
    id: input.runId,
    org,
  }, {
    fields: ["id", "workspacePath"],
  });

  return WorkspacePathSchema.parse({
    runId: run.id,
    workspacePath: run.workspacePath ?? null,
  });
}

export function workspaceRoot(root = process.env["FULCRUM_WORKSPACE_ROOT"]): string {
  return root && root.length > 0 ? root : join(homedir(), ".fulcrum", "workspaces");
}

// ---------------------------------------------------------------------------
// Startup cleanup sweep (SYM-18)
// ---------------------------------------------------------------------------

export interface SweepOptions {
  root?: string;
  /** Called before each workspace removal (e.g. before_remove hook). */
  beforeRemove?: (run: AgentRunType) => Promise<void>;
  /** When true, logs what would be removed but does not delete. */
  dryRun?: boolean;
}

/**
 * sweepTerminalWorkspaces — startup cleanup sweep (SYM-18).
 *
 * Scans all AgentRun records for the given org that:
 * 1. Are in a terminal orchestration state (released, succeeded, failed,
 *    timed_out, stalled, cancelled)
 * 2. Have a non-null workspacePath
 *
 * For each such run, calls `beforeRemove` hook (if provided) and then
 * removes the workspace directory (unless dryRun=true).
 *
 * Returns the count of workspaces swept.
 */
export async function sweepTerminalWorkspaces(
  em: EntityManager,
  orgId: string,
  opts: SweepOptions = {},
): Promise<number> {
  const { AgentRun } = await import(
    "../../db/entities/orchestration/AgentRun.ts"
  );
  const fork = em.fork();

  const terminalRuns = await fork.find(AgentRun, {
    org: orgId,
    orchestrationState: { $in: [...TERMINAL_ORCHESTRATION_STATES] },
    workspacePath: { $ne: null },
  } as never) as AgentRunType[];

  let swept = 0;

  for (const run of terminalRuns) {
    const workspacePath = run.workspacePath;
    if (!workspacePath) continue;
    assertWorkspacePathInOrgRoot(workspacePath, orgId, opts.root);

    if (opts.beforeRemove) {
      await opts.beforeRemove(run);
    }

    if (!opts.dryRun) {
      try {
        await rm(workspacePath, { recursive: true, force: true });
        const managed = await findManagedRun(fork, run.id);
        managed.workspacePath = undefined;
        await fork.flush();
      } catch {
        // Non-fatal: log and continue sweep
        console.error(`sweepTerminalWorkspaces: failed to remove ${workspacePath}`);
      }
    }

    swept += 1;
  }

  return swept;
}

async function readExistingWorkspaceKeys(orgRoot: string): Promise<Set<string>> {
  try {
    const entries = await readdir(orgRoot, { withFileTypes: true });
    return new Set(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Set();
    throw error;
  }
}

function workspaceTitle(run: AgentRun): string {
  return run.task?.id ?? run.id;
}

function isFailedRun(run: AgentRun): boolean {
  return TERMINAL_FAILURE_STATES.has(run.orchestrationState ?? "");
}

async function findManagedRun(em: EntityManager, runId: string): Promise<AgentRun> {
  const { AgentRun } = await import(
    "../../db/entities/orchestration/AgentRun.ts"
  );
  return em.findOneOrFail(AgentRun, runId);
}

function realpathIfExists(path: string): string {
  return existsSync(path) ? realpathSync.native(path) : path;
}
