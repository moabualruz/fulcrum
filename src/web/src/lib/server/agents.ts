import type { ProductDb } from "../../../../product-kernel/db/types.ts";
import { eventDispatcher } from "../../../../product-kernel/event-dispatcher.ts";
import { newUlid } from "../../../../product-kernel/ids.ts";

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
  db: ProductDb,
  orgId: string,
): Promise<AgentProfileRow[]> {
  return db.query<AgentProfileRow>(
    `SELECT id, org_id, name, cli_path, default_flags, auth_env_vars,
            test_passed, last_tested_at, created_at, updated_at
       FROM agent_profiles
      WHERE org_id = $1
      ORDER BY name ASC`,
    [orgId],
  );
}

export interface UpsertProfileInput {
  name: string;
  cliPath: string;
  defaultFlags: string;
  authEnvVars: string[];
}

export async function upsertProfileAction(
  db: ProductDb,
  orgId: string,
  input: UpsertProfileInput,
): Promise<{ id: string }> {
  const id = newUlid();
  const rows = await db.query<{ id: string }>(
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
  db: ProductDb,
  profileId: string,
  orgId: string,
  passed: boolean,
): Promise<{ ok: boolean }> {
  await db.query(
    `UPDATE agent_profiles
        SET test_passed = $1, last_tested_at = now(), updated_at = now()
      WHERE id = $2 AND org_id = $3`,
    [passed, profileId, orgId],
  );

  await eventDispatcher.dispatch(db, {
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
  /** Key→value map, stored as auth_env_vars JSON array of "KEY=VALUE" strings */
  authEnv?: Record<string, string>;
}

/** Upsert a profile with a simpler input shape (used by tests and CLI helpers). */
export async function upsertProfile(
  db: ProductDb,
  input: UpsertProfileSimpleInput,
): Promise<{ id: string }> {
  const authEnvVars = input.authEnv
    ? Object.entries(input.authEnv).map(([k, v]) => `${k}=${v}`)
    : [];
  return upsertProfileAction(db, input.orgId, {
    name: input.name,
    cliPath: input.cliPath,
    defaultFlags: input.defaultFlags ?? "",
    authEnvVars,
  });
}

export interface MaskedProfileRow {
  id: string;
  name: string;
  cli_path: string;
  capabilities: string[];
  sessions_count: number;
  tested_at: string | null;
  test_passed: boolean | null;
  /** Key→masked-value map, e.g. { ANTHROPIC_API_KEY: "****1234" } */
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
    // Show last 4 chars of the value
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

/**
 * Infer capability chips from the agent name.
 * Extend as needed when new agent types are registered.
 */
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
  db: ProductDb,
  orgId: string,
  name: string,
): Promise<{ test_passed: boolean }> {
  const profiles = await listProfiles(db, orgId);
  const profile = profiles.find((p) => p.name === name);
  if (!profile) return { test_passed: false };
  // Real implementation would shell out; for now mark pass
  const passed = profile.cli_path.length > 0;
  await testProfileAction(db, profile.id, orgId, passed);
  return { test_passed: passed };
}
