import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { EntityName } from "typeorm";
import type { EntityManager } from "typeorm";

import { createTestOrm } from "@test-support/application-database.ts";
import { DEFAULT_ORG_ID } from "./seed.ts";
import { ModelCache, ProviderCredential } from "./entities/inference/index.ts";
import { Document } from "./entities/docs/Document.ts";
import { Memory } from "./entities/memory/Memory.ts";
import { SearchDocument } from "./entities/search/SearchDocument.ts";
import { Org } from "./entities/auth/Org.ts";

function metadataFor(em: EntityManager, entity: EntityName<unknown>) {
  return em.getMetadata().get(entity) as unknown as {
    tableName: string;
    properties: Record<string, {
      fieldNames?: string[];
      length?: number;
      nullable?: boolean;
      customType?: { constructor: { name: string } };
    }>;
  };
}

function expectEmbeddingProperty(
  em: EntityManager,
  entity: EntityName<unknown>,
) {
  const meta = metadataFor(em, entity);
  const embedding = meta.properties["embedding"];

  expect(embedding).toBeDefined();
  expect(embedding?.fieldNames).toEqual(["embedding"]);
  expect(embedding?.length).toBe(384);
  expect(embedding?.nullable).toBe(true);
  expect(embedding?.customType?.constructor.name).toBe("VectorType");
}

describe("inference cache schema", () => {
  test("metadata exposes model cache, provider credentials, and 384-dim embedding columns", async () => {
    const db = await createTestOrm();
    try {
      const modelCache = metadataFor(db.em, ModelCache);
      const credentials = metadataFor(db.em, ProviderCredential);

      expect(modelCache.tableName).toBe("model_cache");
      expect(modelCache.properties["org"]?.fieldNames).toEqual(["org_id"]);
      expect(credentials.tableName).toBe("provider_credentials");
      expect(credentials.properties["org"]?.fieldNames).toEqual(["org_id"]);
      expectEmbeddingProperty(db.em, Memory);
      expectEmbeddingProperty(db.em, SearchDocument);
      expectEmbeddingProperty(db.em, Document);
    } finally {
      await db.close();
    }
  });

  test("model cache, provider credentials, and embedding properties round-trip through PGlite", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const org = await em.findOneOrFail(Org, { id: DEFAULT_ORG_ID });
      const model = em.create(ModelCache, {
        org,
        modelId: "BAAI/bge-small-en-v1.5",
        kind: "embed",
        source: "huggingface",
        localPath: "/tmp/bge-small-en-v1.5",
        sizeBytes: 67_000_000n,
        sha256: "a".repeat(64),
        downloaded: true,
        active: true,
      });
      const credential = em.create(ProviderCredential, {
        org,
        provider: "openai-compatible",
        baseUrl: "https://llm.example.test/v1",
        secretRef: "fulcrum://secret/inference/openai-compatible",
        active: true,
      });
      const memory = em.create(Memory, {
        id: randomUUID(),
        org,
        kind: "note",
        body: "Embedding memory",
        source: "manual",
        embedding: [0.1, 0.2, 0.3],
      });
      const documentId = randomUUID();
      const document = em.create(Document, {
        id: documentId,
        org,
        bodyMd: "Embedding doc",
        embedding: [0.4, 0.5, 0.6],
      });
      const searchDocument = em.create(SearchDocument, {
        id: randomUUID(),
        org,
        entityKind: "document",
        entityId: documentId,
        embedding: [0.7, 0.8, 0.9],
      });

      em.persist([model, credential, memory, document, searchDocument]);
      await em.flush();
      em.clear();

      const savedModel = await em.findOneOrFail(ModelCache, { modelId: "BAAI/bge-small-en-v1.5" });
      const savedCredential = await em.findOneOrFail(ProviderCredential, {
        baseUrl: "https://llm.example.test/v1",
      });
      const savedMemory = await em.findOneOrFail(Memory, { id: memory.id });
      const savedDocument = await em.findOneOrFail(Document, { id: document.id });
      const savedSearchDocument = await em.findOneOrFail(SearchDocument, { id: searchDocument.id });

      expect(savedModel.downloaded).toBe(true);
      expect(savedCredential.active).toBe(true);
      expect(savedMemory.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(savedDocument.embedding).toEqual([0.4, 0.5, 0.6]);
      expect(savedSearchDocument.embedding).toEqual([0.7, 0.8, 0.9]);

      em.remove([savedModel, savedCredential, savedMemory, savedDocument, savedSearchDocument]);
      await em.flush();
      expect(await em.findOne(ModelCache, { modelId: "BAAI/bge-small-en-v1.5" })).toBeNull();
    } finally {
      await db.close();
    }
  });

  test("down migration removes inference tables and embedding columns", async () => {
    const db = await createTestOrm();
    try {
      await db.orm.migrator.down({ to: "Migration20260502070200_docs_related_tables" });

      const tables = await db.pglite.query<{ table_name: string }>(
        `select table_name from information_schema.tables where table_schema = 'public' and table_name in ('model_cache', 'provider_credentials')`,
      );
      const documentColumns = await db.pglite.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'documents' and column_name = 'embedding'`,
      );

      expect(tables.rows).toEqual([]);
      expect(documentColumns.rows).toEqual([]);
    } finally {
      await db.close();
    }
  });
});
