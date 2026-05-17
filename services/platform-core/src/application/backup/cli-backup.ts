export interface CliBackupStore {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<T[]>;
}

export type CliBackupTables = Record<string, unknown[]>;

// Order matters for FK dependencies during restore.
export const CLI_BACKUP_TABLES = [
  "orgs",
  "users",
  "projects",
  "repos",
  "documents",
  "tasks",
  "memories",
  "agent_runs",
  "artifacts",
  "edges",
  "events",
] as const;

function quoteIdent(identifier: string): string {
  return `"${identifier.replaceAll("\"", "\"\"")}"`;
}

export async function createCliBackupTables(
  store: CliBackupStore,
): Promise<CliBackupTables> {
  const tables: CliBackupTables = {};

  for (const table of CLI_BACKUP_TABLES) {
    try {
      tables[table] = await store.query(`SELECT * FROM ${quoteIdent(table)}`);
    } catch {
      // Table may not exist yet if migration has not run.
      tables[table] = [];
    }
  }

  return tables;
}

function backupValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

export async function restoreCliBackupTables(
  store: CliBackupStore,
  tables: Record<string, Record<string, unknown>[]>,
): Promise<void> {
  for (const table of CLI_BACKUP_TABLES) {
    const rows = tables[table];
    if (!rows || rows.length === 0) continue;

    for (const row of rows) {
      const columns = Object.keys(row);
      if (columns.length === 0) continue;

      const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
      const values = columns.map((column) => backupValue(row[column]));

      try {
        await store.query(
          `INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          values,
        );
      } catch {
        // Skip rows that conflict or reference missing FKs.
      }
    }
  }
}
