import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { openPglite } from "./db/pglite.ts";
import { runMigrations } from "./db/migrate.ts";
import { createLocalOrg } from "./store/repositories.ts";
import { _resetFlagCache } from "./feature-flags.ts";
import {
  enqueueMemoryEmbedding,
  enqueueDocEmbedding,
  handleMemoryEmbeddingJob,
  handleDocEmbeddingJob,
  countMemoryEmbeddings,
  countDocEmbeddings,
  getMemoryEmbedding,
  getDocEmbedding,
  checkEmbeddingsSubsystem,
  type EmbedSidecar,
} from "./embeddings.ts";
import { newUlid } from "./ids.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-embeddings-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

afterEach(() => {
  _resetFlagCache();
  delete process.env["FULCRUM_FEATURES"];
});

async function freshDb(name: string) {
  const db = await openPglite(join(scratch, name));
  await runMigrations(db);
  return db;
}

function mockSidecar(dim = 384, modelId = "bge-small-en-v1.5"): EmbedSidecar {
  return {
    async embed(_text: string) {
      return {
        embedding: Array.from({ length: dim }, (_, i) => i * 0.001),
        modelId,
      };
    },
  };
}

function failingSidecar(): EmbedSidecar {
  return {
    async embed(_text: string) {
      throw new Error("sidecar unavailable");
    },
  };
}

async function insertMemory(db: Awaited<ReturnType<typeof freshDb>>, orgId: string): Promise<string> {
  const id = newUlid();
  await db.query(
    `INSERT INTO memories (id, org_id, scope, kind, key, body) VALUES ($1, $2, 'global', 'fact', $3, 'test body')`,
    [id, orgId, `key-${id}`],
  );
  return id;
}

async function insertDoc(db: Awaited<ReturnType<typeof freshDb>>, orgId: string): Promise<string> {
  const id = newUlid();
  await db.query(
    `INSERT INTO documents (id, org_id, kind, title, body) VALUES ($1, $2, 'note', 'Test', 'doc body')`,
    [id, orgId],
  );
  return id;
}

describe("feature-flags", () => {
  test("FULCRUM_FEATURES unset → no embedding jobs enqueued; count stays zero", async () => {
    const db = await freshDb("ff-off");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const memId = await insertMemory(db, org.id);
      const enqueued = await enqueueMemoryEmbedding(db, {
        orgId: org.id,
        memoryId: memId,
        body: "test",
      });
      expect(enqueued).toBe(false);
      expect(await countMemoryEmbeddings(db)).toBe(0);
    } finally {
      await db.close();
    }
  });

  test("FULCRUM_FEATURES=embeddings → job enqueued", async () => {
    process.env["FULCRUM_FEATURES"] = "embeddings";
    _resetFlagCache();
    const db = await freshDb("ff-on");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const memId = await insertMemory(db, org.id);
      const enqueued = await enqueueMemoryEmbedding(db, {
        orgId: org.id,
        memoryId: memId,
        body: "test",
      });
      expect(enqueued).toBe(true);
      // Verify job row exists
      const jobs = await db.query<{ kind: string }>(
        `SELECT kind FROM jobs WHERE kind = 'generate-memory-embedding'`,
      );
      expect(jobs).toHaveLength(1);
    } finally {
      await db.close();
    }
  });
});

describe("memory embedding pipeline", () => {
  test("handler writes embedding with dimension 384 and modelId", async () => {
    const db = await freshDb("mem-write");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const memId = await insertMemory(db, org.id);
      await handleMemoryEmbeddingJob(db, { memoryId: memId, body: "test" }, mockSidecar());
      const row = await getMemoryEmbedding(db, memId);
      expect(row).not.toBeNull();
      expect(row!.model_id).toBe("bge-small-en-v1.5");
      // Verify dimension
      const embRow = await db.query<{ dim: number }>(
        `SELECT array_length(embedding, 1) AS dim FROM memory_embeddings WHERE memory_id = $1`,
        [memId],
      );
      expect(embRow[0]?.dim).toBe(384);
    } finally {
      await db.close();
    }
  });

  test("cascade delete: deleting memory deletes embedding", async () => {
    const db = await freshDb("mem-cascade");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const memId = await insertMemory(db, org.id);
      await handleMemoryEmbeddingJob(db, { memoryId: memId, body: "test" }, mockSidecar());
      expect(await countMemoryEmbeddings(db)).toBe(1);
      await db.query(`DELETE FROM memories WHERE id = $1`, [memId]);
      expect(await countMemoryEmbeddings(db)).toBe(0);
    } finally {
      await db.close();
    }
  });

  test("dimension mismatch → error, no corrupt row", async () => {
    const db = await freshDb("mem-dim-err");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const memId = await insertMemory(db, org.id);
      const badSidecar = mockSidecar(128); // wrong dimension
      await expect(
        handleMemoryEmbeddingJob(db, { memoryId: memId, body: "test" }, badSidecar),
      ).rejects.toThrow("Dimension mismatch");
      expect(await countMemoryEmbeddings(db)).toBe(0);
    } finally {
      await db.close();
    }
  });

  test("sidecar unavailable → error propagated (retry handled by job queue)", async () => {
    const db = await freshDb("mem-fail");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const memId = await insertMemory(db, org.id);
      await expect(
        handleMemoryEmbeddingJob(db, { memoryId: memId, body: "test" }, failingSidecar()),
      ).rejects.toThrow("sidecar unavailable");
      expect(await countMemoryEmbeddings(db)).toBe(0);
    } finally {
      await db.close();
    }
  });

  test("update overwrites existing embedding on same memory_id", async () => {
    const db = await freshDb("mem-upsert");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const memId = await insertMemory(db, org.id);
      await handleMemoryEmbeddingJob(db, { memoryId: memId, body: "v1" }, mockSidecar(384, "model-v1"));
      await handleMemoryEmbeddingJob(db, { memoryId: memId, body: "v2" }, mockSidecar(384, "model-v2"));
      expect(await countMemoryEmbeddings(db)).toBe(1);
      const row = await getMemoryEmbedding(db, memId);
      expect(row!.model_id).toBe("model-v2");
    } finally {
      await db.close();
    }
  });
});

describe("doc embedding pipeline", () => {
  test("handler writes doc embedding with dimension 384", async () => {
    const db = await freshDb("doc-write");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const docId = await insertDoc(db, org.id);
      await handleDocEmbeddingJob(db, { docId, body: "test" }, mockSidecar());
      const row = await getDocEmbedding(db, docId);
      expect(row).not.toBeNull();
      expect(row!.model_id).toBe("bge-small-en-v1.5");
      const embRow = await db.query<{ dim: number }>(
        `SELECT array_length(embedding, 1) AS dim FROM doc_embeddings WHERE doc_id = $1`,
        [docId],
      );
      expect(embRow[0]?.dim).toBe(384);
    } finally {
      await db.close();
    }
  });

  test("doc enqueue gated by flag", async () => {
    const db = await freshDb("doc-gate");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const docId = await insertDoc(db, org.id);

      // Flag off
      const off = await enqueueDocEmbedding(db, { orgId: org.id, docId, body: "test" });
      expect(off).toBe(false);

      // Flag on
      process.env["FULCRUM_FEATURES"] = "embeddings";
      _resetFlagCache();
      const on = await enqueueDocEmbedding(db, { orgId: org.id, docId, body: "test" });
      expect(on).toBe(true);
      const jobs = await db.query<{ kind: string }>(
        `SELECT kind FROM jobs WHERE kind = 'generate-doc-embedding'`,
      );
      expect(jobs).toHaveLength(1);
    } finally {
      await db.close();
    }
  });
});

describe("doctor embeddings subsystem", () => {
  test("flag off → status disabled", async () => {
    const db = await freshDb("doc-disabled");
    try {
      const report = await checkEmbeddingsSubsystem(db);
      expect(report.flag).toBe("off");
      expect(report.status).toBe("disabled");
      expect(report.memoryEmbeddingCount).toBe(0);
      expect(report.docEmbeddingCount).toBe(0);
      expect(report.hnswMetadata).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("flag on + embeddings present → status ok", async () => {
    process.env["FULCRUM_FEATURES"] = "embeddings";
    _resetFlagCache();
    const db = await freshDb("doc-ok");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const memId = await insertMemory(db, org.id);
      await handleMemoryEmbeddingJob(db, { memoryId: memId, body: "test" }, mockSidecar());
      const report = await checkEmbeddingsSubsystem(db);
      expect(report.flag).toBe("on");
      expect(report.status).toBe("ok");
      expect(report.memoryEmbeddingCount).toBe(1);
      expect(report.hnswMetadata).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("flag on + no embeddings → status degraded", async () => {
    process.env["FULCRUM_FEATURES"] = "embeddings";
    _resetFlagCache();
    const db = await freshDb("doc-degraded");
    try {
      const report = await checkEmbeddingsSubsystem(db);
      expect(report.flag).toBe("on");
      expect(report.status).toBe("degraded");
    } finally {
      await db.close();
    }
  });
});
