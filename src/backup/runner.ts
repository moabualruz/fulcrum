/**
 * Backup runner — produces a local .tar.gz archive.
 * Called by the scheduled graphile-worker task and the CLI (`fulcrum backup`).
 *
 * Blocked-by: Issue 03 (backup/restore tRPC) for a full DB dump implementation.
 * This stub creates a minimal valid archive so the upload pipeline can be tested
 * end-to-end before the full dump lands.
 */

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createGzip, gunzipSync } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export interface RunnerOptions {
  /** Override state directory (default: ~/.fulcrum/state/backups). */
  stateDir?: string;
  /** Timestamp tag for the archive filename (default: ISO-8601). */
  tag?: string;
  dump?: string;
  entityCounts?: Record<string, number>;
}

export interface RunnerResult {
  archivePath: string;
  tag: string;
}

export interface BackupArchive {
  format: "fulcrum.backup.v1";
  createdAt: string;
  entityCounts: Record<string, number>;
  dump: string;
  checksumSha256: string;
}

export interface BackupArchiveVerification {
  ok: boolean;
  format?: string;
  entityCounts?: Record<string, number>;
  checksumSha256?: string;
}

function checksumDump(dump: string): string {
  return createHash("sha256").update(Buffer.from(dump, "base64")).digest("hex");
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

  const dump = opts.dump ?? Buffer.from(JSON.stringify({
    format: "fulcrum.db-dump.v1",
    createdAt: new Date().toISOString(),
    tables: {},
  }), "utf8").toString("base64");
  const archive: BackupArchive = {
    format: "fulcrum.backup.v1",
    createdAt: new Date().toISOString(),
    entityCounts: opts.entityCounts ?? {},
    dump,
    checksumSha256: checksumDump(dump),
  };
  const source = Readable.from([JSON.stringify(archive)]);
  const gz = createGzip();
  const dest = createWriteStream(archivePath);
  await pipeline(source, gz, dest);

  return { archivePath, tag };
}

export async function verifyBackupArchive(path: string): Promise<BackupArchiveVerification> {
  try {
    const archive = JSON.parse(gunzipSync(await readFile(path)).toString("utf8")) as BackupArchive;
    const checksumSha256 = checksumDump(archive.dump);
    return {
      ok: archive.format === "fulcrum.backup.v1" && checksumSha256 === archive.checksumSha256,
      format: archive.format,
      entityCounts: archive.entityCounts,
      checksumSha256: archive.checksumSha256,
    };
  } catch {
    return { ok: false };
  }
}
