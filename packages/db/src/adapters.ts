import type Database from "better-sqlite3";
import type { AdapterMetadata } from "@fulcrum/shared";
import { AdapterMetadataSchema, SCHEMA_VERSION } from "@fulcrum/shared";

type AdapterRow = Record<string, unknown>;

function fromRow(row: AdapterRow): AdapterMetadata {
  return AdapterMetadataSchema.parse({
    adapterId: row.adapter_id,
    category: row.category,
    name: row.name,
    enabled: Boolean(row.enabled),
    ownershipBoundary: row.ownership_boundary,
    networkRequired: Boolean(row.network_required),
    credentialStatus: row.credential_status,
    privacyNotes: row.privacy_notes,
    offlineBehavior: row.offline_behavior,
    disablementBehavior: row.disablement_behavior,
    importExportStrategy: row.import_export_strategy,
    rebuildStrategy: row.rebuild_strategy
  });
}

export class AdapterConfigurationRepository {
  constructor(private readonly db: Database.Database) {}

  save(metadata: AdapterMetadata): AdapterMetadata {
    const parsed = AdapterMetadataSchema.parse(metadata);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO adapter_configurations (
          adapter_id, category, name, enabled, ownership_boundary, network_required,
          credential_status, privacy_notes, offline_behavior, disablement_behavior,
          import_export_strategy, rebuild_strategy, created_at, updated_at, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(adapter_id) DO UPDATE SET
          category = excluded.category,
          name = excluded.name,
          enabled = excluded.enabled,
          ownership_boundary = excluded.ownership_boundary,
          network_required = excluded.network_required,
          credential_status = excluded.credential_status,
          privacy_notes = excluded.privacy_notes,
          offline_behavior = excluded.offline_behavior,
          disablement_behavior = excluded.disablement_behavior,
          import_export_strategy = excluded.import_export_strategy,
          rebuild_strategy = excluded.rebuild_strategy,
          updated_at = excluded.updated_at,
          schema_version = excluded.schema_version`
      )
      .run(
        parsed.adapterId,
        parsed.category,
        parsed.name,
        parsed.enabled ? 1 : 0,
        parsed.ownershipBoundary,
        parsed.networkRequired ? 1 : 0,
        parsed.credentialStatus,
        parsed.privacyNotes,
        parsed.offlineBehavior,
        parsed.disablementBehavior,
        parsed.importExportStrategy,
        parsed.rebuildStrategy,
        now,
        now,
        SCHEMA_VERSION
      );
    return parsed;
  }

  get(adapterId: string): AdapterMetadata | undefined {
    const row = this.db
      .prepare("SELECT * FROM adapter_configurations WHERE adapter_id = ?")
      .get(adapterId) as AdapterRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  list(): AdapterMetadata[] {
    return this.db
      .prepare("SELECT * FROM adapter_configurations ORDER BY category ASC, adapter_id ASC")
      .all()
      .map((row) => fromRow(row as AdapterRow));
  }
}
