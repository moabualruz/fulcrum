/**
 * Agent profiles — migrated from raw LegacyDatabaseHandle to MikroORM EntityManager.
 * ARCH-01/ARCH-02: All DB access via MikroORM EM connection.
 */

import type { EntityManager } from "@mikro-orm/postgresql";
import type { LegacyDatabaseHandle } from "../legacy/web-runtime.ts";
import { randomUUID } from "node:crypto";
import { appendEventOrm, ormSqlConnection } from "../orm-helpers.ts";

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

export async function getProfile(
  db: EntityManager | LegacyDatabaseHandle,
  orgId: string,
  name: string,
): Promise<AgentProfileRow | null> {
  if ("query" in db && typeof db.query === "function") {
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
  const rows = await ormSqlConnection(db as EntityManager).execute<AgentProfileRow[]>(
    `SELECT id, org_id, name, cli_path, default_flags, auth_env_vars,
            test_passed, last_tested_at, created_at, updated_at
       FROM agent_profiles
      WHERE org_id = $1 AND name = $2
      LIMIT 1`,
    [orgId, name],
  );
  return rows[0] ?? null;
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
  const conn = ormSqlConnection(em);
  const rows = await conn.execute<{ id: string }[]>(
    `INSERT INTO agent_profiles (id, org_id, name, cli_path, default_flags, auth_env_vars)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (org_id, name) DO UPDATE
       SET cli_path = EXCLUDED.cli_path,
           default_flags = EXCLUDED.default_flags,
           auth_env_vars = EXCLUDED.auth_env_vars,
           updated_at = now()
     RETURNING id`,
    [id, orgId, input.name, input.cliPath, input.defaultFlags, JSON.stringify(input.authEnvVars)],
  );
  return { id: rows[0]!.id };
}

export async function testProfileAction(
  em: EntityManager,
  profileId: string,
  orgId: string,
  passed: boolean,
): Promise<{ ok: boolean }> {
  const conn = ormSqlConnection(em);
  await conn.execute(
    `UPDATE agent_profiles
        SET test_passed = $1, last_tested_at = now(), updated_at = now()
      WHERE id = $2 AND org_id = $3`,
    [passed, profileId, orgId],
  );

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
  const vars: string[] = Array.isArray(row.auth_env_vars) ? row.auth_env_vars : [];
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
