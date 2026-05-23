/**
 * Remote backup storage adapters.
 * Gated by FULCRUM_FEATURES=scheduled-backups.
 *
 * DSN formats:
 *   s3://bucket/prefix
 *   r2://bucket/prefix   (S3-compatible via endpoint)
 *   b2://bucket/prefix   (S3-compatible via endpoint)
 *   gcs://bucket/prefix
 *   azure://container/prefix
 *
 * Each adapter receives the archive path + a key and uploads it.
 * Retry: 3× exponential (500ms base) on any error.
 * On final failure: emits Event kind backup_upload_failed.
 */

import { createReadStream } from "node:fs";
import { readdir, unlink } from "node:fs/promises";
import { join, basename } from "node:path";
import type { Readable } from "node:stream";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UploadResult {
  success: boolean;
  provider: string;
  key: string;
  credentialRef?: string;
  error?: string;
  attempts: number;
}

export interface BackupEvent {
  kind: "backup_upload_succeeded" | "backup_upload_failed";
  payload: {
    provider: string;
    key: string;
    credentialRef?: string;
    error?: string;
    attempts: number;
  };
}

/** Minimal S3 PutObject command interface — injected for testability. */
export interface S3PutFn {
  (params: { Bucket: string; Key: string; Body: Readable }): Promise<void>;
}

/** Minimal GCS file interface — injected for testability. */
export interface GCSFileSaveFn {
  (localPath: string): Promise<void>;
}

export interface RemoteAdapterOptions {
  /** Credential record id/reference; adapters never receive raw secrets in DSNs. */
  credentialRef?: string;
  /** Injected S3 put function (real or mock). */
  s3Put?: S3PutFn;
  /** Injected GCS file.save function (real or mock). */
  gcsSave?: GCSFileSaveFn;
  /** Injected Azure block blob upload function (real or mock). */
  azureUpload?: (containerName: string, blobName: string, localPath: string) => Promise<void>;
  /** Base retry delay in ms (override for tests). */
  retryBaseMs?: number;
}

// ---------------------------------------------------------------------------
// DSN parsing
// ---------------------------------------------------------------------------

export interface ParsedDSN {
  provider: "s3" | "r2" | "b2" | "gcs" | "azure";
  bucket: string;
  prefix: string;
}

export function parseDSN(dsn: string): ParsedDSN {
  const match = dsn.match(/^(s3|r2|b2|gcs|azure):\/\/([^/]+)\/?(.*)$/);
  if (!match) throw new Error(`Invalid backup DSN: ${dsn}`);
  const provider = match[1] as ParsedDSN["provider"];
  const bucket = match[2];
  if (!bucket) throw new Error(`Invalid backup DSN: ${dsn}`);
  if (bucket.includes("@")) throw new Error("Remote backup DSN must not contain inline credentials; use credentialRef");
  const prefix = match[3] ?? "";
  return { provider, bucket, prefix };
}

// ---------------------------------------------------------------------------
// Retry helper
// ---------------------------------------------------------------------------

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseMs = 500,
): Promise<{ result: T; attempts: number }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      return { result, attempts: attempt };
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        await sleep(baseMs * 2 ** (attempt - 1));
      }
    }
  }
  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Upload dispatcher
// ---------------------------------------------------------------------------

export async function uploadBackup(
  archivePath: string,
  dsn: string,
  opts: RemoteAdapterOptions = {},
): Promise<UploadResult> {
  const parsed = parseDSN(dsn);
  const filename = basename(archivePath);
  const key = parsed.prefix ? `${parsed.prefix}/${filename}` : filename;
  const baseMs = opts.retryBaseMs ?? 500;

  try {
    const { attempts } = await withRetry(
      () => dispatchUpload(archivePath, parsed, key, opts),
      3,
      baseMs,
    );
    return { success: true, provider: parsed.provider, key, credentialRef: opts.credentialRef, attempts };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, provider: parsed.provider, key, credentialRef: opts.credentialRef, error, attempts: 3 };
  }
}

async function dispatchUpload(
  archivePath: string,
  parsed: ParsedDSN,
  key: string,
  opts: RemoteAdapterOptions,
): Promise<void> {
  switch (parsed.provider) {
    case "s3":
    case "r2":
    case "b2":
      return uploadS3(archivePath, parsed.bucket, key, opts);
    case "gcs":
      return uploadGCS(archivePath, parsed.bucket, key, opts);
    case "azure":
      return uploadAzure(archivePath, parsed.bucket, key, opts);
    default:
      throw new Error(`Unsupported provider: ${parsed.provider}`);
  }
}

// ---------------------------------------------------------------------------
// S3 / R2 / B2 adapter
// ---------------------------------------------------------------------------

async function uploadS3(
  archivePath: string,
  bucket: string,
  key: string,
  opts: RemoteAdapterOptions,
): Promise<void> {
  if (!opts.s3Put) throw new Error("s3Put not configured");
  const body = createReadStream(archivePath);
  try {
    await opts.s3Put({ Bucket: bucket, Key: key, Body: body });
  } finally {
    body.destroy();
  }
}

// ---------------------------------------------------------------------------
// GCS adapter
// ---------------------------------------------------------------------------

async function uploadGCS(
  archivePath: string,
  _bucket: string,
  _key: string,
  opts: RemoteAdapterOptions,
): Promise<void> {
  if (!opts.gcsSave) throw new Error("gcsSave not configured");
  await opts.gcsSave(archivePath);
}

// ---------------------------------------------------------------------------
// Azure Blob adapter
// ---------------------------------------------------------------------------

async function uploadAzure(
  archivePath: string,
  container: string,
  blobName: string,
  opts: RemoteAdapterOptions,
): Promise<void> {
  if (!opts.azureUpload) throw new Error("azureUpload not configured");
  await opts.azureUpload(container, blobName, archivePath);
}

// ---------------------------------------------------------------------------
// Local pruning: keep only 7 most recent backups
// ---------------------------------------------------------------------------

export const MAX_LOCAL_COPIES = 7;

export async function pruneLocalBackups(backupsDir: string): Promise<string[]> {
  let files: string[];
  try {
    const entries = await readdir(backupsDir);
    files = entries
      .filter((f) => f.endsWith(".tar.gz"))
      .map((f) => join(backupsDir, f))
      .sort(); // lexicographic = chronological if ISO-stamped
  } catch {
    return [];
  }

  if (files.length <= MAX_LOCAL_COPIES) return [];

  const toDelete = files.slice(0, files.length - MAX_LOCAL_COPIES);
  await Promise.all(toDelete.map((f) => unlink(f)));
  return toDelete;
}

// ---------------------------------------------------------------------------
// Event emission helper (thin wrapper — no DB required for unit tests)
// ---------------------------------------------------------------------------

export function makeBackupEvent(result: UploadResult): BackupEvent {
  return {
    kind: result.success ? "backup_upload_succeeded" : "backup_upload_failed",
    payload: {
      provider: result.provider,
      key: result.key,
      ...(result.credentialRef ? { credentialRef: result.credentialRef } : {}),
      ...(result.error ? { error: result.error } : {}),
      attempts: result.attempts,
    },
  };
}
