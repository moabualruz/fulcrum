import { afterEach, describe, expect, test } from "bun:test";

import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { listArtifacts } from "@workflow-coordination/application/artifacts/queries.ts";
import { getDoc, listDocs } from "@knowledge-workspace/application/docs/queries.ts";
import { getTask, listTasks } from "@work-management/application/work-item-queries.ts";
import {
  buildApprovedPlanBreakdown,
  materializeApprovedPlanBreakdownWithApplicationCommands,
} from "@planning-review/application/approved-plan-breakdown.ts";

const PROJECT_ID = "99999999-9999-4999-8999-999999999999";
const USER_ID = "user-approved-plan";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  await db.em.getConnection().execute(
    `INSERT INTO projects (id, org_id, slug, name, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, now(), now())`,
    [
      PROJECT_ID,
      DEFAULT_ORG_ID,
      "approved-plan-project",
      "Approved Plan Project",
      "Approved plan breakdown materialization",
    ],
  );
  return db;
}

describe("approved plan breakdown command materialization", () => {
  test("persists approved plan docs, tasks, and dependency edges with real PGlite data", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const ctx = { orgId: DEFAULT_ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
    const breakdown = buildApprovedPlanBreakdown({
      planId: "plan-real",
      reviewId: "review-real",
      traceId: "trace-real",
      projectId: PROJECT_ID,
      cycleId: "cycle-real",
      moduleId: "module-real",
      sourceDocRefs: [{ kind: "doc", id: "freeform-source" }],
      approvedPlanMarkdown: `# Build Real Workflow

## Prototype / Boilerplate
- [prototype] apps/web/src/features/workflows/Workbench.tsx

## Success Criteria
- User can approve a plan and see generated tasks.

## Tasks
- [T1] Persist planning docs
  Depends on: none
  Success: Approved plan docs are queryable.
- [T2] Persist task dependency
  Depends on: T1
  Success: Dependency edges use real created task ids.
`,
    });

    const result = await materializeApprovedPlanBreakdownWithApplicationCommands(em, ctx, breakdown);

    expect(result.docs.map((doc) => doc.clientKey)).toEqual([
      "plan-doc",
      "success-criteria-doc",
      "prototype-1-doc",
    ]);
    expect(result.artifacts).toEqual([
      expect.objectContaining({
        kind: "prototype",
        path: "apps/web/src/features/workflows/Workbench.tsx",
        title: "Workbench.tsx",
        traceId: "trace-real",
        sourcePlanId: "plan-real",
      }),
    ]);
    expect(result.tasks.map((task) => task.clientKey)).toEqual(["T1", "T2", "verify-end-to-end"]);
    expect(result.dependencyUpdates).toEqual([
      {
        taskClientKey: "T2",
        taskId: result.tasks[1]!.id,
        blockedByClientKeys: ["T1"],
        blockedByTaskIds: [result.tasks[0]!.id],
      },
      {
        taskClientKey: "verify-end-to-end",
        taskId: result.tasks[2]!.id,
        blockedByClientKeys: ["T2"],
        blockedByTaskIds: [result.tasks[1]!.id],
      },
    ]);

    expect((await listDocs(em, ctx)).map((doc) => doc.title).sort()).toEqual([
      "Build Real Workflow",
      "Build Real Workflow success criteria",
      "Workbench.tsx",
    ].sort());
    await expect(getDoc(em, ctx, result.docs[0]!.id)).resolves.toMatchObject({
      title: "Build Real Workflow",
      bodyMd: expect.stringContaining("## Tasks"),
    });

    const tasks = await listTasks(em, ctx);
    expect(tasks.map((task) => task.title).sort()).toEqual([
      "Persist planning docs",
      "Persist task dependency",
      "Verify end-to-end",
    ].sort());
    const firstTask = await getTask(em, ctx, result.tasks[0]!.id);
    const secondTask = await getTask(em, ctx, result.tasks[1]!.id);
    const verifyTask = await getTask(em, ctx, result.tasks[2]!.id);
    expect(firstTask.descriptionText).toContain("Trace ID: trace-real");
    expect(firstTask.descriptionText).toContain("apps/web/src/features/workflows/Workbench.tsx");
    expect(firstTask.cycleId).toBe("cycle-real");
    expect(firstTask.moduleId).toBe("module-real");
    expect(secondTask.dependencies.blocked_by).toEqual([firstTask.id]);
    expect(firstTask.dependencies.blocks).toEqual([secondTask.id]);
    expect(verifyTask.dependencies.blocked_by).toEqual([secondTask.id]);

    const artifacts = await listArtifacts(em, ctx);
    expect(artifacts).toEqual([
      expect.objectContaining({
        id: result.artifacts[0]!.id,
        filename: "Workbench.tsx",
        path: "apps/web/src/features/workflows/Workbench.tsx",
        mime: "text/x-typescript",
        metadataJson: expect.objectContaining({
          kind: "prototype",
          traceId: "trace-real",
          sourcePlanId: "plan-real",
          workflowStage: "approved_plan_artifact",
        }),
      }),
    ]);

    const docLinks = await em.getConnection().execute<Array<{ to_slug: string; link_kind: string }>>(
      `select to_slug, link_kind from doc_links where org_id = ? order by to_slug`,
      [DEFAULT_ORG_ID],
    );
    expect(docLinks).toEqual([
      { to_slug: "doc:freeform-source", link_kind: "mention" },
      { to_slug: "review:review-real", link_kind: "mention" },
    ]);
  });
});
