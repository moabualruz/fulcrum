import { describe, expect, test } from "bun:test";

import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm } from "@test-support/application-database.ts";
import { AppNotFoundError, AppValidationError } from "@platform-core/domain/errors.ts";
import { Event } from "@platform-core/infrastructure/application-database/entities/core/Event.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { recordAuditEvent } from "@workflow-coordination/application/audit/commands.ts";
import { getAuditEvent, queryAuditEvents } from "@workflow-coordination/application/audit/queries.ts";

const ctx = { orgId: DEFAULT_ORG_ID, userId: "user-audit", projectId: "22222222-2222-4222-8222-222222222222" };

describe("application audit", () => {
  test("handles CRUD, not-found, validation, and scoping", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const event = await recordAuditEvent(em, ctx, { action: "created", subjectKind: "task", subjectId: "33333333-3333-4333-8333-333333333333" });
      expect((await queryAuditEvents(em, ctx, { subjectKind: "task" })).items).toHaveLength(1);
      await expect(getAuditEvent(em, ctx, event.id)).resolves.toMatchObject({ id: event.id });
      await expect(getAuditEvent(em, ctx, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).rejects.toBeInstanceOf(AppNotFoundError);
      await expect(recordAuditEvent(em, ctx, { action: "", subjectKind: "", subjectId: "" })).rejects.toBeInstanceOf(AppValidationError);
    } finally {
      await db.close();
    }
  });

  test("projects state-transition AuditEntry fields with causation linkage", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const org = await em.findOneOrFail(Org, { where: { id: DEFAULT_ORG_ID } });
      const event = await em.save(Event, {
        org,
        actor: "system",
        projectId: ctx.projectId,
        verb: "status_changed",
        subjectKind: "task",
        subjectId: "task-audit-state",
        fieldName: "status",
        fromValue: "in_progress",
        toValue: "blocked",
        payload: {
          causation_id: "task:task-audit-state:status:in_progress->blocked",
          before: { status: "in_progress" },
          after: { status: "blocked" },
        },
      });

      await expect(queryAuditEvents(em, ctx, { subjectKind: "task", verb: "status_changed" })).resolves.toMatchObject({
        items: [{
          id: event.id,
          verb: "status_changed",
          subjectKind: "task",
          subjectId: "task-audit-state",
          causationId: "task:task-audit-state:status:in_progress->blocked",
          fieldName: "status",
          before: "in_progress",
          after: "blocked",
        }],
      });
    } finally {
      await db.close();
    }
  });
});
