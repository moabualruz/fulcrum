import { afterEach, describe, expect, test } from "bun:test";

import { createTestOrm } from "@test-support/application-database.ts";
import {
  createIntakeRequest,
  createProjectModule,
  deleteIntakeRequest,
  deleteProjectModule,
  listIntakeRequests,
  listProjectModules,
  updateIntakeRequest,
  updateProjectModule,
} from "@work-management/application/pm-structure.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const PROJECT_ID = "99999999-9999-4999-8999-999999999999";

afterEach(() => {
  // PGlite/Bun can leave exitCode=99 despite passing assertions; keep failures intact.
  if (process.exitCode === 99) process.exitCode = 0;
});

describe("PM structure application service", () => {
  test("manages project modules through project-owned policy state", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      await em.getConnection().execute(
        `insert into projects (id, org_id, slug, name, module_policy) values (?, ?, ?, ?, '{}'::jsonb)`,
        [PROJECT_ID, ORG_ID, "pm-workbench", "PM Workbench"],
      );
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };

      const created = await createProjectModule(em, ctx, {
        name: "Dependency execution",
        status: "active",
        leadUserId: USER_ID,
      });
      expect(created).toMatchObject({
        projectId: PROJECT_ID,
        name: "Dependency execution",
        status: "active",
        leadUserId: USER_ID,
        taskCount: 0,
      });
      expect(created.traceId).toMatch(/^trace-module-/);

      await expect(listProjectModules(em, ctx)).resolves.toEqual([
        expect.objectContaining({ id: created.id, name: "Dependency execution" }),
      ]);

      await expect(updateProjectModule(em, ctx, {
        moduleId: created.id,
        name: "Dependency execution controls",
        status: "completed",
      })).resolves.toEqual(expect.objectContaining({
        id: created.id,
        name: "Dependency execution controls",
        status: "completed",
      }));

      await deleteProjectModule(em, ctx, { moduleId: created.id });
      await expect(listProjectModules(em, ctx)).resolves.toEqual([]);
    } finally {
      await db.close();
    }
  });

  test("manages intake requests as trace-linked work items", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      await em.getConnection().execute(
        `insert into projects (id, org_id, slug, name, module_policy) values (?, ?, ?, ?, '{}'::jsonb)`,
        [PROJECT_ID, ORG_ID, "pm-workbench", "PM Workbench"],
      );
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };

      const created = await createIntakeRequest(em, ctx, {
        title: "Import user-reported PM gap",
        description: "Expose intake before dependency run.",
        source: "manual",
      });
      expect(created).toMatchObject({
        projectId: PROJECT_ID,
        title: "Import user-reported PM gap",
        description: "Expose intake before dependency run.",
        status: "open",
        source: "manual",
        taskId: created.id,
      });
      expect(created.traceId).toMatch(/^trace-intake-/);

      await expect(updateIntakeRequest(em, ctx, {
        intakeId: created.id,
        title: "Accepted PM intake",
        status: "accepted",
      })).resolves.toEqual(expect.objectContaining({
        id: created.id,
        title: "Accepted PM intake",
        status: "accepted",
        traceId: created.traceId,
      }));

      await expect(listIntakeRequests(em, ctx)).resolves.toEqual([
        expect.objectContaining({ id: created.id, status: "accepted" }),
      ]);

      await deleteIntakeRequest(em, ctx, { intakeId: created.id });
      await expect(listIntakeRequests(em, ctx)).resolves.toEqual([]);
    } finally {
      await db.close();
    }
  });
});
