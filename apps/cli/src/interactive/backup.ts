// fulcrum backup --output /path — PGlite dump + artifacts manifest tarball.

import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  createCliBackupTables,
  type CliBackupStore,
} from "@platform-core/application/backup/cli-backup.ts";
import { InteractiveRequiredError } from "./errors.ts";

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
  db: CliBackupStore,
  opts: BackupOptions,
): Promise<void> {
  const tables = await createCliBackupTables(db);

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
    tables,
    artifactFiles,
  };

  // Write manifest JSON, then tar.gz it.
  const manifestJson = JSON.stringify(manifest, null, 2);

  // Use Bun's built-in tar support via shell.
  const tmpManifest = join(opts.dbDir, "__backup_manifest.json");
  await Bun.write(tmpManifest, manifestJson);

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
  db: CliBackupStore,
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
