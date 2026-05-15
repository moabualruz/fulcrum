import { afterEach, describe, expect, it } from "bun:test";
import type { EntityManager } from "typeorm";

import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { AuditEvent, AuditExport } from "./index.ts";

let db: TestOrm | undefined;

afterEach(async () => {
  await db?.close();
  db = undefined;
});

async function setup(): Promise<{ db: TestOrm; em: EntityManager; org: Org }> {
  db = await createTestOrm();
  const em = db.orm.em;
  const org = await em.findOneOrFail(Org, { id: db.seed.orgId });
  return { db, em, org };
}

describe("audit MikroORM entities", () => {
  it("persists and reloads AuditEvent with org/project FK", async () => {
    const { em, org } = await setup();

    const event = em.create(AuditEvent, {
      org,
      projectId: "project-audit",
      actorId: "user-1",
      action: "task.created",
      subjectKind: "task",
      subjectId: "task-1",
      payload: { title: "Audit me" },
    });

    await em.save(event);
    em.clear();

    const reloaded = await em.findOneOrFail(AuditEvent, {
      action: "task.created",
    }, { populate: ["org"] });

    expect(reloaded.org.id).toBe(org.id);
    expect(reloaded.projectId).toBe("project-audit");
  });

  it("persists and reloads AuditExport with org/project FK", async () => {
    const { em, org } = await setup();

    const auditExport = em.create(AuditExport, {
      org,
      projectId: "project-audit",
      requestedByUserId: "user-1",
      status: "pending",
      format: "jsonl",
      filters: { subjectKind: "task" },
    });

    await em.save(auditExport);
    em.clear();

    const reloaded = await em.findOneOrFail(AuditExport, {
      requestedByUserId: "user-1",
    }, { populate: ["org"] });

    expect(reloaded.org.id).toBe(org.id);
    expect(reloaded.projectId).toBe("project-audit");
  });
});
