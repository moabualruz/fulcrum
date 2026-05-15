import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { DataSource, EntityManager } from "typeorm";

import {
  OrganizationMemberEntity,
} from "@identity-access/infrastructure/database/organization.entities.ts";
import {
  exportableColumns,
  redactExportRow,
} from "@integration-hub/application/data-exchange/export-redaction.ts";

export const FULCRUM_BACKUP_FORMAT = "fulcrum.db-dump.v1" as const;
export const FULCRUM_DATA_EXPORT_FORMAT = "fulcrum.json-export.v1" as const;
export const FULCRUM_DATA_EXPORT_SCHEMA_VERSION = 1 as const;

export type ConflictPolicy = "skip" | "update" | "error";

export interface DataPortabilityScope {
  orgId: string;
  userId: string;
}

export interface BackupDumpTable {
  columns: string[];
  columnTypes: Record<string, string>;
  rows: Array<Record<string, unknown>>;
}

export interface BackupDump {
  format: typeof FULCRUM_BACKUP_FORMAT;
  createdAt: string;
  tables: Record<string, BackupDumpTable>;
}

export interface DataExportManifest {
  format: typeof FULCRUM_DATA_EXPORT_FORMAT;
  manifest: {
    schema_version: typeof FULCRUM_DATA_EXPORT_SCHEMA_VERSION;
    fulcrum_version: string;
    exported_at: string;
    counts: Record<string, number>;
    column_types: Record<string, Record<string, string>>;
  };
  [table: string]: unknown;
}

export interface ImportRunResult {
  imported: number;
  updated: number;
  skipped: number;
}

export class DataPortabilityPermissionError extends Error {}
export class DataPortabilityValidationError extends Error {}
export class DataPortabilityConflictError extends Error {}

type Queryable = DataSource | EntityManager;

export class DataPortabilityStore {
  constructor(private readonly dataSource: DataSource) {}

  async createBackup(input: DataPortabilityScope): Promise<{
    format: typeof FULCRUM_BACKUP_FORMAT;
    dump: string;
    entityCounts: Record<string, number>;
  }> {
    await this.requireAdminAccess(input);
    const dump = await createBackupDump(this.dataSource);
    return {
      format: FULCRUM_BACKUP_FORMAT,
      dump: encodeBackupDump(dump),
      entityCounts: entityCounts(dump.tables),
    };
  }

  async restoreBackup(input: DataPortabilityScope & { dump: string }): Promise<{
    format: typeof FULCRUM_BACKUP_FORMAT;
    entityCounts: Record<string, number>;
  }> {
    await this.requireAdminAccess(input);
    const dump = decodeBackupDump(input.dump);
    await restoreBackupDump(this.dataSource, dump);
    return {
      format: FULCRUM_BACKUP_FORMAT,
      entityCounts: entityCounts(dump.tables),
    };
  }

  async createExport(input: DataPortabilityScope & {
    pretty?: boolean;
    outputPath?: string;
  }): Promise<{
    format: typeof FULCRUM_DATA_EXPORT_FORMAT;
    json: string;
    entityCounts: Record<string, number>;
    outputPath?: string;
  }> {
    await this.requireAdminAccess(input);
    const manifest = await createExportManifest(this.dataSource);
    const json = JSON.stringify(manifest, null, input.pretty ? 2 : 0);
    if (input.outputPath) await writeFile(input.outputPath, json, "utf8");
    return {
      format: FULCRUM_DATA_EXPORT_FORMAT,
      json,
      entityCounts: manifest.manifest.counts,
      outputPath: input.outputPath,
    };
  }

  async preflightImport(input: DataPortabilityScope & { path: string }): Promise<{
    importId: string;
    counts: Record<string, number>;
    collisions: Array<{ kind: string; id: string }>;
  }> {
    await this.requireAdminAccess(input);
    const manifest = await readImportManifest(input.path);
    return {
      importId: input.path,
      counts: manifest.manifest.counts,
      collisions: await listImportCollisions(this.dataSource, manifest),
    };
  }

  async runImport(input: DataPortabilityScope & {
    importId: string;
    dryRun?: boolean;
    onConflict?: ConflictPolicy;
  }): Promise<ImportRunResult & {
    errors: number;
    counts: Record<string, number>;
  }> {
    await this.requireAdminAccess(input);
    const manifest = await readImportManifest(input.importId);
    if (input.dryRun) {
      return {
        imported: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        counts: manifest.manifest.counts,
      };
    }

    const result = await this.dataSource.transaction(async (manager) =>
      await importManifestRows(manager, manifest, input.onConflict ?? "error")
    );
    return {
      ...result,
      errors: 0,
      counts: manifest.manifest.counts,
    };
  }

  private async requireAdminAccess(input: DataPortabilityScope): Promise<void> {
    const membership = await this.dataSource.getRepository(OrganizationMemberEntity).findOneBy({
      orgId: input.orgId,
      userId: input.userId,
    });
    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      throw new DataPortabilityPermissionError(
        "Only organization owners and admins can run data portability operations.",
      );
    }
  }
}

async function createBackupDump(dataSource: DataSource): Promise<BackupDump> {
  const tables: BackupDump["tables"] = {};
  for (const table of await tableNames(dataSource)) {
    const { columns, columnTypes } = await columnsForTable(dataSource, table);
    const rows = columns.length === 0
      ? []
      : await query<Record<string, unknown>>(
        dataSource,
        `select * from ${quoteIdent(table)} order by ${columns.includes("id") ? quoteIdent("id") : "1"}`,
      );
    tables[table] = { columns, columnTypes, rows: rows.map(normalizeRow) };
  }
  return {
    format: FULCRUM_BACKUP_FORMAT,
    createdAt: new Date().toISOString(),
    tables,
  };
}

function encodeBackupDump(dump: BackupDump): string {
  return Buffer.from(JSON.stringify(dump), "utf8").toString("base64");
}

function decodeBackupDump(encoded: string): BackupDump {
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    assertBackupDump(parsed);
    return parsed;
  } catch (cause) {
    throw new DataPortabilityValidationError("Backup dump is invalid.", { cause });
  }
}

async function restoreBackupDump(dataSource: DataSource, dump: BackupDump): Promise<void> {
  await dataSource.transaction(async (manager) => {
    const existingTables = new Set(await tableNames(manager));
    for (const [table, data] of Object.entries(dump.tables)) {
      if (!existingTables.has(table) || !data.columns.includes("id")) continue;
      if (data.rows.length === 0) continue;

      const columns = data.columns;
      const insertColumns = columns.map(quoteIdent).join(", ");
      const updates = columns
        .filter((column) => column !== "id")
        .map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`)
        .join(", ");

      for (const row of data.rows) {
        await query(
          manager,
          `
            insert into ${quoteIdent(table)} (${insertColumns})
            values (${columns.map((column, index) => placeholder(index + 1, data.columnTypes[column])).join(", ")})
            on conflict (${quoteIdent("id")}) do ${updates ? `update set ${updates}` : "nothing"}
          `,
          columns.map((column) => sqlValue(row[column], data.columnTypes[column])),
        );
      }
    }
  });
}

async function createExportManifest(dataSource: DataSource): Promise<DataExportManifest> {
  const manifest: DataExportManifest = {
    format: FULCRUM_DATA_EXPORT_FORMAT,
    manifest: {
      schema_version: FULCRUM_DATA_EXPORT_SCHEMA_VERSION,
      fulcrum_version: "0.1.0",
      exported_at: new Date().toISOString(),
      counts: {},
      column_types: {},
    },
  };

  for (const table of await tableNames(dataSource)) {
    const { columns, columnTypes } = await columnsForTable(dataSource, table);
    const selectedColumns = exportableColumns(columns);
    const rows = selectedColumns.length === 0
      ? []
      : await query<Record<string, unknown>>(
        dataSource,
        `select ${selectedColumns.map(quoteIdent).join(", ")} from ${quoteIdent(table)} order by ${
          selectedColumns.includes("id") ? quoteIdent("id") : "1"
        }`,
      );
    manifest[table] = rows.map((row) => redactExportRow(normalizeRow(row)));
    manifest.manifest.counts[table] = rows.length;
    manifest.manifest.column_types[table] = Object.fromEntries(
      selectedColumns.map((column) => [column, columnTypes[column] ?? "unknown"]),
    );
  }

  return manifest;
}

async function readImportManifest(path: string): Promise<DataExportManifest> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    assertDataExportManifest(parsed);
    return parsed;
  } catch (cause) {
    throw new DataPortabilityValidationError("Import manifest is invalid.", { cause });
  }
}

async function listImportCollisions(
  dataSource: DataSource,
  manifest: DataExportManifest,
): Promise<Array<{ kind: string; id: string }>> {
  const tables = new Set(await tableNames(dataSource));
  const collisions: Array<{ kind: string; id: string }> = [];

  for (const [kind, rows] of entityEntries(manifest)) {
    if (!tables.has(kind) || !isImportableTable(kind)) continue;
    for (const row of rows) {
      if (typeof row.id !== "string") continue;
      const existing = await query<{ id: string }>(
        dataSource,
        `select id from ${quoteIdent(kind)} where id = $1 limit 1`,
        [row.id],
      );
      if (existing.length > 0) collisions.push({ kind, id: row.id });
    }
  }

  return collisions;
}

async function importManifestRows(
  manager: EntityManager,
  manifest: DataExportManifest,
  onConflict: ConflictPolicy,
): Promise<ImportRunResult> {
  const tables = new Set(await tableNames(manager));
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const [kind, rows] of entityEntries(manifest)) {
    if (!tables.has(kind) || !isImportableTable(kind)) {
      skipped += rows.length;
      continue;
    }

    const columnTypes = manifest.manifest.column_types[kind] ?? {};
    for (const row of rows) {
      if (typeof row.id !== "string") {
        skipped += 1;
        continue;
      }

      const existing = await query<{ id: string }>(
        manager,
        `select id from ${quoteIdent(kind)} where id = $1 limit 1`,
        [row.id],
      );
      const collides = existing.length > 0;
      if (collides && onConflict === "error") {
        throw new DataPortabilityConflictError(`Import collision for ${kind}:${row.id}.`);
      }
      if (collides && onConflict === "skip") {
        skipped += 1;
        continue;
      }

      const columns = Object.keys(row).filter((column) => columnTypes[column] !== undefined);
      if (!columns.includes("id")) columns.unshift("id");
      if (columns.length === 0) {
        skipped += 1;
        continue;
      }

      const insertColumns = columns.map(quoteIdent).join(", ");
      const values = columns.map((column) => sqlValue(row[column], columnTypes[column]));
      const placeholders = columns.map((column, index) => placeholder(index + 1, columnTypes[column])).join(", ");

      if (collides) {
        const updates = columns
          .filter((column) => column !== "id")
          .map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`)
          .join(", ");
        if (!updates) {
          skipped += 1;
          continue;
        }
        await query(
          manager,
          `
            insert into ${quoteIdent(kind)} (${insertColumns})
            values (${placeholders})
            on conflict (${quoteIdent("id")}) do update set ${updates}
          `,
          values,
        );
        updated += 1;
      } else {
        await query(
          manager,
          `
            insert into ${quoteIdent(kind)} (${insertColumns})
            values (${placeholders})
          `,
          values,
        );
        imported += 1;
      }
    }
  }

  return { imported, updated, skipped };
}

async function tableNames(executor: Queryable): Promise<string[]> {
  const rows = await query<{ table_name: string }>(
    executor,
    `
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
      order by table_name
    `,
  );
  return rows.map((row) => row.table_name);
}

async function columnsForTable(
  executor: Queryable,
  table: string,
): Promise<{ columns: string[]; columnTypes: Record<string, string> }> {
  const rows = await query<{ column_name: string; data_type: string }>(
    executor,
    `
      select column_name, data_type
      from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
      order by ordinal_position
    `,
    [table],
  );
  return {
    columns: rows.map((row) => row.column_name),
    columnTypes: Object.fromEntries(rows.map((row) => [row.column_name, row.data_type])),
  };
}

function entityCounts(tables: Record<string, BackupDumpTable>): Record<string, number> {
  return Object.fromEntries(Object.entries(tables).map(([table, data]) => [table, data.rows.length]));
}

function entityEntries(manifest: DataExportManifest): Array<[string, Array<Record<string, unknown>>]> {
  return Object.entries(manifest)
    .filter(([key, value]) => key !== "format" && key !== "manifest" && Array.isArray(value))
    .map(([key, value]) => [key, value as Array<Record<string, unknown>>]);
}

function isImportableTable(table: string): boolean {
  const normalized = table.toLowerCase();
  return normalized !== "schema_migrations" && !normalized.includes("credential");
}

function quoteIdent(identifier: string): string {
  return `"${identifier.replaceAll("\"", "\"\"")}"`;
}

function placeholder(index: number, dataType: string | undefined): string {
  if (dataType === "json" || dataType === "jsonb") return `$${index}::${dataType}`;
  if (dataType === "timestamp with time zone") return `$${index}::timestamptz`;
  if (dataType === "timestamp without time zone") return `$${index}::timestamp`;
  return `$${index}`;
}

function sqlValue(value: unknown, dataType: string | undefined): unknown {
  if (dataType === "ARRAY" && Array.isArray(value)) return toPostgresArrayLiteral(value);
  if ((dataType === "json" || dataType === "jsonb") && value !== null && value !== undefined) {
    return JSON.stringify(value);
  }
  return value ?? null;
}

function toPostgresArrayLiteral(values: unknown[]): string {
  return `{${values.map((value) => {
    const text = String(value ?? "");
    return `"${text.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
  }).join(",")}}`;
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, normalizeValue(value)]),
  );
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object" && value.constructor === Object) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, normalizeValue(nested)]),
    );
  }
  return value;
}

async function query<T extends Record<string, unknown>>(
  executor: Queryable,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return await executor.query(sql, params) as T[];
}

function assertBackupDump(value: unknown): asserts value is BackupDump {
  const record = asRecord(value);
  if (record.format !== FULCRUM_BACKUP_FORMAT || typeof record.createdAt !== "string") {
    throw new Error("invalid backup header");
  }
  const tables = asRecord(record.tables);
  for (const table of Object.values(tables)) {
    const data = asRecord(table);
    if (!Array.isArray(data.columns) || !Array.isArray(data.rows)) throw new Error("invalid backup table");
    asRecord(data.columnTypes);
  }
}

function assertDataExportManifest(value: unknown): asserts value is DataExportManifest {
  const record = asRecord(value);
  if (record.format !== FULCRUM_DATA_EXPORT_FORMAT) throw new Error("invalid export format");
  const manifest = asRecord(record.manifest);
  if (manifest.schema_version !== FULCRUM_DATA_EXPORT_SCHEMA_VERSION) throw new Error("invalid schema version");
  asRecord(manifest.counts);
  asRecord(manifest.column_types);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("expected object");
  return value as Record<string, unknown>;
}

export function createPortableItemId(prefix = "item"): string {
  return `${prefix}-${randomUUID()}`;
}
