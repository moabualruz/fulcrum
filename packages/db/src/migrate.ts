import Database from "better-sqlite3";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

interface MigrationRow {
  version: string;
}

export function openDatabase(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  return new Database(dbPath);
}

export function migrate(db: Database.Database, migrationsDir: string): MigrationResult {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedVersions = new Set(
    db
      .prepare("SELECT version FROM schema_migrations")
      .all()
      .map((row) => String((row as MigrationRow).version))
  );
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const result: MigrationResult = { applied: [], skipped: [] };

  const apply = db.transaction((file: string) => {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    db.exec(sql);
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
      file,
      new Date().toISOString()
    );
  });

  for (const file of files) {
    if (appliedVersions.has(file)) {
      result.skipped.push(file);
      continue;
    }
    apply(file);
    result.applied.push(file);
  }

  return result;
}
