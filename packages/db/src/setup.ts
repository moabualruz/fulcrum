import type Database from "better-sqlite3";
import type { SetupState } from "@fulcrum/shared";
import { SetupStateSchema } from "@fulcrum/shared";

type SetupRow = Record<string, unknown>;

function fromRow(row: SetupRow): SetupState {
  return SetupStateSchema.parse({
    setupId: row.setup_id,
    status: row.status,
    stateRoot: row.state_root,
    configPath: row.config_path,
    dbPath: row.db_path,
    artifactRoot: row.artifact_root,
    logRoot: row.log_root,
    backupRoot: row.backup_root,
    managedMemoryRoot: row.managed_memory_root,
    privacyMode: row.privacy_mode,
    networkDefault: row.network_default,
    redactionProfileId: row.redaction_profile_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schemaVersion: row.schema_version
  });
}

export class SetupRepository {
  constructor(private readonly db: Database.Database) {}

  save(state: SetupState): SetupState {
    const parsed = SetupStateSchema.parse(state);
    this.db
      .prepare(
        `INSERT INTO setup_state (
          setup_id, status, state_root, config_path, db_path, artifact_root, log_root,
          backup_root, managed_memory_root, privacy_mode, network_default,
          redaction_profile_id, created_at, updated_at, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(setup_id) DO UPDATE SET
          status = excluded.status,
          state_root = excluded.state_root,
          config_path = excluded.config_path,
          db_path = excluded.db_path,
          artifact_root = excluded.artifact_root,
          log_root = excluded.log_root,
          backup_root = excluded.backup_root,
          managed_memory_root = excluded.managed_memory_root,
          privacy_mode = excluded.privacy_mode,
          network_default = excluded.network_default,
          redaction_profile_id = excluded.redaction_profile_id,
          updated_at = excluded.updated_at,
          schema_version = excluded.schema_version`
      )
      .run(
        parsed.setupId,
        parsed.status,
        parsed.stateRoot,
        parsed.configPath,
        parsed.dbPath,
        parsed.artifactRoot,
        parsed.logRoot,
        parsed.backupRoot,
        parsed.managedMemoryRoot,
        parsed.privacyMode,
        parsed.networkDefault,
        parsed.redactionProfileId,
        parsed.createdAt,
        parsed.updatedAt,
        parsed.schemaVersion
      );
    return parsed;
  }

  getLatest(): SetupState | undefined {
    const row = this.db.prepare("SELECT * FROM setup_state ORDER BY updated_at DESC LIMIT 1").get();
    return row ? fromRow(row as SetupRow) : undefined;
  }
}
