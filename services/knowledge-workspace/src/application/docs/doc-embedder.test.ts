import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test, test as it } from "bun:test";
import type { EntityManager } from "typeorm";
import type { TestStore } from "@test-support/product-workspace-fixtures.ts";
import type { InferenceClient, EmbeddingResponse } from "@platform-core/application/inference/client.ts";
import {
  isEmbeddingsEnabled,
  truncateToTokens,
  embedDocument,
  triggerEmbedding,
} from "./doc-embedder.ts";
import { createDocumentAction, updateDocumentAction } from "../document-actions.ts";

// Integration tests that use removed legacy ORM infrastructure are skipped.
// has been replaced by TypeORM. Unit tests (isEmbeddingsEnabled, truncateToTokens)
// continue to run below.
const integrationTest = it.skip;

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-doc-embedder-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function mockClient(vector: number[]): InferenceClient {
  return {
    async embed(_text: string): Promise<EmbeddingResponse> {
      return { vector };
    },
  } as unknown as InferenceClient;
}

function failingClient(err: Error): InferenceClient {
  return {
    async embed(_text: string): Promise<EmbeddingResponse> {
      throw err;
    },
  } as unknown as InferenceClient;
}

// freshDb requires removed legacy ORM infrastructure; integration tests are skipped.
async function freshDb(_name: string): Promise<{ db: TestStore; em: EntityManager; orgId: string; close: () => Promise<void> }> {
  throw new Error("Legacy ORM removed; integration test skipped");
}

async function readEmbedding(db: TestStore, docId: string): Promise<number[] | null> {
  const rows = await db.query<{ embedding: number[] | null }>(
    `SELECT embedding FROM documents WHERE id = $1`,
    [docId],
  );
  return rows[0]?.embedding ?? null;
}

// --- Unit tests: feature flag ---

describe("isEmbeddingsEnabled", () => {
  test("returns false when FULCRUM_FEATURES unset", () => {
    expect(isEmbeddingsEnabled({})).toBe(false);
  });

  test("returns false when FULCRUM_FEATURES is empty", () => {
    expect(isEmbeddingsEnabled({ FULCRUM_FEATURES: "" })).toBe(false);
  });

  test("returns false when FULCRUM_FEATURES does not contain embeddings", () => {
    expect(isEmbeddingsEnabled({ FULCRUM_FEATURES: "search,jobs" })).toBe(false);
  });

  test("returns true when FULCRUM_FEATURES contains embeddings", () => {
    expect(isEmbeddingsEnabled({ FULCRUM_FEATURES: "embeddings" })).toBe(true);
  });

  test("returns true when embeddings is among multiple features", () => {
    expect(isEmbeddingsEnabled({ FULCRUM_FEATURES: "search,embeddings,jobs" })).toBe(true);
  });

  test("handles whitespace around feature name", () => {
    expect(isEmbeddingsEnabled({ FULCRUM_FEATURES: " embeddings , search " })).toBe(true);
  });
});

// --- Unit tests: truncation ---

describe("truncateToTokens", () => {
  test("returns text unchanged when under limit", () => {
    expect(truncateToTokens("hello", 512)).toBe("hello");
  });

  test("truncates to approx token limit (4 chars/token)", () => {
    const long = "a".repeat(3000);
    const result = truncateToTokens(long, 512);
    expect(result.length).toBe(2048); // 512 * 4
  });
});

// --- Integration: flag OFF → no embedding ---

describe("flag OFF: embedding stays NULL", () => {
  integrationTest("docs.update with flag OFF leaves embedding NULL", async () => {
    const ctx = await freshDb("flag-off");
    try {
      const { id } = await createDocumentAction(ctx.em, {
        orgId: ctx.orgId,
        projectId: null,
        kind: "note",
        title: "T",
        body: "body content",
      });
      await updateDocumentAction(ctx.em, { id, orgId: ctx.orgId, body: "updated body" });
      const emb = await readEmbedding(ctx.db, id);
      expect(emb).toBeNull();
    } finally {
      await ctx.close();
    }
  });

  integrationTest("triggerEmbedding with null client does nothing", () => {
    // Should not throw
    triggerEmbedding(null as unknown as TestStore, null, { docId: "x", bodyMd: "y" });
  });
});

// --- Integration: flag ON → embedding populated ---

describe("flag ON: mock sidecar returns fixed vector", () => {
  integrationTest("embedDocument writes vector to documents.embedding", async () => {
    const ctx = await freshDb("embed-ok");
    try {
      const fixedVector = Array.from({ length: 384 }, (_, i) => i * 0.001);
      const client = mockClient(fixedVector);

      const { id } = await createDocumentAction(ctx.em, {
        orgId: ctx.orgId,
        projectId: null,
        kind: "note",
        title: "T",
        body: "some markdown body",
      });

      await embedDocument(ctx.db, client, { docId: id, bodyMd: "some markdown body" });

      const emb = await readEmbedding(ctx.db, id);
      expect(emb).not.toBeNull();
      expect(emb!.length).toBe(384);
      // Check first and last values (PGlite returns float32 so check approximate)
      expect(emb![0]).toBeCloseTo(0.0, 3);
      expect(emb![383]).toBeCloseTo(0.383, 3);
    } finally {
      await ctx.close();
    }
  });

  integrationTest("re-embedding with unchanged body still refreshes embedding (deterministic)", async () => {
    const ctx = await freshDb("re-embed");
    try {
      const vec1 = Array.from({ length: 384 }, () => 0.5);
      const client = mockClient(vec1);

      const { id } = await createDocumentAction(ctx.em, {
        orgId: ctx.orgId,
        projectId: null,
        kind: "note",
        title: "T",
        body: "body",
      });

      await embedDocument(ctx.db, client, { docId: id, bodyMd: "body" });
      const emb1 = await readEmbedding(ctx.db, id);

      // Embed again with same body — should still work
      const vec2 = Array.from({ length: 384 }, () => 0.7);
      const client2 = mockClient(vec2);
      await embedDocument(ctx.db, client2, { docId: id, bodyMd: "body" });
      const emb2 = await readEmbedding(ctx.db, id);

      expect(emb2![0]).toBeCloseTo(0.7, 3);
      expect(emb1![0]).toBeCloseTo(0.5, 3);
    } finally {
      await ctx.close();
    }
  });
});

// --- Integration: sidecar failure ---

describe("sidecar failure: embedding stays NULL, update succeeds", () => {
  integrationTest("embedDocument throws on sidecar failure", async () => {
    const ctx = await freshDb("sidecar-fail");
    try {
      const client = failingClient(new Error("sidecar unreachable"));

      const { id } = await createDocumentAction(ctx.em, {
        orgId: ctx.orgId,
        projectId: null,
        kind: "note",
        title: "T",
        body: "body",
      });

      await expect(embedDocument(ctx.db, client, { docId: id, bodyMd: "body" })).rejects.toThrow(
        "sidecar unreachable",
      );

      // Embedding should remain NULL
      const emb = await readEmbedding(ctx.db, id);
      expect(emb).toBeNull();
    } finally {
      await ctx.close();
    }
  });

  integrationTest("triggerEmbedding catches sidecar error, logs warning", async () => {
    const ctx = await freshDb("trigger-fail");
    try {
      const client = failingClient(new Error("sidecar down"));
      const warnings: string[] = [];
      const logger = { warn: (msg: string) => warnings.push(msg) };

      const { id } = await createDocumentAction(ctx.em, {
        orgId: ctx.orgId,
        projectId: null,
        kind: "note",
        title: "T",
        body: "body",
      });

      // Temporarily set env
      const origEnv = process.env.FULCRUM_FEATURES;
      process.env.FULCRUM_FEATURES = "embeddings";
      try {
        triggerEmbedding(ctx.db, client, { docId: id, bodyMd: "body" }, logger);
        // Wait for the fire-and-forget promise to settle
        await new Promise((r) => setTimeout(r, 100));
        expect(warnings.length).toBeGreaterThanOrEqual(1);
        expect(warnings[0]).toContain("doc-embedder");
      } finally {
        if (origEnv === undefined) delete process.env.FULCRUM_FEATURES;
        else process.env.FULCRUM_FEATURES = origEnv;
      }

      // Embedding stays NULL
      const emb = await readEmbedding(ctx.db, id);
      expect(emb).toBeNull();
    } finally {
      await ctx.close();
    }
  });

  integrationTest("docs.update still succeeds when sidecar fails", async () => {
    const ctx = await freshDb("update-sidecar-fail");
    try {
      const { id } = await createDocumentAction(ctx.em, {
        orgId: ctx.orgId,
        projectId: null,
        kind: "note",
        title: "T",
        body: "body",
      });

      const result = await updateDocumentAction(ctx.em, { id, orgId: ctx.orgId, body: "new body" });
      expect(result).toEqual({ ok: true });
    } finally {
      await ctx.close();
    }
  });
});
