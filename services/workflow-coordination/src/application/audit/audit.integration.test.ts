import { describe, expect, test } from "bun:test";

import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm } from "@test-support/application-database.ts";
import { AppNotFoundError, AppValidationError } from "@platform-core/domain/errors.ts";
import { recordAuditEvent } from "@workflow-coordination/application/audit/commands.ts";
import { getAuditEvent, queryAuditEvents } from "@workflow-coordination/application/audit/queries.ts";

const ctx = { orgId: DEFAULT_ORG_ID, userId: "user-audit", projectId: "22222222-2222-4222-8222-222222222222" };

describe("application audit", () => {
  test("handles CRUD, not-found, validation, and scoping", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const event = await recordAuditEvent(em, ctx, { action: "created", subjectKind: "task", subjectId: "33333333-3333-4333-8333-333333333333" });
      expect((await queryAuditEvents(em, ctx, { subjectKind: "task" })).items).toHaveLength(1);
      await expect(getAuditEvent(em, ctx, event.id)).resolves.toMatchObject({ id: event.id });
      await expect(getAuditEvent(em, ctx, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).rejects.toBeInstanceOf(AppNotFoundError);
      await expect(recordAuditEvent(em, ctx, { action: "", subjectKind: "", subjectId: "" })).rejects.toBeInstanceOf(AppValidationError);
    } finally {
      await db.close();
    }
  });
});
