import { afterEach, describe, expect, test } from "bun:test";

import { Org } from "../../db/entities/auth/Org.ts";
import { SearchDocument } from "../../db/entities/search/SearchDocument.ts";
import { createTestOrm, type TestOrm } from "../../test-utils/index.ts";
import { searchDocuments } from "./queries.ts";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

describe("phase 9.6 scoped search", () => {
  test("defaults to current project but can explicitly search all projects and global docs", async () => {
    db = await createTestOrm();
    const em = db.em.fork();
    const currentProjectId = `project-${crypto.randomUUID()}`;
    const otherProjectId = `project-${crypto.randomUUID()}`;
    const phrase = `phase96-${crypto.randomUUID()}`;

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
        labels: ["phase96"],
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
});
