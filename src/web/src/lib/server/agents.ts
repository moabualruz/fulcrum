import type { ProductDb } from "../../../../product-kernel/db/types.ts";
import { appendEvent } from "../../../../product-kernel/store/repositories.ts";
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

  await appendEvent(db, {
    orgId,
    actor: "system",
    subjectKind: "agent_profile",
    subjectId: profileId,
    verb: "tested",
    payload: { test_passed: passed },
  });

  return { ok: true };
}
