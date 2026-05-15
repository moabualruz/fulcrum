import { afterEach, describe, expect, test } from "bun:test";

import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";
import { SearchDocument } from "@platform-core/infrastructure/application-database/entities/search/SearchDocument.ts";
import { createTestOrm, type TestOrm } from "@test-support/index.ts";
import { listSavedSearches, saveSearch, searchDocuments } from "@knowledge-workspace/application/search/queries.ts";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

describe("scoped workflow scoped search", () => {
  test("defaults to current project but can explicitly search all projects and global docs", async () => {
    db = await createTestOrm();
    const em = db.em.fork();
    const currentProjectId = `project-${crypto.randomUUID()}`;
    const otherProjectId = `project-${crypto.randomUUID()}`;
    const phrase = `workflow-${crypto.randomUUID()}`;

    for (const row of [
      { entityId: "current-task", title: `Current ${phrase}`, projectId: currentProjectId },
      { entityId: "other-task", title: `Other ${phrase}`, projectId: otherProjectId },
      { entityId: "global-doc", title: `Global ${phrase}`, projectId: null },
    ]) {
      em.persist(em.create(SearchDocument, {
        org: em.getReference(Org, db.seed.orgId),
        entityKind: "task",
        entityId: row.entityId,
        title: row.title,
        body: `Indexed ${phrase}`,
        projectId: row.projectId,
        status: "open",
        labels: ["workflow"],
        metadata: { linkedCounts: { docs: 1, runs: 2 } },
        updatedAt: new Date("2026-05-08T00:00:00.000Z"),
      }));
    }
    await em.flush();

    const current = await searchDocuments(db.em.fork(), phrase, {
      orgId: db.seed.orgId,
      projectId: currentProjectId,
      scope: "current",
      limit: 10,
    });
    expect(current.map((hit) => hit.source_id)).toEqual(["current-task"]);
    expect(current[0]).toMatchObject({
      projectId: currentProjectId,
      scope: "project",
      provenance: {
        entityKind: "task",
        entityId: "current-task",
        projectId: currentProjectId,
      },
      linkedCounts: { docs: 1, runs: 2, artifacts: 0, memory: 0, audit: 0 },
    });

    const all = await searchDocuments(db.em.fork(), phrase, {
      orgId: db.seed.orgId,
      projectId: currentProjectId,
      scope: "all",
      limit: 10,
    });
    expect(new Set(all.map((hit) => hit.source_id))).toEqual(new Set(["current-task", "other-task", "global-doc"]));

    const global = await searchDocuments(db.em.fork(), phrase, {
      orgId: db.seed.orgId,
      projectId: currentProjectId,
      scope: "global",
      limit: 10,
    });
    expect(global.map((hit) => hit.source_id)).toEqual(["global-doc"]);
    expect(global[0]).toMatchObject({
      projectId: null,
      scope: "global",
      provenance: { entityKind: "task", entityId: "global-doc", projectId: null },
    });
  });

  test("scores partial term matches, source-kind filters, linked counts, and saved search upsert", async () => {
    db = await createTestOrm();
    const em = db.em.fork();
    const phrase = `workflow-${crypto.randomUUID()}`;
    const projectId = `project-${crypto.randomUUID()}`;

    em.persist(em.create(SearchDocument, {
      org: em.getReference(Org, db.seed.orgId),
      entityKind: "doc",
      entityId: "doc-full",
      title: `Alpha ${phrase}`,
      body: "beta gamma",
      projectId,
      labels: ["docs"],
      metadata: { linkedCounts: { docs: 2, artifacts: 1, memory: 3, audit: "ignored" } },
      updatedAt: new Date("2026-05-09T00:00:00.000Z"),
    }));
    em.persist(em.create(SearchDocument, {
      org: em.getReference(Org, db.seed.orgId),
      entityKind: "task",
      entityId: "task-partial",
      title: `Alpha ${phrase}`,
      body: "unrelated",
      projectId,
      labels: ["tasks"],
      metadata: {},
      updatedAt: new Date("2026-05-10T00:00:00.000Z"),
    }));
    await em.flush();

    const hits = await searchDocuments(db.em.fork(), `alpha beta ${phrase}`, {
      orgId: db.seed.orgId,
      projectId,
      scope: "current",
      sourceKinds: ["doc"],
      limit: 5,
    });

    expect(hits.map((hit) => hit.source_id)).toEqual(["doc-full"]);
    expect(hits[0]!.score).toBeGreaterThan(0);
    expect(hits[0]!.linkedCounts).toEqual({ docs: 2, runs: 0, artifacts: 1, memory: 3, audit: 0 });

    const ctx = { orgId: db.seed.orgId, userId: db.seed.userId, projectId };
    const ownerOne = db.seed.userId;
    await saveSearch(db.em.fork(), ctx, {
      owner: ownerOne,
      name: "Mine",
      params: { q: "alpha", kinds: ["doc"], dateFrom: "2026-05-01", dateTo: "2026-05-31" },
    });
    await saveSearch(db.em.fork(), ctx, {
      owner: ownerOne,
      name: "Mine",
      params: { q: "beta", kinds: ["task"], dateFrom: "", dateTo: "" },
    });
    const saved = await listSavedSearches(db.em.fork(), ctx, ownerOne);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      name: "Mine",
      params: { q: "beta", kinds: ["task"], dateFrom: "", dateTo: "" },
    });
  });
});
