import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import type { StorageBackend } from "./storage.ts";
import { LocalFsBackend } from "./storage.ts";
import { S3Backend } from "./s3-backend.ts";
import { AzureBackend } from "./azure-backend.ts";
import { GcsBackend } from "./gcs-backend.ts";
import { createStorageBackend } from "./storage-factory.ts";

// ── LocalFsBackend ─────────────────────────────────────────────────

describe("LocalFsBackend", () => {
  const scratch = mkdtempSync(join(tmpdir(), "fulcrum-storage-"));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  let backend: StorageBackend;
  beforeEach(() => {
    backend = new LocalFsBackend(scratch);
  });

  test("put + get round-trip", async () => {
    const data = Buffer.from("hello artifacts");
    await backend.put("org/proj/run1/file.txt", data);
    const result = await backend.get("org/proj/run1/file.txt");
    expect(result).toEqual(data);
  });

  test("exists returns false for missing key", async () => {
    expect(await backend.exists("nonexistent/key")).toBe(false);
  });

  test("exists returns true after put", async () => {
    await backend.put("org/proj/run1/check.txt", Buffer.from("x"));
    expect(await backend.exists("org/proj/run1/check.txt")).toBe(true);
  });

  test("delete removes file", async () => {
    await backend.put("org/proj/run1/del.txt", Buffer.from("bye"));
    await backend.delete("org/proj/run1/del.txt");
    expect(await backend.exists("org/proj/run1/del.txt")).toBe(false);
  });

  test("get throws on missing key", async () => {
    expect(backend.get("no/such/key")).rejects.toThrow();
  });

  test("delete on missing key does not throw", async () => {
    // idempotent delete
    await backend.delete("no/such/key");
  });

  test("name returns 'local-fs'", () => {
    expect(backend.name).toBe("local-fs");
  });
});

// ── S3Backend (mock SDK) ───────────────────────────────────────────

describe("S3Backend", () => {
  const store = new Map<string, Buffer>();

  // Mock S3Client-like object
  const mockClient = {
    send: async (cmd: { constructor: { name: string }; input?: Record<string, unknown> }) => {
      const name = cmd.constructor.name;
      if (name === "PutObjectCommand") {
        store.set(cmd.input!["Key"] as string, Buffer.from(cmd.input!["Body"] as Uint8Array));
        return {};
      }
      if (name === "GetObjectCommand") {
        const key = cmd.input!["Key"] as string;
        if (!store.has(key)) {
          const err = new Error("NoSuchKey");
          (err as any).name = "NoSuchKey";
          throw err;
        }
        return {
          Body: {
            transformToByteArray: async () => new Uint8Array(store.get(key)!),
          },
        };
      }
      if (name === "DeleteObjectCommand") {
        store.delete(cmd.input!["Key"] as string);
        return {};
      }
      if (name === "HeadObjectCommand") {
        if (!store.has(cmd.input!["Key"] as string)) {
          const err = new Error("NotFound");
          (err as any).name = "NotFound";
          throw err;
        }
        return {};
      }
      throw new Error(`unexpected command: ${name}`);
    },
  };

  let backend: S3Backend;

  beforeEach(() => {
    store.clear();
    backend = S3Backend.fromMockClient(mockClient as any, "test-bucket");
  });

  test("put + get round-trip", async () => {
    const data = Buffer.from("s3 data");
    await backend.put("key/file.bin", data);
    const result = await backend.get("key/file.bin");
    expect(Buffer.from(result)).toEqual(data);
  });

  test("exists false for missing", async () => {
    expect(await backend.exists("nope")).toBe(false);
  });

  test("exists true after put", async () => {
    await backend.put("k", Buffer.from("v"));
    expect(await backend.exists("k")).toBe(true);
  });

  test("delete removes object", async () => {
    await backend.put("k", Buffer.from("v"));
    await backend.delete("k");
    expect(await backend.exists("k")).toBe(false);
  });

  test("name returns 's3'", () => {
    expect(backend.name).toBe("s3");
  });

  test("retry on network error (3 attempts)", async () => {
    let attempts = 0;
    const failClient = {
      send: async (cmd: any) => {
        attempts++;
        if (attempts < 3) {
          const err = new Error("NetworkingError");
          (err as any).name = "NetworkingError";
          throw err;
        }
        store.set(cmd.input["Key"], Buffer.from(cmd.input["Body"]));
        return {};
      },
    };
    const b = S3Backend.fromMockClient(failClient as any, "test-bucket");
    await b.put("retry-key", Buffer.from("ok"));
    expect(attempts).toBe(3);
    expect(store.has("retry-key")).toBe(true);
  });
});

// ── AzureBackend (mock SDK) ────────────────────────────────────────

describe("AzureBackend", () => {
  const store = new Map<string, Buffer>();

  const mockContainerClient = {
    getBlockBlobClient: (key: string) => ({
      upload: async (data: Buffer, size: number) => {
        store.set(key, Buffer.from(data));
      },
      downloadToBuffer: async () => {
        if (!store.has(key)) throw new Error("BlobNotFound");
        return store.get(key)!;
      },
      delete: async () => {
        store.delete(key);
      },
      exists: async () => store.has(key),
    }),
  };

  let backend: AzureBackend;

  beforeEach(() => {
    store.clear();
    backend = AzureBackend.fromMockClient(mockContainerClient as any);
  });

  test("put + get round-trip", async () => {
    const data = Buffer.from("azure data");
    await backend.put("a/b/c.txt", data);
    const result = await backend.get("a/b/c.txt");
    expect(Buffer.from(result)).toEqual(data);
  });

  test("exists", async () => {
    expect(await backend.exists("x")).toBe(false);
    await backend.put("x", Buffer.from("y"));
    expect(await backend.exists("x")).toBe(true);
  });

  test("delete", async () => {
    await backend.put("x", Buffer.from("y"));
    await backend.delete("x");
    expect(await backend.exists("x")).toBe(false);
  });

  test("name returns 'azure'", () => {
    expect(backend.name).toBe("azure");
  });

  test("retry on network error", async () => {
    let attempts = 0;
    const failContainer = {
      getBlockBlobClient: (key: string) => ({
        upload: async (data: Buffer) => {
          attempts++;
          if (attempts < 3) throw new Error("NetworkError");
          store.set(key, Buffer.from(data));
        },
      }),
    };
    const b = AzureBackend.fromMockClient(failContainer as any);
    await b.put("retry", Buffer.from("ok"));
    expect(attempts).toBe(3);
  });
});

// ── GcsBackend (mock SDK) ──────────────────────────────────────────

describe("GcsBackend", () => {
  const store = new Map<string, Buffer>();

  const mockBucket = {
    file: (key: string) => ({
      save: async (data: Buffer) => {
        store.set(key, Buffer.from(data));
      },
      download: async () => {
        if (!store.has(key)) throw new Error("NotFound");
        return [store.get(key)!];
      },
      delete: async () => {
        store.delete(key);
      },
      exists: async () => [store.has(key)],
    }),
  };

  let backend: GcsBackend;

  beforeEach(() => {
    store.clear();
    backend = GcsBackend.fromMockBucket(mockBucket as any);
  });

  test("put + get round-trip", async () => {
    const data = Buffer.from("gcs data");
    await backend.put("g/h/i.txt", data);
    const result = await backend.get("g/h/i.txt");
    expect(Buffer.from(result)).toEqual(data);
  });

  test("exists", async () => {
    expect(await backend.exists("z")).toBe(false);
    await backend.put("z", Buffer.from("w"));
    expect(await backend.exists("z")).toBe(true);
  });

  test("delete", async () => {
    await backend.put("z", Buffer.from("w"));
    await backend.delete("z");
    expect(await backend.exists("z")).toBe(false);
  });

  test("name returns 'gcs'", () => {
    expect(backend.name).toBe("gcs");
  });

  test("retry on network error", async () => {
    let attempts = 0;
    const failBucket = {
      file: (key: string) => ({
        save: async (data: Buffer) => {
          attempts++;
          if (attempts < 3) throw new Error("NetworkError");
          store.set(key, Buffer.from(data));
        },
      }),
    };
    const b = GcsBackend.fromMockBucket(failBucket as any);
    await b.put("retry", Buffer.from("ok"));
    expect(attempts).toBe(3);
  });
});

// ── Factory ────────────────────────────────────────────────────────

describe("createStorageBackend", () => {
  const scratch = mkdtempSync(join(tmpdir(), "fulcrum-factory-"));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  test("no flags → LocalFsBackend", () => {
    const b = createStorageBackend({}, scratch);
    expect(b.name).toBe("local-fs");
  });

  test("external-storage-s3 flag → S3Backend", () => {
    const b = createStorageBackend(
      { "external-storage-s3": true },
      scratch,
      {
        s3: { endpoint: "http://localhost:9000", bucket: "test", accessKey: "key", secretKey: "secret" },
      },
    );
    expect(b.name).toBe("s3");
  });

  test("external-storage-azure flag → AzureBackend", () => {
    const b = createStorageBackend(
      { "external-storage-azure": true },
      scratch,
      {
        azure: { connectionString: "DefaultEndpointsProtocol=https;...", container: "artifacts" },
      },
    );
    expect(b.name).toBe("azure");
  });

  test("external-storage-gcs flag → GcsBackend", () => {
    const b = createStorageBackend(
      { "external-storage-gcs": true },
      scratch,
      {
        gcs: { bucket: "my-bucket", keyFile: "/tmp/key.json" },
      },
    );
    expect(b.name).toBe("gcs");
  });

  test("priority: s3 > azure > gcs (first enabled wins)", () => {
    const b = createStorageBackend(
      { "external-storage-s3": true, "external-storage-azure": true, "external-storage-gcs": true },
      scratch,
      {
        s3: { endpoint: "http://localhost:9000", bucket: "test", accessKey: "k", secretKey: "s" },
        azure: { connectionString: "x", container: "y" },
        gcs: { bucket: "z", keyFile: "/tmp/k.json" },
      },
    );
    expect(b.name).toBe("s3");
  });

  test("flag ON but no config → throws", () => {
    expect(() =>
      createStorageBackend({ "external-storage-s3": true }, scratch),
    ).toThrow(/S3 config required/);
  });
});
