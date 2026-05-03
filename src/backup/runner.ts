/**
 * Backup runner — produces a local .tar.gz archive.
 * Called by the scheduled graphile-worker task and the CLI (`fulcrum backup`).
 *
 * Blocked-by: Issue 03 (backup/restore tRPC) for a full DB dump implementation.
 * This stub creates a minimal valid archive so the upload pipeline can be tested
 * end-to-end before the full dump lands.
 */

import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export interface RunnerOptions {
  /** Override state directory (default: ~/.fulcrum/state/backups). */
  stateDir?: string;
  /** Timestamp tag for the archive filename (default: ISO-8601). */
  tag?: string;
}

export interface RunnerResult {
  archivePath: string;
  tag: string;
}

/**
 * Create a local backup archive.
 * Returns the path to the .tar.gz file.
 */
export async function createLocalBackup(opts: RunnerOptions = {}): Promise<RunnerResult> {
  const stateDir = opts.stateDir ?? join(homedir(), ".fulcrum", "state", "backups");
  await mkdir(stateDir, { recursive: true });

  const tag = opts.tag ?? new Date().toISOString().replace(/[:.]/g, "-");
  const archivePath = join(stateDir, `backup-${tag}.tar.gz`);

  // Stub: write a minimal JSON manifest inside a gzip stream.
  // When Issue 03 ships, replace this with a real pg_dump + tar pipeline.
  const manifest = JSON.stringify({ tag, created_at: new Date().toISOString(), type: "stub" });
  const source = Readable.from([manifest]);
  const gz = createGzip();
  const dest = createWriteStream(archivePath);
  await pipeline(source, gz, dest);

  return { archivePath, tag };
}
