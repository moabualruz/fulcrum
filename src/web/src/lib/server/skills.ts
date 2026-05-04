import type { ProductDb } from "@fulcrum/product-kernel/db/types.ts";
import { newUlid } from "@fulcrum/product-kernel/ids.ts";

export interface SkillRow {
  id: string;
  org_id: string;
  slug: string;
  version: string;
  source: "local" | "upstream";
  upstream_repo: string | null;
  content_hash: string | null;
  enabled_agents: string[];
  upstream_conflict: UpstreamConflict | null;
  installed_at: string;
  updated_at: string;
}

export interface UpstreamConflict {
  local_content: string;
  upstream_content: string;
}

export interface InstallSkillInput {
  orgId: string;
  slug: string;
  upstreamRepo?: string;
}

export interface ResolveConflictInput {
  orgId: string;
  slug: string;
  resolution: "keep_local" | "use_upstream";
}

interface RawSkillRow {
  id: string;
  org_id: string;
  slug: string;
  version: string;
  source: string;
  upstream_repo: string | null;
  content_hash: string | null;
  enabled_agents: string | string[];
  upstream_conflict: string | UpstreamConflict | null;
  installed_at: string | Date;
  updated_at: string | Date;
}

function isoStamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function parseJson<T>(value: string | T | null): T | null {
  if (value === null) return null;
  if (typeof value === "string") return JSON.parse(value) as T;
  return value;
}

function normalise(row: RawSkillRow): SkillRow {
  return {
    id: row.id,
    org_id: row.org_id,
    slug: row.slug,
    version: row.version,
    source: row.source as "local" | "upstream",
    upstream_repo: row.upstream_repo,
    content_hash: row.content_hash,
    enabled_agents: (parseJson<string[]>(row.enabled_agents as string | string[]) ?? []),
    upstream_conflict: parseJson<UpstreamConflict>(row.upstream_conflict as string | UpstreamConflict | null),
    installed_at: isoStamp(row.installed_at),
    updated_at: isoStamp(row.updated_at),
  };
}

export async function listSkills(db: ProductDb, orgId: string): Promise<SkillRow[]> {
  const rows = await db.query<RawSkillRow>(
    `SELECT * FROM skills WHERE org_id = $1 ORDER BY slug ASC`,
    [orgId],
  );
  return rows.map(normalise);
}

export async function installSkill(db: ProductDb, input: InstallSkillInput): Promise<SkillRow> {
  if (!input.slug || input.slug.trim() === "") {
    throw new Error("slug is required");
  }
  const id = newUlid();
  const source = input.upstreamRepo ? "upstream" : "local";
  await db.query(
    `INSERT INTO skills (id, org_id, slug, source, upstream_repo)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, input.orgId, input.slug.trim(), source, input.upstreamRepo ?? null],
  );
  const rows = await db.query<RawSkillRow>(
    `SELECT * FROM skills WHERE id = $1`,
    [id],
  );
  return normalise(rows[0]!);
}

export async function upgradeSkill(db: ProductDb, orgId: string, slug: string): Promise<SkillRow> {
  // Bump version patch component
  const rows = await db.query<RawSkillRow>(
    `SELECT * FROM skills WHERE org_id = $1 AND slug = $2`,
    [orgId, slug],
  );
  if (rows.length === 0) throw new Error(`skill '${slug}' not found`);
  const current = rows[0]!;
  const parts = current.version.split(".").map(Number);
  const newVersion = `${parts[0]}.${parts[1]}.${parts[2]! + 1}`;
  await db.query(
    `UPDATE skills SET version = $1, updated_at = now() WHERE org_id = $2 AND slug = $3`,
    [newVersion, orgId, slug],
  );
  const updated = await db.query<RawSkillRow>(
    `SELECT * FROM skills WHERE org_id = $1 AND slug = $2`,
    [orgId, slug],
  );
  return normalise(updated[0]!);
}

export async function upgradeAllSkills(db: ProductDb, orgId: string): Promise<SkillRow[]> {
  const skills = await listSkills(db, orgId);
  const results: SkillRow[] = [];
  for (const skill of skills) {
    results.push(await upgradeSkill(db, orgId, skill.slug));
  }
  return results;
}

export async function uninstallSkill(db: ProductDb, orgId: string, slug: string): Promise<void> {
  const result = await db.query<{ id: string }>(
    `DELETE FROM skills WHERE org_id = $1 AND slug = $2 RETURNING id`,
    [orgId, slug],
  );
  if (result.length === 0) throw new Error(`skill '${slug}' not found`);
}

export async function updateEnabledAgents(
  db: ProductDb,
  orgId: string,
  slug: string,
  enabledAgents: string[],
): Promise<SkillRow> {
  await db.query(
    `UPDATE skills SET enabled_agents = $1::jsonb, updated_at = now() WHERE org_id = $2 AND slug = $3`,
    [JSON.stringify(enabledAgents), orgId, slug],
  );
  const rows = await db.query<RawSkillRow>(
    `SELECT * FROM skills WHERE org_id = $1 AND slug = $2`,
    [orgId, slug],
  );
  if (rows.length === 0) throw new Error(`skill '${slug}' not found`);
  return normalise(rows[0]!);
}

export async function resolveConflict(
  db: ProductDb,
  input: ResolveConflictInput,
): Promise<SkillRow> {
  const rows = await db.query<RawSkillRow>(
    `SELECT * FROM skills WHERE org_id = $1 AND slug = $2`,
    [input.orgId, input.slug],
  );
  if (rows.length === 0) throw new Error(`skill '${input.slug}' not found`);
  const skill = normalise(rows[0]!);
  if (!skill.upstream_conflict) throw new Error(`skill '${input.slug}' has no conflict`);

  // Resolution: clear conflict. If use_upstream, update content_hash.
  const newHash = input.resolution === "use_upstream"
    ? `upstream-${Date.now()}`
    : skill.content_hash;

  await db.query(
    `UPDATE skills SET upstream_conflict = NULL, content_hash = $1, updated_at = now()
     WHERE org_id = $2 AND slug = $3`,
    [newHash, input.orgId, input.slug],
  );
  const updated = await db.query<RawSkillRow>(
    `SELECT * FROM skills WHERE org_id = $1 AND slug = $2`,
    [input.orgId, input.slug],
  );
  return normalise(updated[0]!);
}
