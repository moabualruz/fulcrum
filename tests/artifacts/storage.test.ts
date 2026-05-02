import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createReadStream, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";

import {
  ArtifactStorageFullError,
  LocalFsBackend,
  createStorageBackend,
  resolveArtifactStoreRoot,
  type ArtifactStorageEvent,
} from "../../src/artifacts/storage.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "fulcrum-artifacts-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  delete process.env.FULCRUM_ARTIFACT_STORE;
});

async function readStream(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe("LocalFsBackend", () => {
  it("puts, gets, deletes, and checks org-scoped artifact files", async () => {
    const source = join(root, "source.txt");
    writeFileSync(source, "artifact bytes");
    const backend = new LocalFsBackend({ root });

    const stored = await backend.put({
      orgSlug: "acme",
      projectSlug: "fulcrum",
      runId: "run_01",
      filename: "result.txt",
      source,
    });

    expect(stored.relativePath).toBe("acme/fulcrum/run_01/result.txt");
    expect(stored.absolutePath).toBe(join(root, "acme", "fulcrum", "run_01", "result.txt"));
    expect(await readFile(stored.absolutePath, "utf8")).toBe("artifact bytes");
    expect(await backend.exists(stored.relativePath)).toBe(true);

    const got = await readStream(await backend.get(stored.relativePath));
    expect(got.toString("utf8")).toBe("artifact bytes");

    await backend.delete(stored.relativePath);
    expect(await backend.exists(stored.relativePath)).toBe(false);
  });

  it("defaults missing project and run scopes to global/manual path segments", async () => {
    const source = join(root, "manual.bin");
    writeFileSync(source, "manual");
    const backend = new LocalFsBackend({ root });

    const stored = await backend.put({
      orgSlug: "org",
      filename: "manual.bin",
      source: createReadStream(source),
    });

    expect(stored.relativePath).toBe("org/global/manual/manual.bin");
  });

  it("appends a ULID-shaped suffix before the extension on collision", async () => {
    const first = join(root, "first.txt");
    const second = join(root, "second.txt");
    writeFileSync(first, "one");
    writeFileSync(second, "two");
    const backend = new LocalFsBackend({ root });

    const a = await backend.put({
      orgSlug: "acme",
      projectSlug: "fulcrum",
      runId: "run_01",
      filename: "result.txt",
      source: first,
    });
    const b = await backend.put({
      orgSlug: "acme",
      projectSlug: "fulcrum",
      runId: "run_01",
      filename: "result.txt",
      source: second,
    });

    expect(a.relativePath).toBe("acme/fulcrum/run_01/result.txt");
    expect(b.relativePath).toMatch(/^acme\/fulcrum\/run_01\/result_[0-9A-HJKMNP-TV-Z]{26}\.txt$/);
    expect(await readFile(b.absolutePath, "utf8")).toBe("two");
  });

  it("cleans a partial file and emits artifact.harvest.failed when disk fills", async () => {
    const source = join(root, "source.txt");
    writeFileSync(source, "artifact bytes");
    const events: ArtifactStorageEvent[] = [];
    const backend = new LocalFsBackend({
      root,
      openWriteStream: () => {
        const stream = new Writable({
          write(_chunk, _encoding, callback) {
            const err = new Error("disk full") as NodeJS.ErrnoException;
            err.code = "ENOSPC";
            callback(err);
          },
        });
        return stream as never;
      },
      emit: (event) => events.push(event),
    });

    await expect(
      backend.put({
        orgSlug: "acme",
        projectSlug: "fulcrum",
        runId: "run_01",
        filename: "full.txt",
        source,
      }),
    ).rejects.toBeInstanceOf(ArtifactStorageFullError);

    const dir = join(root, "acme", "fulcrum", "run_01");
    expect(existsSync(join(dir, "full.txt"))).toBe(false);
    expect(await readdir(dir)).toEqual([]);
    expect(events).toEqual([
      {
        name: "artifact.harvest.failed",
        code: "ARTIFACT_DISK_FULL",
        relativePath: "acme/fulcrum/run_01/full.txt",
      },
    ]);
  });
});

describe("artifact storage factory", () => {
  it("resolves FULCRUM_ARTIFACT_STORE or defaults to ~/.fulcrum/artifacts", () => {
    process.env.FULCRUM_ARTIFACT_STORE = join(root, "env-store");
    expect(resolveArtifactStoreRoot()).toBe(join(root, "env-store"));

    delete process.env.FULCRUM_ARTIFACT_STORE;
    expect(resolveArtifactStoreRoot()).toMatch(/\/\.fulcrum\/artifacts$/);
  });

  it("uses local filesystem by default and keeps S3 gated off", () => {
    expect(createStorageBackend({ root })).toBeInstanceOf(LocalFsBackend);
    expect(createStorageBackend({ root, s3Enabled: false })).toBeInstanceOf(LocalFsBackend);
    expect(() => createStorageBackend({ root, s3Enabled: true })).toThrow(
      "S3 artifact storage is gated and not enabled in this build.",
    );
  });
});
