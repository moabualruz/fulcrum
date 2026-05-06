// fulcrum backup --output /path — PGlite dump + artifacts manifest tarball.

import { mkdir, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { InteractiveRequiredError } from "./errors.ts";

interface LegacySqlDb {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
}

// Tables to dump (order matters for FK deps).
const DUMP_TABLES = [
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

export interface BackupOptions {
  output: string;
  dbDir: string;
  artifactsDir: string;
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

/** Dump all table rows as JSON, pack into tarball with artifacts manifest. */
export async function createBackup(
  db: LegacySqlDb,
  opts: BackupOptions,
): Promise<void> {
  const dump: Record<string, unknown[]> = {};
  for (const table of DUMP_TABLES) {
    try {
      const rows = await db.query(`SELECT * FROM ${table}`);
      dump[table] = rows;
    } catch {
      // Table may not exist yet if migration hasn't run.
      dump[table] = [];
    }
  }

  // Collect artifact file listing.
  const artifactFiles: string[] = [];
  if (await exists(opts.artifactsDir)) {
    const entries = await readdir(opts.artifactsDir, { recursive: true });
    for (const entry of entries) {
      const full = join(opts.artifactsDir, entry);
      const s = await stat(full);
      if (s.isFile()) {
        artifactFiles.push(relative(opts.artifactsDir, full));
      }
    }
  }

  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    tables: dump,
    artifactFiles,
  };

  // Write manifest JSON, then tar.gz it.
  const manifestJson = JSON.stringify(manifest, null, 2);

  // Use Bun's built-in tar support via shell.
  const tmpManifest = join(opts.dbDir, "__backup_manifest.json");
  await Bun.write(tmpManifest, manifestJson);

  const filesToTar = [tmpManifest];

  // Add artifact files if they exist.
  // For simplicity, we tar just the manifest. Artifact bodies can be added
  // in a future iteration when the artifact store is populated.
  const proc = Bun.spawn(
    ["tar", "czf", opts.output, "-C", opts.dbDir, "__backup_manifest.json"],
    { stdout: "ignore", stderr: "pipe" },
  );
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`tar failed (exit ${exitCode}): ${stderr}`);
  }

  // Cleanup temp manifest.
  const { unlink } = await import("node:fs/promises");
  await unlink(tmpManifest).catch(() => {});
}

export interface InteractiveBackupOptions {
  nonInteractive?: boolean;
  output?: string;
  dbDir: string;
  artifactsDir: string;
}

/**
 * Interactive backup entry point.
 * In non-interactive mode, throws InteractiveRequiredError (exit 7) if
 * --output was not provided (prompt would be needed for destination path).
 */
export async function runInteractiveBackup(
  db: LegacySqlDb,
  opts: InteractiveBackupOptions,
): Promise<void> {
  let output = opts.output;

  if (!output && opts.nonInteractive) {
    throw new InteractiveRequiredError(
      "--output not provided; `fulcrum backup` needs destination path prompt",
    );
  }

  if (!output) {
    // In interactive mode, would prompt for path. Default for now.
    output = "fulcrum-backup.tar.gz";
  }

  await createBackup(db, {
    output,
    dbDir: opts.dbDir,
    artifactsDir: opts.artifactsDir,
  });
}
