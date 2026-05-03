import type { ProductDb } from "../../../../product-kernel/db/types.ts";
import { newUlid } from "../../../../product-kernel/ids.ts";

export interface AgentProfileRow {
  id: string;
  org_id: string;
  name: string;
  cli_path: string;
  flags: string[];
  auth_env: Record<string, string>;
  test_passed: boolean | null;
  tested_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Mask env var value: show only last 4 chars. */
export function maskEnvValue(value: string): string {
  if (value.length <= 4) return "****";
  return "****" + value.slice(-4);
}

/** Return profile with auth_env values masked. */
export function maskProfile<T extends { auth_env: Record<string, string> }>(
  profile: T,
): T {
  const masked: Record<string, string> = {};
  for (const [k, v] of Object.entries(profile.auth_env)) {
    masked[k] = maskEnvValue(v);
  }
  return { ...profile, auth_env: masked };
}

export async function listProfiles(
  db: ProductDb,
  orgId: string,
): Promise<AgentProfileRow[]> {
  return db.query<AgentProfileRow>(
    `SELECT * FROM agent_profiles WHERE org_id = $1 ORDER BY name ASC`,
    [orgId],
  );
}

export async function getProfile(
  db: ProductDb,
  orgId: string,
  name: string,
): Promise<AgentProfileRow | undefined> {
  const rows = await db.query<AgentProfileRow>(
    `SELECT * FROM agent_profiles WHERE org_id = $1 AND name = $2`,
    [orgId, name],
  );
  return rows[0];
}

export interface UpsertProfileInput {
  orgId: string;
  name: string;
  cliPath: string;
  flags?: string[];
  authEnv?: Record<string, string>;
}

export async function upsertProfile(
  db: ProductDb,
  input: UpsertProfileInput,
): Promise<AgentProfileRow> {
  const flags = JSON.stringify(input.flags ?? []);
  const authEnv = JSON.stringify(input.authEnv ?? {});
  const id = newUlid();
  const rows = await db.query<AgentProfileRow>(
    `INSERT INTO agent_profiles (id, org_id, name, cli_path, flags, auth_env)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
     ON CONFLICT (org_id, name) DO UPDATE SET
       cli_path = EXCLUDED.cli_path,
       flags = EXCLUDED.flags,
       auth_env = EXCLUDED.auth_env,
       updated_at = now()
     RETURNING *`,
    [id, input.orgId, input.name, input.cliPath, flags, authEnv],
  );
  return rows[0]!;
}

export async function testProfile(
  db: ProductDb,
  orgId: string,
  name: string,
): Promise<{ test_passed: boolean }> {
  const profile = await getProfile(db, orgId, name);
  if (!profile) throw new Error(`testProfile: profile not found: ${name}`);

  // Attempt to run the CLI with --version to verify it exists
  let passed = false;
  try {
    const proc = Bun.spawn([profile.cli_path, "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    passed = exitCode === 0;
  } catch {
    passed = false;
  }

  await db.query(
    `UPDATE agent_profiles SET test_passed = $1, tested_at = now(), updated_at = now()
     WHERE org_id = $2 AND name = $3`,
    [passed, orgId, name],
  );

  return { test_passed: passed };
}

// --- Run log pagination ---

export interface RunLogEntry {
  timestamp: string;
  stream: string;
  text: string;
}

export interface PaginatedLogs {
  entries: RunLogEntry[];
  cursor: number | null;
}

/**
 * Parse JSONL transcript and paginate. Each line is expected to be
 * `{"timestamp":"...","stream":"...","text":"..."}`.
 */
export function paginateLogs(
  content: string,
  cursor: number = 0,
  limit: number = 50,
): PaginatedLogs {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const entries: RunLogEntry[] = [];
  const end = Math.min(cursor + limit, lines.length);
  for (let i = cursor; i < end; i++) {
    try {
      const parsed = JSON.parse(lines[i]!) as RunLogEntry;
      entries.push(parsed);
    } catch {
      entries.push({ timestamp: "", stream: "raw", text: lines[i]! });
    }
  }
  const nextCursor = end < lines.length ? end : null;
  return { entries, cursor: nextCursor };
}

// --- Artifacts ---

export interface ArtifactRow {
  id: string;
  kind: string;
  title: string;
  body_path: string | null;
  sha256: string | null;
  size: number | null;
  mime: string | null;
  created_at: string;
}

export async function listArtifacts(
  db: ProductDb,
  orgId: string,
  runId: string,
): Promise<ArtifactRow[]> {
  return db.query<ArtifactRow>(
    `SELECT id, kind, title, body_path, sha256, size, mime, created_at
       FROM artifacts
      WHERE org_id = $1 AND run_id = $2
      ORDER BY created_at ASC, id ASC`,
    [orgId, runId],
  );
}

// --- Workspace diff ---

export async function getWorkspaceDiff(
  db: ProductDb,
  orgId: string,
  runId: string,
): Promise<string | null> {
  const rows = await db.query<{ diff_path: string | null }>(
    `SELECT diff_path FROM agent_runs WHERE id = $1 AND org_id = $2`,
    [runId, orgId],
  );
  const diffPath = rows[0]?.diff_path;
  if (!diffPath) return null;

  const fs = await import("node:fs/promises");
  try {
    return await fs.readFile(diffPath, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw err;
  }
}
