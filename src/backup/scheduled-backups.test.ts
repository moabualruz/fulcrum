// @ts-nocheck
/**
 * Tests for gated scheduled remote backup with S3/GCS/Azure adapters.
 *
 * Covers:
 * - Flag OFF: task registration skipped; upload returns false.
 * - Flag ON: S3 PutObjectCommand called with correct bucket/key/body.
 * - 5xx (simulated Error) → retry 3× exponential; final failure → Event + doctor fail.
 * - GCS: file.save() mocked.
 * - Azure: upload mocked.
 * - Local pruning: >7 copies → oldest pruned after success.
 * - DSN parsing for s3/r2/b2/gcs/azure schemes.
 *
 * Closes: .scratch/agent-os-vision/17-cross-cutting-platform/issues/19-gated-scheduled-backups.md
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";

import { parseDSN, uploadBackup, pruneLocalBackups, makeBackupEvent, MAX_LOCAL_COPIES, type UploadResult } from "./remote-adapters.ts";
import { createLocalBackup, verifyBackupArchive } from "./runner.ts";
import { runScheduledBackup, shouldRegisterTask } from "./scheduled-task.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpDir(): string {
  const dir = join(tmpdir(), `fulcrum-backup-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return dir;
}

async function makeFakeArchive(dir: string, name: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const p = join(dir, name);
  await writeFile(p, "fake-archive-content");
  return p;
}

async function makeNArchives(dir: string, n: number): Promise<string[]> {
  const paths: string[] = [];
  for (let i = 0; i < n; i++) {
    // zero-pad so lexicographic sort = chronological
    const name = `backup-2024-01-${String(i + 1).padStart(2, "0")}T00-00-00.tar.gz`;
    paths.push(await makeFakeArchive(dir, name));
  }
  return paths;
}

// ---------------------------------------------------------------------------
// DSN parsing
// ---------------------------------------------------------------------------

describe("parseDSN", () => {
  test("s3 scheme", () => {
    expect(parseDSN("s3://my-bucket/backups")).toEqual({ provider: "s3", bucket: "my-bucket", prefix: "backups" });
  });
  test("r2 scheme", () => {
    expect(parseDSN("r2://cf-bucket/prefix")).toEqual({ provider: "r2", bucket: "cf-bucket", prefix: "prefix" });
  });
  test("b2 scheme", () => {
    expect(parseDSN("b2://b2-bucket/logs")).toEqual({ provider: "b2", bucket: "b2-bucket", prefix: "logs" });
  });
  test("gcs scheme", () => {
    expect(parseDSN("gcs://gcs-bucket/bkp")).toEqual({ provider: "gcs", bucket: "gcs-bucket", prefix: "bkp" });
  });
  test("azure scheme", () => {
    expect(parseDSN("azure://container/data")).toEqual({ provider: "azure", bucket: "container", prefix: "data" });
  });
  test("no prefix", () => {
    expect(parseDSN("s3://bucket")).toEqual({ provider: "s3", bucket: "bucket", prefix: "" });
  });
  test("invalid DSN throws", () => {
    expect(() => parseDSN("ftp://bucket/key")).toThrow("Invalid backup DSN");
  });
});

// ---------------------------------------------------------------------------
// makeBackupEvent
// ---------------------------------------------------------------------------

describe("makeBackupEvent", () => {
  test("success result → backup_upload_succeeded", () => {
    const result: UploadResult = { success: true, provider: "s3", key: "bkp/x.tar.gz", attempts: 1 };
    const evt = makeBackupEvent(result);
    expect(evt.kind).toBe("backup_upload_succeeded");
    expect(evt.payload.provider).toBe("s3");
    expect(evt.payload.attempts).toBe(1);
  });
  test("failure result → backup_upload_failed with error", () => {
    const result: UploadResult = { success: false, provider: "gcs", key: "bkp/x.tar.gz", error: "net err", attempts: 3 };
    const evt = makeBackupEvent(result);
    expect(evt.kind).toBe("backup_upload_failed");
    expect(evt.payload.error).toBe("net err");
  });
});

describe("createLocalBackup", () => {
  let dir: string;

  beforeEach(async () => {
    dir = tmpDir();
    await mkdir(dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("writes fulcrum.backup.v1 archive and verifies checksum", async () => {
    const dump = Buffer.from(JSON.stringify({ format: "fulcrum.db-dump.v1", tables: {} }), "utf8").toString("base64");
    const result = await createLocalBackup({
      stateDir: dir,
      tag: "phase09",
      dump,
      entityCounts: { tasks: 2 },
    });

    expect(await readFile(result.archivePath)).toBeDefined();
    const verified = await verifyBackupArchive(result.archivePath);
    expect(verified).toMatchObject({
      ok: true,
      format: "fulcrum.backup.v1",
      entityCounts: { tasks: 2 },
    });
    expect(verified.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// uploadBackup — S3 adapter
// ---------------------------------------------------------------------------

describe("uploadBackup — S3", () => {
  let dir: string;

  beforeEach(async () => {
    dir = tmpDir();
    await mkdir(dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("calls s3Put with correct bucket/key/body", async () => {
    const archive = await makeFakeArchive(dir, "backup-test.tar.gz");
    const calls: Array<{ Bucket: string; Key: string }> = [];
    const s3Put = async (p: { Bucket: string; Key: string; Body: NodeJS.ReadableStream }) => {
      calls.push({ Bucket: p.Bucket, Key: p.Key });
    };

    const result = await uploadBackup(archive, "s3://my-bucket/backups", { s3Put, retryBaseMs: 1 });

    expect(result.success).toBe(true);
    expect(result.provider).toBe("s3");
    expect(calls).toHaveLength(1);
    expect(calls[0].Bucket).toBe("my-bucket");
    expect(calls[0].Key).toBe("backups/backup-test.tar.gz");
    expect(result.attempts).toBe(1);
  });

  test("R2 DSN uses same s3Put adapter", async () => {
    const archive = await makeFakeArchive(dir, "backup-r2.tar.gz");
    const calls: Array<{ Bucket: string }> = [];
    const s3Put = async (p: { Bucket: string; Key: string; Body: NodeJS.ReadableStream }) => {
      calls.push({ Bucket: p.Bucket });
    };
    const result = await uploadBackup(archive, "r2://r2-bucket/prefix", { s3Put, retryBaseMs: 1 });
    expect(result.success).toBe(true);
    expect(result.provider).toBe("r2");
    expect(calls[0].Bucket).toBe("r2-bucket");
  });

  test("B2 DSN uses same s3Put adapter", async () => {
    const archive = await makeFakeArchive(dir, "backup-b2.tar.gz");
    const calls: string[] = [];
    const s3Put = async (p: { Bucket: string; Key: string; Body: NodeJS.ReadableStream }) => {
      calls.push(p.Bucket);
    };
    const result = await uploadBackup(archive, "b2://b2-bucket/prefix", { s3Put, retryBaseMs: 1 });
    expect(result.success).toBe(true);
    expect(result.provider).toBe("b2");
    expect(calls[0]).toBe("b2-bucket");
  });
});

// ---------------------------------------------------------------------------
// uploadBackup — retry behavior (5xx simulation)
// ---------------------------------------------------------------------------

describe("uploadBackup — retry behavior", () => {
  let dir: string;

  beforeEach(async () => {
    dir = tmpDir();
    await mkdir(dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("retries 3× on s3Put error, final failure → error result", async () => {
    const archive = await makeFakeArchive(dir, "backup-retry.tar.gz");
    let callCount = 0;
    const s3Put = async (_p: { Bucket: string; Key: string; Body: NodeJS.ReadableStream }) => {
      callCount++;
      throw new Error("ServiceUnavailable (503)");
    };

    const result = await uploadBackup(archive, "s3://bucket/pfx", { s3Put, retryBaseMs: 1 });

    expect(result.success).toBe(false);
    expect(callCount).toBe(3);
    expect(result.error).toContain("503");
    expect(result.attempts).toBe(3);
  });

  test("succeeds on second attempt after one failure", async () => {
    const archive = await makeFakeArchive(dir, "backup-flaky.tar.gz");
    let callCount = 0;
    const s3Put = async (_p: { Bucket: string; Key: string; Body: NodeJS.ReadableStream }) => {
      callCount++;
      if (callCount === 1) throw new Error("transient 503");
    };

    const result = await uploadBackup(archive, "s3://bucket/pfx", { s3Put, retryBaseMs: 1 });

    expect(result.success).toBe(true);
    expect(callCount).toBe(2);
    expect(result.attempts).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// uploadBackup — GCS adapter
// ---------------------------------------------------------------------------

describe("uploadBackup — GCS", () => {
  let dir: string;

  beforeEach(async () => {
    dir = tmpDir();
    await mkdir(dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("calls gcsSave with archive path", async () => {
    const archive = await makeFakeArchive(dir, "backup-gcs.tar.gz");
    const savedPaths: string[] = [];
    const gcsSave = async (p: string) => { savedPaths.push(p); };

    const result = await uploadBackup(archive, "gcs://gcs-bucket/bkp", { gcsSave, retryBaseMs: 1 });

    expect(result.success).toBe(true);
    expect(result.provider).toBe("gcs");
    expect(savedPaths).toHaveLength(1);
    expect(savedPaths[0]).toBe(archive);
  });
});

// ---------------------------------------------------------------------------
// uploadBackup — Azure adapter
// ---------------------------------------------------------------------------

describe("uploadBackup — Azure", () => {
  let dir: string;

  beforeEach(async () => {
    dir = tmpDir();
    await mkdir(dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("calls azureUpload with container/blobName/path", async () => {
    const archive = await makeFakeArchive(dir, "backup-azure.tar.gz");
    const calls: Array<{ container: string; blob: string; path: string }> = [];
    const azureUpload = async (c: string, b: string, p: string) => { calls.push({ container: c, blob: b, path: p }); };

    const result = await uploadBackup(archive, "azure://my-container/bkp", { azureUpload, retryBaseMs: 1 });

    expect(result.success).toBe(true);
    expect(result.provider).toBe("azure");
    expect(calls[0].container).toBe("my-container");
    expect(calls[0].blob).toBe("bkp/backup-azure.tar.gz");
    expect(calls[0].path).toBe(archive);
  });
});

// ---------------------------------------------------------------------------
// Local pruning
// ---------------------------------------------------------------------------

describe("pruneLocalBackups", () => {
  let dir: string;

  beforeEach(async () => {
    dir = tmpDir();
    await mkdir(dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("≤7 copies → no pruning", async () => {
    await makeNArchives(dir, 7);
    const pruned = await pruneLocalBackups(dir);
    expect(pruned).toHaveLength(0);
    const remaining = await readdir(dir);
    expect(remaining).toHaveLength(7);
  });

  test(">7 copies → oldest pruned, 7 remain", async () => {
    await makeNArchives(dir, 10);
    const pruned = await pruneLocalBackups(dir);
    expect(pruned).toHaveLength(3);
    const remaining = await readdir(dir);
    expect(remaining).toHaveLength(7);
    // Oldest 3 (day 01, 02, 03) should be gone; newest 7 remain
    expect(remaining.every((f) => !pruned.map((p) => p.split("/").pop()).includes(f))).toBe(true);
  });

  test("empty dir → no error, empty result", async () => {
    const pruned = await pruneLocalBackups(dir);
    expect(pruned).toHaveLength(0);
  });

  test("MAX_LOCAL_COPIES is 7", () => {
    expect(MAX_LOCAL_COPIES).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Gating: shouldRegisterTask
// ---------------------------------------------------------------------------

describe("shouldRegisterTask", () => {
  afterEach(() => { delete process.env["FULCRUM_FEATURES"]; });

  test("flag OFF → false", () => {
    delete process.env["FULCRUM_FEATURES"];
    expect(shouldRegisterTask()).toBe(false);
  });

  test("flag ON → true", () => {
    process.env["FULCRUM_FEATURES"] = "scheduled-backups";
    expect(shouldRegisterTask()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runScheduledBackup — end-to-end
// ---------------------------------------------------------------------------

describe("runScheduledBackup", () => {
  let dir: string;

  beforeEach(async () => {
    dir = tmpDir();
    await mkdir(dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env["FULCRUM_FEATURES"];
  });

  test("flag OFF → returns false without uploading", async () => {
    delete process.env["FULCRUM_FEATURES"];
    let uploadCalled = false;
    const result = await runScheduledBackup({
      dsn: "s3://bucket/pfx",
      stateDir: dir,
      adapterOpts: {
        s3Put: async () => { uploadCalled = true; },
        retryBaseMs: 1,
      },
    });
    expect(result).toBe(false);
    expect(uploadCalled).toBe(false);
  });

  test("flag ON: success → emits backup_upload_succeeded + prunes if >7", async () => {
    process.env["FULCRUM_FEATURES"] = "scheduled-backups";
    // Pre-populate 8 archives so pruning triggers
    await makeNArchives(dir, 8);
    const events: Array<{ kind: string }> = [];
    let doctorFailCalled = false;

    const result = await runScheduledBackup({
      dsn: "s3://bucket/pfx",
      stateDir: dir,
      adapterOpts: {
        s3Put: async () => {},
        retryBaseMs: 1,
      },
      emitEvent: (e) => { events.push(e); },
      onDoctorFail: () => { doctorFailCalled = true; },
    });

    expect(result).toBe(true);
    expect(events[0]?.kind).toBe("backup_upload_succeeded");
    expect(doctorFailCalled).toBe(false);
    // After success, pruning runs — should be ≤7 .tar.gz
    const remaining = (await readdir(dir)).filter((f) => f.endsWith(".tar.gz"));
    expect(remaining.length).toBeLessThanOrEqual(7);
  });

  test("flag ON: upload failure → emits backup_upload_failed + doctor fail", async () => {
    process.env["FULCRUM_FEATURES"] = "scheduled-backups";
    const events: Array<{ kind: string }> = [];
    const doctorFailChecks: string[] = [];

    const result = await runScheduledBackup({
      dsn: "s3://bucket/pfx",
      stateDir: dir,
      adapterOpts: {
        s3Put: async () => { throw new Error("503 ServiceUnavailable"); },
        retryBaseMs: 1,
      },
      emitEvent: (e) => { events.push(e); },
      onDoctorFail: (check) => { doctorFailChecks.push(check); },
    });

    expect(result).toBe(false);
    expect(events[0]?.kind).toBe("backup_upload_failed");
    expect(doctorFailChecks).toContain("platform.remote_backup");
  });
});
