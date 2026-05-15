import { describe, expect, test } from "bun:test";

import { Task } from "@work-management/infrastructure/database/entities/tasks/Task.ts";
import { createTestOrm } from "@test-support/application-database.ts";
import { createTask } from "@work-management/application/work-item-commands.ts";
import { buildManualTaskWorkbench } from "@work-management/application/manual-task-workbench.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const PROJECT_ID = "99999999-9999-4999-8999-999999999999";
const OTHER_PROJECT_ID = "88888888-8888-4888-8888-888888888888";

describe("manual task workbench action", () => {
  test("builds manual board, list, and table views from real project tasks", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      await em.getConnection().execute(
        `insert into projects (id, org_id, name) values (?, ?, ?), (?, ?, ?)`,
        [PROJECT_ID, ORG_ID, "Manual work management", OTHER_PROJECT_ID, ORG_ID, "Other Project"],);
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      const backlog = await createTask(em, ctx, {
        title: "Collect product intake",
        status: "backlog",
        projectId: PROJECT_ID,
        priority: 1,
        points: 2,
        cycleId: "cycle-foundation",
        moduleId: "module-docs",
        taskType: "story",
      });
      const started = await createTask(em, ctx, {
        title: "Build manual board",
        status: "in_progress",
        projectId: PROJECT_ID,
        priority: 3,
        points: 5,
        assigneeId: "11111111-1111-4111-8111-111111111111",
        cycleId: "cycle-foundation",
        moduleId: "module-workbench",
        taskType: "task",
      });
      const completed = await createTask(em, ctx, {
        title: "Publish operator docs",
        status: "completed",
        projectId: PROJECT_ID,
        priority: 2,
        points: 3,
        cycleId: "cycle-docs",
        moduleId: "module-docs",
      });
      await createTask(em, {...ctx, projectId: OTHER_PROJECT_ID }, {
        title: "Hidden other project task",
        status: "in_progress",
        projectId: OTHER_PROJECT_ID,
      });
      await setTaskLabels(em, backlog.id, ["intake"]);
      await setTaskLabels(em, started.id, ["agent", "ux"]);
      await setTaskLabels(em, completed.id, ["docs"]);
      em.clear();

      const workbench = await buildManualTaskWorkbench(em, ctx, {
        projectId: PROJECT_ID,
        traceId: "trace-manual-workbench",
        viewMode: "board",
        filters: {
          stateGroups: ["started"],
          labels: ["agent"],
          cycleIds: ["cycle-foundation"],
          moduleIds: ["module-workbench"],
        },
        projectCapabilities: { estimateEnabled: false },
      });

      expect(workbench).toMatchObject({
        projectId: PROJECT_ID,
        traceId: "trace-manual-workbench",
        viewMode: "board",
        layout: "kanban",
        filtersApplied: 4,
        accessSpecifiers: [
          { key: "PUBLIC", i18nLabel: "common.access.public" },
          { key: "PRIVATE", i18nLabel: "common.access.private" },
        ],
      });
      expect(workbench.columns.map((column) => column.group)).toEqual([
        "backlog",
        "unstarted",
        "started",
        "completed",
        "cancelled",
      ]);
      expect(workbench.columns.find((column) => column.group === "started")).toMatchObject({
        label: "Started",
        color: "#f59e0b",
        taskIds: [started.id],
        count: 1,
      });
      expect(workbench.columns.find((column) => column.group === "backlog")?.taskIds).toEqual([]);
      expect(workbench.listRows).toEqual([
        expect.objectContaining({
          id: started.id,
          title: "Build manual board",
          traceId: "trace-manual-workbench",
          stateGroup: "started",
          labels: ["agent", "ux"],
          cycleId: "cycle-foundation",
          moduleId: "module-workbench",
          points: 5,
        }),
      ]);
      expect(workbench.table.visibleColumns.map((column) => column.key)).toEqual([
        "title",
        "state",
        "priority",
        "assignee",
        "labels",
        "cycle",
        "module",
        "updated",
      ]);
      expect(workbench.table.rows).toEqual([
        expect.objectContaining({
          id: started.id,
          cells: expect.objectContaining({
            title: "Build manual board",
            state: "Started",
            labels: "agent, ux",
            cycle: "cycle-foundation",
            module: "module-workbench",
          }),
        }),
      ]);
    } finally {
      await db.close();
    }
  });
});

async function setTaskLabels(em: Awaited<ReturnType<typeof createTestOrm>>["em"], id: string, labels: string[]): Promise<void> {
  const task = await em.findOneOrFail(Task, { id } as never);
  task.labels = labels;
  /* flushed */
}
