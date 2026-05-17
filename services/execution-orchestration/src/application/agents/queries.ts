/**
 * Agent profiles — migrated from raw LegacyDatabaseHandle to TypeORM EntityManager.
 * ARCH-01/ARCH-02: All DB access via TypeORM connection.
 */

import type { EntityManager } from "typeorm";
import type { LegacyDatabaseHandle } from "@platform-core/application/legacy/web-runtime.ts";
import { randomUUID } from "node:crypto";
import { AgentProfile } from "@execution-orchestration/infrastructure/database/entities/sandbox/AgentProfile.ts";
import { appendEventOrm, ormSqlConnection } from "@platform-core/application/orm-helpers.ts";
import { listProjectOptions, type ProjectOption } from "@work-management/application/projects/queries.ts";
import { listOpenTaskOptions, type TaskOption } from "@work-management/application/tasks/queries.ts";
import type { AppContext } from "@work-management/application/tasks/types.ts";

export interface AgentProfileRow {
  id: string;
  org_id: string;
  name: string;
  cli_path: string;
  default_flags: string;
  auth_env_vars: string[];
  test_passed: boolean | null;
  last_tested_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function listProfiles(
  em: EntityManager,
  orgId: string,
): Promise<AgentProfileRow[]> {
  const conn = ormSqlConnection(em);
  return conn.execute<AgentProfileRow[]>(
    `SELECT id, org_id, name, cli_path, default_flags, auth_env_vars,
            test_passed, last_tested_at, created_at, updated_at
       FROM agent_profiles
      WHERE org_id = $1
      ORDER BY name ASC`,
    [orgId],
  );
}

export interface AgentProfilesPageData {
  profiles: MaskedProfileRow[];
  projects: ProjectOption[];
  tasks: TaskOption[];
}

export async function listAgentProfilesPageData(
  em: EntityManager,
  ctx: AppContext,
): Promise<AgentProfilesPageData> {
  const [profiles, projects, tasks] = await Promise.all([
    listProfiles(em, ctx.orgId).then((rows) => rows.map(maskProfile)),
    listProjectOptions(em, ctx),
    listOpenTaskOptions(em, ctx),
  ]);
  return { profiles, projects, tasks };
}

export async function getProfile(
  db: EntityManager | LegacyDatabaseHandle,
  orgId: string,
  name: string,
): Promise<AgentProfileRow | null> {
  if ("query" in db && typeof db.query === "function" && !("getRepository" in db)) {
    const rows = await db.query<AgentProfileRow>(
      `SELECT id, org_id, name, cli_path, default_flags, auth_env_vars,
              test_passed, last_tested_at, created_at, updated_at
         FROM agent_profiles
        WHERE org_id = $1 AND name = $2
        LIMIT 1`,
      [orgId, name],
    );
    return rows[0] ?? null;
  }
  const profile = await (db as EntityManager).findOne(AgentProfile, {
    org: { id: orgId },
    name,
  } as never);
  return profile ? serializeAgentProfile(profile) : null;
}

export interface AgentProfileRunRow {
  id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
}

export interface AgentProfilePageData {
  profile: MaskedProfileRow;
  runs: AgentProfileRunRow[];
}

export async function getAgentProfilePageData(
  em: EntityManager,
  ctx: AppContext,
  name: string,
): Promise<AgentProfilePageData | null> {
  const profile = await getProfile(em, ctx.orgId, name);
  if (!profile) return null;

  const runs = await ormSqlConnection(em).execute<Array<{
    id: string;
    status: string | null;
    started_at: string | Date;
    ended_at: string | Date | null;
  }>>(
    `SELECT id, status, started_at, NULL::timestamptz AS ended_at
       FROM agent_runs
      WHERE org_id = $1 AND agent_name = $2
      ORDER BY started_at DESC
      LIMIT 20`,
    [ctx.orgId, name],
  );

  return {
    profile: maskProfile(profile),
    runs: runs.map((run) => ({
      id: run.id,
      status: run.status ?? "queued",
      started_at: run.started_at instanceof Date ? run.started_at.toISOString() : run.started_at,
      ended_at: run.ended_at === null ? null : run.ended_at instanceof Date ? run.ended_at.toISOString() : run.ended_at,
    })),
  };
}

export interface UpsertProfileInput {
  name: string;
  cliPath: string;
  defaultFlags: string;
  authEnvVars: string[];
}

export async function upsertProfileAction(
  em: EntityManager,
  orgId: string,
  input: UpsertProfileInput,
): Promise<{ id: string }> {
  const id = randomUUID();
  const rows = await ormSqlConnection(em).execute<Array<{ id: string }>>(
    `INSERT INTO agent_profiles (id, org_id, name, cli_path, default_flags, auth_env_vars)
     VALUES ($1, $2, $3, $4, CAST($5 AS text[]), CAST($6 AS text[]))
     ON CONFLICT (org_id, name)
     DO UPDATE SET
       cli_path = excluded.cli_path,
       default_flags = excluded.default_flags,
       auth_env_vars = excluded.auth_env_vars,
       updated_at = now()
     RETURNING id`,
    [
      id,
      orgId,
      input.name,
      input.cliPath,
      toPostgresTextArray([input.defaultFlags].filter(Boolean)),
      toPostgresTextArray(input.authEnvVars),
    ],
  );
  return { id: String(rows[0]!.id) };
}

function toPostgresTextArray(values: string[]): string {
  return `{${values.map((value) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`).join(",")}}`;
}

export async function testProfileAction(
  em: EntityManager,
  profileId: string,
  orgId: string,
  passed: boolean,
): Promise<{ ok: boolean }> {
  const profile = await em.findOne(AgentProfile, {
    where: { id: profileId, org: { id: orgId } },
  } as never);
  if (profile) {
    profile.testPassed = passed;
    profile.lastTestedAt = new Date();
    profile.updatedAt = new Date();
    await em.save(AgentProfile, profile);
  }

  await appendEventOrm(em, {
    orgId,
    actor: "system",
    subjectKind: "agent_profile",
    subjectId: profileId,
    verb: "tested",
    payload: { test_passed: passed },
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Convenience aliases used by page.server.ts and tests
// ---------------------------------------------------------------------------

export interface UpsertProfileSimpleInput {
  orgId: string;
  name: string;
  cliPath: string;
  defaultFlags?: string;
  /** Key->value map, stored as auth_env_vars JSON array of "KEY=VALUE" strings */
  authEnv?: Record<string, string>;
}

/** Upsert a profile with a simpler input shape (used by tests and CLI helpers). */
export async function upsertProfile(
  em: EntityManager,
  input: UpsertProfileSimpleInput,
): Promise<{ id: string }> {
  const authEnvVars = input.authEnv
    ? Object.entries(input.authEnv).map(([k, v]) => `${k}=${v}`)
    : [];
  return upsertProfileAction(em, input.orgId, {
    name: input.name,
    cliPath: input.cliPath,
    defaultFlags: input.defaultFlags ?? "",
    authEnvVars,
  });
}

// ---------------------------------------------------------------------------
// UI helpers (no DB access)
// ---------------------------------------------------------------------------

export interface MaskedProfileRow {
  id: string;
  name: string;
  cli_path: string;
  capabilities: string[];
  sessions_count: number;
  tested_at: string | null;
  test_passed: boolean | null;
  auth_env: Record<string, string>;
}

/** Mask secret values and reshape a raw profile row for the UI. */
export function maskProfile(row: AgentProfileRow): MaskedProfileRow {
  const auth_env: Record<string, string> = {};
  let rawVars = row.auth_env_vars;
  // PGlite raw SQL may return PostgreSQL text[] as a string like '{KEY=val,KEY2=val2}'
  if (typeof rawVars === "string") {
    const s = (rawVars as string).trim();
    rawVars = s.startsWith("{") && s.endsWith("}")
      ? s.slice(1, -1).split(",").map((v) => v.replace(/^"|"$/g, "").replace(/\\"/g, '"')).filter(Boolean)
      : [];
  }
  // TypeORM simple-array may wrap PG text[] in a single-element array like ['{KEY=val}']
  if (Array.isArray(rawVars) && rawVars.length === 1 && typeof rawVars[0] === "string") {
    const s = (rawVars[0] as string).trim();
    if (s.startsWith("{") && s.endsWith("}")) {
      rawVars = s.slice(1, -1).split(",").map((v) => v.replace(/^"|"$/g, "").replace(/\\"/g, '"')).filter(Boolean);
    }
  }
  const vars: string[] = Array.isArray(rawVars) ? rawVars : [];
  for (const entry of vars) {
    const eq = (entry as string).indexOf("=");
    if (eq === -1) {
      auth_env[entry as string] = "****";
      continue;
    }
    const key = (entry as string).slice(0, eq);
    const val = (entry as string).slice(eq + 1);
    const masked = val.length > 4 ? `****${val.slice(-4)}` : "****";
    auth_env[key] = masked;
  }
  return {
    id: row.id,
    name: row.name,
    cli_path: row.cli_path,
    capabilities: deriveCapabilities(row.name),
    sessions_count: 0,
    tested_at: row.last_tested_at,
    test_passed: row.test_passed,
    auth_env,
  };
}

function deriveCapabilities(name: string): string[] {
  const n = name.toLowerCase();
  const caps: string[] = [];
  if (n.includes("claude") || n.includes("anthropic")) caps.push("LLM", "code");
  if (n.includes("codex") || n.includes("gpt") || n.includes("openai")) caps.push("LLM", "code");
  if (n.includes("gemini")) caps.push("LLM", "multi-modal");
  if (n.includes("search")) caps.push("search");
  if (n.includes("browse")) caps.push("browser");
  if (caps.length === 0) caps.push("general");
  return [...new Set(caps)];
}

function serializeAgentProfile(profile: AgentProfile): AgentProfileRow {
  return {
    id: profile.id,
    org_id: profile.org.id,
    name: profile.name,
    cli_path: profile.cliPath ?? "",
    default_flags: (profile.defaultFlags ?? []).join(" "),
    auth_env_vars: profile.authEnvVars ?? [],
    test_passed: profile.testPassed ?? null,
    last_tested_at: profile.lastTestedAt?.toISOString() ?? null,
    created_at: profile.createdAt.toISOString(),
    updated_at: profile.updatedAt.toISOString(),
  };
}

/**
 * Test a profile by running the CLI with --version (or equivalent).
 * For now, this is a lightweight wrapper that marks a stubbed pass.
 */
export async function testProfile(
  em: EntityManager,
  orgId: string,
  name: string,
): Promise<{ test_passed: boolean }> {
  const profiles = await listProfiles(em, orgId);
  const profile = profiles.find((p) => p.name === name);
  if (!profile) return { test_passed: false };
  const passed = profile.cli_path.length > 0;
  await testProfileAction(em, profile.id, orgId, passed);
  return { test_passed: passed };
}

export function paginateLogs(transcript: string, offset = 0, limit = 100): { lines: string[]; nextOffset: number | null } {
  const lines = transcript.split(/\r?\n/).filter(Boolean);
  const page = lines.slice(offset, offset + limit);
  const nextOffset = offset + page.length < lines.length ? offset + page.length : null;
  return { lines: page, nextOffset };
}

export async function getWorkspaceDiff(): Promise<string | null> {
  return null;
}

export async function listArtifacts(): Promise<unknown[]> {
  return [];
}
