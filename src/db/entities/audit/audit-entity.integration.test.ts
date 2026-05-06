import { afterEach, describe, expect, it } from "bun:test";

import { createTestOrm, type TestOrm } from "../../../test-utils/db.ts";
import { Org } from "../auth/Org.ts";
import { AuditEvent, AuditExport } from "./index.ts";

let db: TestOrm | undefined;

afterEach(async () => {
  await db?.close();
  db = undefined;
});

async function setup(): Promise<{ db: TestOrm; org: Org }> {
  db = await createTestOrm();
  const org = await db.em.findOneOrFail(Org, { id: db.seed.orgId });
  return { db, org };
}

describe("audit MikroORM entities", () => {
  it("persists and reloads AuditEvent with org/project FK", async () => {
    const { db, org } = await setup();

    const event = db.em.create(AuditEvent, {
      org,
      projectId: "project-audit",
      actorId: "user-1",
      action: "task.created",
      subjectKind: "task",
      subjectId: "task-1",
      payload: { title: "Audit me" },
    });

    await db.em.persistAndFlush(event);
    db.em.clear();

    const reloaded = await db.em.findOneOrFail(AuditEvent, {
      action: "task.created",
    }, { populate: ["org"] });

    expect(reloaded.org.id).toBe(org.id);
    expect(reloaded.projectId).toBe("project-audit");
  });

  it("persists and reloads AuditExport with org/project FK", async () => {
    const { db, org } = await setup();

    const auditExport = db.em.create(AuditExport, {
      org,
      projectId: "project-audit",
      requestedByUserId: "user-1",
      status: "pending",
      format: "jsonl",
      filters: { subjectKind: "task" },
    });

    await db.em.persistAndFlush(auditExport);
    db.em.clear();

    const reloaded = await db.em.findOneOrFail(AuditExport, {
      requestedByUserId: "user-1",
    }, { populate: ["org"] });

    expect(reloaded.org.id).toBe(org.id);
    expect(reloaded.projectId).toBe("project-audit");
  });
});
