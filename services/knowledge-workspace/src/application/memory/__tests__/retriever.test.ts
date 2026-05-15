import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { initTRPC } from "@trpc/server";
import { Container } from "@needle-di/core";

import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { registerDbBindings } from "@platform-core/infrastructure/application-database/db.module.ts";
import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";
import { Memory } from "@platform-core/infrastructure/application-database/entities/memory/Memory.ts";
import type {
  MemoryImportance,
  MemoryKind,
} from "@platform-core/infrastructure/application-database/entities/memory/enums.ts";
import {
  MEMORY_IMPORTANCE_BOOSTS,
  MemoryRepository,
} from "@platform-core/infrastructure/application-database/repositories/memory/MemoryRepository.ts";
import { MemoryRetriever, RetrieverOptsSchema } from "../retriever.ts";

const ORG_A = "00000000-0000-0000-0000-000000000001";
const ORG_B = "00000000-0000-0000-0000-000000000002";
const PROJECT_A = "11111111-1111-1111-1111-111111111111";
const PROJECT_B = "22222222-2222-2222-2222-222222222222";
const BASE_NOW = new Date("2026-05-02T12:00:00.000Z");

let db: TestOrm;

beforeAll(async () => {
  db = await createTestOrm();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  const em = db.orm.em.fork();
  await em.nativeDelete(Memory, {});
  await em.upsert(Org, {
    id: ORG_B,
    name: "Other",
    slug: "other",
    updatedAt: BASE_NOW,
  }, { onConflictFields: ["id"] });
});

describe("MemoryRetriever", () => {
  test("resolves through needle-di and exposes retrieve", () => {
    const retriever = createRetriever();

    expect(retriever).toBeInstanceOf(MemoryRetriever);
    expect(typeof retriever.retrieve).toBe("function");
  });

  test("returns identical top-20 order across 100 calls for a fixed 50-row seed", async () => {
    await seedDeterminismCorpus();
    const retriever = createRetriever();
    const opts = { orgId: ORG_A, projectId: PROJECT_A };

    const first = (await retriever.retrieve("retriever memory", opts)).map((row) => row.id);

    expect(first).toHaveLength(20);
    for (let run = 0; run < 100; run++) {
      const next = (await retriever.retrieve("retriever memory", opts)).map((row) => row.id);
      expect(next).toEqual(first);
    }
  });

  test("ranks newer memory above a 60-day-old memory with identical body", async () => {
    const oldId = "aaaaaaaa-0000-0000-0000-000000000001";
    const newId = "aaaaaaaa-0000-0000-0000-000000000002";
    await seedMemories([
      {
        id: oldId,
        body: "recency retrieval marker",
        createdAt: daysAgo(60),
      },
      {
        id: newId,
        body: "recency retrieval marker",
        createdAt: daysAgo(0),
      },
    ]);

    const rows = await createRetriever().retrieve(
      "recency retrieval marker",
      { orgId: ORG_A, projectId: PROJECT_A, topK: 2 },
    );

    expect(rows.map((row) => row.id)).toEqual([newId, oldId]);
  });

  test("adds an importance boost so high beats medium for same body and age", async () => {
    const mediumId = "bbbbbbbb-0000-0000-0000-000000000001";
    const highId = "bbbbbbbb-0000-0000-0000-000000000002";
    await seedMemories([
      {
        id: mediumId,
        body: "importance retrieval marker",
        importance: "medium",
        createdAt: daysAgo(5),
      },
      {
        id: highId,
        body: "importance retrieval marker",
        importance: "high",
        createdAt: daysAgo(5),
      },
    ]);

    const rows = await createRetriever().retrieve(
      "importance retrieval marker",
      { orgId: ORG_A, projectId: PROJECT_A, topK: 2 },
    );

    expect(rows.map((row) => row.id)).toEqual([highId, mediumId]);
  });

  test("does not boost medium above low when body and age tie", async () => {
    const lowId = "bbbbbbbb-0000-0000-0000-000000000003";
    const mediumId = "bbbbbbbb-0000-0000-0000-000000000004";
    await seedMemories([
      {
        id: mediumId,
        body: "medium low tie marker",
        importance: "medium",
        createdAt: daysAgo(5),
      },
      {
        id: lowId,
        body: "medium low tie marker",
        importance: "low",
        createdAt: daysAgo(5),
      },
    ]);

    const rows = await createRetriever().retrieve(
      "medium low tie marker",
      { orgId: ORG_A, projectId: PROJECT_A, topK: 2 },
    );

    expect(rows.map((row) => row.id)).toEqual([lowId, mediumId]);
  });

  test("uses importance constants: high +1, medium and low +0", () => {
    expect(MEMORY_IMPORTANCE_BOOSTS).toEqual({
      high: 1,
      medium: 0,
      low: 0,
    });
  });

  test("uses a bounded FTS candidate query before hydrating non-empty searches", async () => {
    await seedMemories(Array.from({ length: 30 }, (_, index) => ({
      id: idFor(4, index),
      body: `bounded candidate marker ${index}`,
      createdAt: daysAgo(index),
    })));
    const em = db.orm.em.fork();
    const repo = em.getRepository(Memory) as MemoryRepository;
    const queries: Array<{ getQuery: () => string }> = [];
    const originalCreateQueryBuilder = repo.createQueryBuilder.bind(repo);

    repo.createQueryBuilder = ((alias: string) => {
      const qb = originalCreateQueryBuilder(alias);
      queries.push(qb);
      return qb;
    }) as typeof repo.createQueryBuilder;

    await repo.searchProjectAndGlobal(RetrieverOptsSchema.parse({
      orgId: ORG_A,
      projectId: PROJECT_A,
      query: "bounded candidate marker",
      topK: 3,
    }));

    const sql = queries.map((query) => query.getQuery().toLowerCase()).join("\n");
    expect(sql).toContain("to_tsvector");
    expect(sql).toContain("plainto_tsquery");
    expect(sql).toContain("ts_rank_cd");
    expect(sql).toContain("limit");
  });

  test("uses a bounded candidate query for empty searches", async () => {
    await seedMemories(Array.from({ length: 30 }, (_, index) => ({
      id: idFor(5, index),
      body: `empty candidate marker ${index}`,
      createdAt: daysAgo(index),
    })));
    const em = db.orm.em.fork();
    const repo = em.getRepository(Memory) as MemoryRepository;
    const queries: Array<{ getQuery: () => string }> = [];
    const originalCreateQueryBuilder = repo.createQueryBuilder.bind(repo);

    repo.createQueryBuilder = ((alias: string) => {
      const qb = originalCreateQueryBuilder(alias);
      queries.push(qb);
      return qb;
    }) as typeof repo.createQueryBuilder;

    await repo.searchProjectAndGlobal(RetrieverOptsSchema.parse({
      orgId: ORG_A,
      projectId: PROJECT_A,
      query: "",
      topK: 3,
    }));

    const sql = queries.map((query) => query.getQuery().toLowerCase()).join("\n");
    expect(sql).toContain("limit");
  });

  test("merges project and global scopes and dedupes rows matching both", async () => {
    const projectId = "cccccccc-0000-0000-0000-000000000001";
    const globalId = "cccccccc-0000-0000-0000-000000000002";
    const bothId = "cccccccc-0000-0000-0000-000000000003";
    await seedMemories([
      { id: projectId, body: "scope retrieval project" },
      { id: globalId, body: "scope retrieval global", projectId: null, global: true },
      { id: bothId, body: "scope retrieval both", global: true },
    ]);

    const rows = await createRetriever().retrieve(
      "scope retrieval",
      { orgId: ORG_A, projectId: PROJECT_A, topK: 10 },
    );
    const ids = rows.map((row) => row.id);

    expect(ids).toContain(projectId);
    expect(ids).toContain(globalId);
    expect(ids).toContain(bothId);
    expect(ids.filter((id) => id === bothId)).toHaveLength(1);
  });

  test("excludes archived rows by default and includes them when requested", async () => {
    const activeId = "dddddddd-0000-0000-0000-000000000001";
    const archivedId = "dddddddd-0000-0000-0000-000000000002";
    await seedMemories([
      { id: activeId, body: "archive retrieval active" },
      { id: archivedId, body: "archive retrieval archived", archived: true },
    ]);

    const retriever = createRetriever();
    const baseOpts = { orgId: ORG_A, projectId: PROJECT_A, topK: 10 };
    const defaultIds = (await retriever.retrieve("archive retrieval", baseOpts))
      .map((row) => row.id);
    const archivedIds = (await retriever.retrieve("archive retrieval", {
      ...baseOpts,
      includeArchived: true,
    })).map((row) => row.id);

    expect(defaultIds).toContain(activeId);
    expect(defaultIds).not.toContain(archivedId);
    expect(archivedIds).toContain(archivedId);
  });

  test("isolates organizations even when query and project id match", async () => {
    const orgAId = "eeeeeeee-0000-0000-0000-000000000001";
    const orgBId = "eeeeeeee-0000-0000-0000-000000000002";
    await seedMemories([
      { id: orgAId, body: "tenant retrieval marker", orgId: ORG_A },
      { id: orgBId, body: "tenant retrieval marker", orgId: ORG_B },
    ]);

    const rows = await createRetriever().retrieve(
      "tenant retrieval marker",
      { orgId: ORG_A, projectId: PROJECT_A, topK: 10 },
    );

    expect(rows.map((row) => row.id)).toEqual([orgAId]);
  });

  test("filters by memory kind", async () => {
    const decisionId = "ffffffff-0000-0000-0000-000000000001";
    const noteId = "ffffffff-0000-0000-0000-000000000002";
    await seedMemories([
      { id: decisionId, body: "kind retrieval marker", kind: "decision" },
      { id: noteId, body: "kind retrieval marker", kind: "note" },
    ]);

    const rows = await createRetriever().retrieve(
      "kind retrieval marker",
      { orgId: ORG_A, projectId: PROJECT_A, kinds: ["decision"] },
    );

    expect(rows.map((row) => row.id)).toEqual([decisionId]);
    expect(rows.every((row) => row.kind === "decision")).toBe(true);
  });

  test("exports a Zod schema that round-trips through tRPC input validation", async () => {
    const trpc = initTRPC.create();
    const router = trpc.router({
      validate: trpc.procedure
        .input(RetrieverOptsSchema)
        .query(({ input }) => input),
    });
    const caller = trpc.createCallerFactory(router)({});

    const parsed = RetrieverOptsSchema.parse({
      orgId: ORG_A,
      projectId: PROJECT_A,
      kinds: ["decision"],
    });
    const viaTrpc = await caller.validate({
      orgId: ORG_A,
      projectId: PROJECT_A,
      kinds: ["decision"],
    });

    expect(parsed).toEqual({
      orgId: ORG_A,
      projectId: PROJECT_A,
      query: "",
      topK: 20,
      includeArchived: false,
      kinds: ["decision"],
    });
    expect(viaTrpc).toEqual(parsed);
    expect(() =>
      RetrieverOptsSchema.parse({
        orgId: ORG_A,
        projectId: PROJECT_A,
        kinds: ["unknown"],
      })
    ).toThrow();
  });
});

async function seedDeterminismCorpus(): Promise<void> {
  const rows: MemorySeed[] = [];
  for (let i = 0; i < 23; i++) {
    rows.push({
      id: idFor(1, i),
      projectId: PROJECT_A,
      body: `retriever memory project-a row-${i % 7}`,
      importance: importanceFor(i),
      createdAt: daysAgo(i % 10),
    });
  }
  for (let i = 0; i < 22; i++) {
    rows.push({
      id: idFor(2, i),
      projectId: PROJECT_B,
      body: `retriever memory project-b row-${i % 7}`,
      importance: importanceFor(i),
      createdAt: daysAgo(i % 10),
    });
  }
  for (let i = 0; i < 5; i++) {
    rows.push({
      id: idFor(3, i),
      projectId: null,
      global: true,
      body: `retriever memory global row-${i}`,
      importance: importanceFor(i),
      createdAt: daysAgo(i),
    });
  }
  await seedMemories(rows);
}

interface MemorySeed {
  id: string;
  orgId?: string;
  projectId?: string | null;
  global?: boolean;
  kind?: MemoryKind;
  body: string;
  importance?: MemoryImportance;
  archived?: boolean;
  createdAt?: Date;
}

async function seedMemories(seeds: MemorySeed[]): Promise<void> {
  const em = db.orm.em.fork();
  for (const seed of seeds) {
    const orgId = seed.orgId ?? ORG_A;
    const memory = em.create(Memory, {
      id: seed.id,
      org: em.getReference(Org, orgId),
      projectId: seed.projectId === undefined ? PROJECT_A : seed.projectId,
      global: seed.global ?? false,
      kind: seed.kind ?? "note",
      body: seed.body,
      tags: [],
      importance: seed.importance ?? "medium",
      source: "manual",
      sourceRef: {},
      archived: seed.archived ?? false,
      createdAt: seed.createdAt ?? BASE_NOW,
      updatedAt: seed.createdAt ?? BASE_NOW,
    });
    em.persist(memory);
  }
  await em.flush();
  em.clear();
}

function daysAgo(days: number): Date {
  return new Date(BASE_NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

function importanceFor(index: number): MemoryImportance {
  if (index % 5 === 0) return "high";
  if (index % 5 === 1) return "low";
  return "medium";
}

function idFor(group: number, index: number): string {
  return `${String(group).repeat(8)}-0000-0000-0000-${index.toString().padStart(12, "0")}`;
}

function createRetriever(): MemoryRetriever {
  const container = new Container();
  registerDbBindings(container, db.orm, db.orm.em.fork());
  return container.get(MemoryRetriever);
}
