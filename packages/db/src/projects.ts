import type Database from "better-sqlite3";
import { ProjectSchema, type Project } from "@fulcrum/shared";

type ProjectRow = Record<string, unknown>;

function parseJsonArray(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed.map(String) : [];
}

function fromRow(row: ProjectRow): Project {
  return ProjectSchema.parse({
    projectId: row.project_id,
    name: row.name,
    rootPath: row.root_path,
    defaultBranch: row.default_branch,
    worktreePolicyId: row.worktree_policy_id,
    ignoredPathPolicyId: row.ignored_path_policy_id,
    qualityGateSetId: row.quality_gate_set_id,
    privacyMode: row.privacy_mode,
    healthState: row.health_state,
    enabledCapabilities: parseJsonArray(row.enabled_capabilities_json),
    disabledCapabilities: parseJsonArray(row.disabled_capabilities_json),
    adapterMappings:
      typeof row.adapter_mappings_json === "string"
        ? (JSON.parse(row.adapter_mappings_json) as Record<string, string>)
        : {},
    lastScannedAt: row.last_scanned_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schemaVersion: row.schema_version
  });
}

export class ProjectRepository {
  constructor(private readonly db: Database.Database) {}

  save(project: Project): Project {
    const parsed = ProjectSchema.parse(project);
    this.db
      .prepare(
        `INSERT INTO projects (
          project_id, name, root_path, default_branch, worktree_policy_id,
          ignored_path_policy_id, quality_gate_set_id, privacy_mode, health_state,
          enabled_capabilities_json, disabled_capabilities_json, adapter_mappings_json,
          last_scanned_at, created_at, updated_at, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET
          name = excluded.name,
          root_path = excluded.root_path,
          default_branch = excluded.default_branch,
          worktree_policy_id = excluded.worktree_policy_id,
          ignored_path_policy_id = excluded.ignored_path_policy_id,
          quality_gate_set_id = excluded.quality_gate_set_id,
          privacy_mode = excluded.privacy_mode,
          health_state = excluded.health_state,
          enabled_capabilities_json = excluded.enabled_capabilities_json,
          disabled_capabilities_json = excluded.disabled_capabilities_json,
          adapter_mappings_json = excluded.adapter_mappings_json,
          last_scanned_at = excluded.last_scanned_at,
          updated_at = excluded.updated_at,
          schema_version = excluded.schema_version`
      )
      .run(
        parsed.projectId,
        parsed.name,
        parsed.rootPath,
        parsed.defaultBranch,
        parsed.worktreePolicyId,
        parsed.ignoredPathPolicyId,
        parsed.qualityGateSetId,
        parsed.privacyMode,
        parsed.healthState,
        JSON.stringify(parsed.enabledCapabilities),
        JSON.stringify(parsed.disabledCapabilities),
        JSON.stringify(parsed.adapterMappings),
        parsed.lastScannedAt ?? null,
        parsed.createdAt,
        parsed.updatedAt,
        parsed.schemaVersion
      );
    return parsed;
  }

  get(projectId: string): Project | undefined {
    const row = this.db.prepare("SELECT * FROM projects WHERE project_id = ?").get(projectId);
    return row ? fromRow(row as ProjectRow) : undefined;
  }

  findByRoot(rootPath: string): Project | undefined {
    const row = this.db.prepare("SELECT * FROM projects WHERE root_path = ?").get(rootPath);
    return row ? fromRow(row as ProjectRow) : undefined;
  }

  list(): Project[] {
    return this.db
      .prepare("SELECT * FROM projects ORDER BY created_at ASC")
      .all()
      .map((row) => fromRow(row as ProjectRow));
  }
}
